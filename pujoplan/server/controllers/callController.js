const { StreamClient } = require('@stream-io/node-sdk');
const jwt = require('jsonwebtoken');
const { emitGroupUpdate, emitToUser } = require('../services/socketService');
const Call = require('../models/Call');
const Group = require('../models/Group');

const STREAM_API_KEY = process.env.STREAM_API_KEY || 'bazavn2fpwsf';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'y5wbvp69z4m25cvbyz2zvyc3wtjxp3rgya5w5j46k62xds58y3q5u5sbqsz4cqpy';

let streamClientInstance = null;
function getStreamClient() {
  if (!streamClientInstance) {
    streamClientInstance = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);
  }
  return streamClientInstance;
}

/**
 * POST /api/calls/token or /api/calls/stream-token
 * Generate short-lived Stream Video token for authenticated user and initialize call
 */
async function generateStreamToken(req, res, next) {
  try {
    const user = req.user || {};
    let { groupId, callId } = req.body;

    const rawUid = user.id || user.uid || user._id || 'user_' + Date.now();
    // Stream user IDs must only contain alphanumeric, underscore, or hyphen characters
    const userId = String(rawUid).replace(/[^a-zA-Z0-9_-]/g, '_');
    const userName = user.name || 'Group Member';
    const userImage = user.profileImage || undefined;

    const client = getStreamClient();

    // Upsert user on Stream
    await client.upsertUsers([
      {
        id: userId,
        name: userName,
        image: userImage,
        role: 'user',
      },
    ]).catch((e) => {
      console.warn('[Stream] upsertUsers warning:', e.message);
    });

    // Generate user token (valid for 24 hours)
    const token = client.generateUserToken({ user_id: userId });

    // Derive Stream call ID from groupId or callId
    const targetCallId = String(callId || (groupId ? `group_${groupId}` : 'pujo_call_' + Date.now()))
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    // Pre-create or get call on Stream
    try {
      const call = client.video.call('default', targetCallId);
      await call.getOrCreate({
        data: {
          created_by_id: userId,
          custom: {
            groupId: groupId || '',
          },
        },
      });
    } catch (e) {
      console.warn('[Stream] call.getOrCreate warning:', e.message);
    }

    return res.json({
      token,
      apiKey: STREAM_API_KEY,
      userId,
      userName,
      userImage,
      callId: targetCallId,
      callType: 'default',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/calls/status or /api/groups/:id/call/status
 */
async function getCallStatus(req, res, next) {
  try {
    const groupId = req.params.id || req.query.groupId;
    if (!groupId) return res.json({ active: false, call: null });

    const call = await Call.findOne({ groupId, status: { $ne: 'ended' } });
    if (!call || call.status === 'ended') {
      return res.json({ active: false, call: null });
    }

    // Auto-timeout stale calls that have been 'ringing' for > 60 seconds without acceptance
    const callAge = Date.now() - new Date(call.updatedAt || call.createdAt).getTime();
    if (call.status === 'ringing' && callAge > 60000) {
      call.status = 'ended';
      await call.save().catch(() => {});
      return res.json({ active: false, call: null });
    }

    const grp = await Group.findOne({ id: groupId }).select('name').catch(() => null);

    return res.json({
      active: true,
      groupId: call.groupId,
      groupName: grp?.name || 'Puja Group',
      callMode: call?.type || 'video',
      status: call?.status || 'ringing',
      startedBy: call?.caller || null,
      caller: call?.caller || null,
      startedAt: call?.createdAt ? new Date(call.createdAt).getTime() : Date.now(),
      participants: (call?.candidates || []).map(c => ({
        id: c.userId || c.id,
        name: c.name || 'Member',
        profileImage: c.profileImage || null,
      })),
      call: call || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/calls/signal or /api/groups/:id/call/signal
 * Socket.io + Database call state signaling
 */
async function handleCallSignal(req, res, next) {
  try {
    const groupId = req.params.id || req.body.groupId;
    const { type, channelName, callId, callMode = 'video', targetUserId, status } = req.body;
    const user = req.user || {};

    const callerObj = {
      id: user.id || user.uid || 'user_' + Date.now(),
      userId: user.id || user.uid || 'user_' + Date.now(),
      name: user.name || 'Group Member',
      profileImage: user.profileImage || null,
      email: user.email || null,
    };

function isGenericEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const e = email.toLowerCase().trim();
  return (
    !e ||
    e === 'user@pujoplan.app' ||
    e === 'demo@pujoplan.dev' ||
    e === 'anonymous' ||
    e.endsWith('@pujoplan.app') ||
    e.endsWith('@pujoplan.dev') ||
    !e.includes('@')
  );
}

function isInvalidUid(uid) {
  if (!uid || typeof uid !== 'string') return true;
  const u = uid.trim().toLowerCase();
  return !u || u === 'local-user' || u === 'anonymous' || u === 'undefined' || u === 'null' || u.startsWith('guest_');
}

    const targetCallId = callId || channelName || `group_${groupId}`;
    const grp = await Group.findOne({ id: groupId }).catch(() => null);
    const groupName = grp?.name || 'Puja Group';

    // Helper to gather all member identifiers for direct targeted delivery
    const getMemberIdentifiers = () => {
      const ids = new Set();
      if (!grp) return ids;
      if (grp.adminId && !isInvalidUid(grp.adminId)) ids.add(grp.adminId);
      if (grp.admin?.id && !isInvalidUid(grp.admin.id)) ids.add(grp.admin.id);
      if (Array.isArray(grp.memberUids)) {
        grp.memberUids.forEach(uid => {
          if (uid && !isInvalidUid(uid) && !isGenericEmail(uid)) ids.add(uid);
        });
      }
      if (Array.isArray(grp.members)) {
        grp.members.forEach(m => {
          if (m.userId && !isInvalidUid(m.userId)) ids.add(m.userId);
          if (m.user?.id && !isInvalidUid(m.user.id)) ids.add(m.user.id);
          const mEmail = m.user?.email || m.email;
          if (mEmail && !isGenericEmail(mEmail)) ids.add(`email:${mEmail.toLowerCase().trim()}`);
        });
      }
      if (grp.admin?.email && !isGenericEmail(grp.admin.email)) {
        ids.add(`email:${grp.admin.email.toLowerCase().trim()}`);
      }
      return ids;
    };

    if (type === 'start' || type === 'startCall' || type === 'call_started') {
      let call = await Call.findOne({ groupId });
      if (!call) {
        call = new Call({
          groupId,
          type: callMode,
          status: 'ringing',
          caller: callerObj,
          candidates: [callerObj],
        });
      } else {
        call.status = 'ringing';
        call.type = callMode;
        call.caller = callerObj;
        call.candidates = [callerObj];
      }
      await call.save();

      const callPayload = {
        groupId,
        groupName,
        callId: targetCallId,
        channelName: targetCallId,
        callMode,
        caller: callerObj,
        startedBy: callerObj,
        startedAt: Date.now(),
        targetUserId: targetUserId || 'all',
        status: 'ringing',
      };

      console.log(`[CallController] 📞 Broadcasting incoming call in "${groupName}" (${groupId}) by ${callerObj.name}`);
      // 1. Emit to group socket room
      emitGroupUpdate(groupId, 'incomingCall', callPayload);
      emitGroupUpdate(groupId, 'call_signal', {
        ...callPayload,
        type: 'start',
      });

      // 2. Emit directly to each individual group member's socket room
      const memberIds = getMemberIdentifiers();
      memberIds.forEach((uid) => {
        emitToUser(uid, 'incomingCall', callPayload);
        emitToUser(uid, 'call_signal', {
          ...callPayload,
          type: 'start',
        });
      });
    } else if (type === 'accept' || type === 'acceptCall') {
      const call = await Call.findOne({ groupId });
      if (call) {
        call.status = 'active';
        if (!call.candidates.some(c => (c.id || c.userId) === callerObj.id)) {
          call.candidates.push(callerObj);
        }
        await call.save();
      }

      const acceptPayload = {
        groupId,
        groupName,
        callId: targetCallId,
        channelName: targetCallId,
        callee: callerObj,
        status: 'active',
      };

      emitGroupUpdate(groupId, 'callAccepted', acceptPayload);
      emitGroupUpdate(groupId, 'call_signal', {
        ...acceptPayload,
        type: 'accept',
      });

      const memberIds = getMemberIdentifiers();
      memberIds.forEach((uid) => {
        emitToUser(uid, 'callAccepted', acceptPayload);
      });
    } else if (type === 'decline' || type === 'declineCall') {
      emitGroupUpdate(groupId, 'callDeclined', {
        groupId,
        callId: targetCallId,
        channelName: targetCallId,
        callee: callerObj,
        reason: req.body.reason || 'declined',
      });

      emitGroupUpdate(groupId, 'call_signal', {
        groupId,
        type: 'decline',
        callId: targetCallId,
        channelName: targetCallId,
        status: 'declined',
      });
    } else if (type === 'leave') {
      const call = await Call.findOne({ groupId });
      if (call) {
        call.candidates = (call.candidates || []).filter(c => (c.id || c.userId) !== callerObj.id);
        if (call.candidates.length === 0) {
          call.status = 'ended';
        }
        await call.save();
      }

      emitGroupUpdate(groupId, 'call_signal', {
        groupId,
        type: 'user_left',
        callId: targetCallId,
        channelName: targetCallId,
        userId: callerObj.id,
      });

      if (!call || (call.candidates && call.candidates.length === 0)) {
        const endPayload = {
          groupId,
          callId: targetCallId,
          channelName: targetCallId,
          senderId: callerObj.id,
        };
        emitGroupUpdate(groupId, 'callEnded', endPayload);
        const memberIds = getMemberIdentifiers();
        memberIds.forEach((uid) => {
          emitToUser(uid, 'callEnded', endPayload);
        });
      }
    } else if (type === 'end' || type === 'endCall') {
      await Call.findOneAndUpdate(
        { groupId },
        { status: 'ended', candidates: [] }
      );

      const endPayload = {
        groupId,
        callId: targetCallId,
        channelName: targetCallId,
        senderId: callerObj.id,
      };

      emitGroupUpdate(groupId, 'callEnded', endPayload);
      emitGroupUpdate(groupId, 'call_signal', {
        groupId,
        type: 'ended',
        callId: targetCallId,
        channelName: targetCallId,
        status: 'ended',
      });

      const memberIds = getMemberIdentifiers();
      memberIds.forEach((uid) => {
        emitToUser(uid, 'callEnded', endPayload);
      });
    }

    return res.json({ success: true, callId: targetCallId });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/calls/check-active?userId=...
 * Check if there is an active incoming call ringing for the specified user in any of their groups
 */
async function checkActiveCallsForUser(req, res) {
  try {
    let userId = req.query.userId || req.user?.id || req.user?.uid;
    let userEmail = req.query.email ? String(req.query.email).trim().toLowerCase() : (req.user?.email ? String(req.user.email).trim().toLowerCase() : null);

    if (isInvalidUid(userId)) userId = null;
    if (isGenericEmail(userEmail)) userEmail = null;

    // If not in query or req.user, check Authorization header if present
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.slice(7).trim();
        const jwtPayload = jwt.decode(token);
        if (jwtPayload) {
          const jwtUid = jwtPayload.uid || jwtPayload.id || jwtPayload.sub;
          if (!isInvalidUid(jwtUid)) userId = jwtUid;
          if (!userEmail && jwtPayload.email && !isGenericEmail(jwtPayload.email)) {
            userEmail = String(jwtPayload.email).trim().toLowerCase();
          }
        }
      } catch (_) {}
    }

    if (!userId && !userEmail) {
      return res.json({ hasCall: false, reason: 'missing_user_id' });
    }

    const now = Date.now();
    // Find all active or ringing calls
    const calls = await Call.find({ status: { $in: ['ringing', 'active'] } }).lean();
    if (!calls || calls.length === 0) {
      return res.json({ hasCall: false });
    }

    for (const call of calls) {
      const callTime = new Date(call.updatedAt || call.createdAt).getTime();

      // Auto-expire ringing calls older than 45s
      if (call.status === 'ringing' && (now - callTime) > 45000) {
        Call.updateOne({ _id: call._id }, { status: 'ended' }).exec().catch(() => {});
        continue;
      }
      // Auto-expire active calls older than 30 mins
      if (call.status === 'active' && (now - callTime) > 30 * 60 * 1000) {
        Call.updateOne({ _id: call._id }, { status: 'ended' }).exec().catch(() => {});
        continue;
      }

      // If caller is the user themselves, skip
      const callerId = call.caller?.id || call.caller?.userId;
      const callerEmail = (call.caller?.email && !isGenericEmail(call.caller.email)) ? String(call.caller.email).toLowerCase().trim() : null;
      if ((userId && callerId === userId) || (userEmail && callerEmail && userEmail === callerEmail)) {
        continue;
      }

      // Check if user is already participating in this call
      if (Array.isArray(call.candidates) && call.candidates.some(c => (c.id || c.userId) === userId || (userEmail && c.email && !isGenericEmail(c.email) && c.email.toLowerCase() === userEmail))) {
        continue;
      }

      // Check if user belongs to call.groupId
      const grp = await Group.findOne({ id: call.groupId }).select('id name adminId admin memberUids members').lean();
      if (!grp) continue;

      const adminEmail = (grp.admin?.email && !isGenericEmail(grp.admin.email)) ? String(grp.admin.email).toLowerCase().trim() : null;
      const isMember =
        (userId && (grp.adminId === userId || grp.admin?.id === userId)) ||
        (userEmail && adminEmail && adminEmail === userEmail) ||
        (userId && Array.isArray(grp.memberUids) && grp.memberUids.includes(userId)) ||
        (Array.isArray(grp.members) && grp.members.some(m => {
          const mId = m.userId || m.id || m.user?.id;
          const mEmail = (m.user?.email || m.email) ? String(m.user?.email || m.email).toLowerCase().trim() : null;
          return (userId && mId && !isInvalidUid(mId) && mId === userId) ||
                 (userEmail && mEmail && !isGenericEmail(mEmail) && userEmail === mEmail);
        }));

      if (isMember) {
        return res.json({
          hasCall: true,
          call: {
            groupId: call.groupId,
            groupName: grp.name || 'Puja Group',
            callerName: call.caller?.name || 'Group Member',
            callerImage: call.caller?.profileImage || null,
            callMode: call.type || 'video',
            callId: `group_${call.groupId}`,
            status: call.status,
            startedAt: call.createdAt ? new Date(call.createdAt).getTime() : now,
          }
        });
      }
    }

    return res.json({ hasCall: false });
  } catch (err) {
    console.error('[checkActiveCallsForUser] error:', err.message);
    return res.json({ hasCall: false, error: err.message });
  }
}

module.exports = {
  generateStreamToken,
  generateAgoraToken: generateStreamToken, // alias for backward-compatibility
  getCallStatus,
  handleCallSignal,
  checkActiveCallsForUser,
};
