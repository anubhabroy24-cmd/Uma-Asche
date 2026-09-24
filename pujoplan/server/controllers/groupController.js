const Group = require('../models/Group');
const Message = require('../models/Message');
const Call = require('../models/Call');
const Presence = require('../models/Presence');
const { emitGroupUpdate } = require('../services/socketService');
const { nanoid, customAlphabet } = require('nanoid');

const numericInvite = customAlphabet('0123456789', 8);

// New invites are numeric keys. Older PJ_ payload tokens remain readable below.
function generateInviteToken(groupId, name, adminId) {
  return numericInvite();
}

function decodeInviteToken(token) {
  if (!token || !token.startsWith('PJ_')) return null;
  try {
    let b64 = token.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const jsonStr = Buffer.from(b64, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

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

function getUserIdentityKeys(user = {}) {
  const raw = [
    user.id,
    user.uid,
    user._id ? String(user._id) : null,
    user.firebaseUid,
  ].filter(Boolean);

  return raw
    .map((value) => String(value).trim())
    .filter((v) => !isInvalidUid(v));
}

function userMatchesMember(user, member) {
  if (!user || !member) return false;

  const userKeys = getUserIdentityKeys(user);
  const memberKeys = [
    member.userId,
    member.user?.id,
    member.user?.uid,
    member.user?.firebaseUid,
    member.id,
  ].filter(Boolean).map((value) => String(value).trim()).filter(k => !isInvalidUid(k));

  const sharedId = userKeys.some((key) => memberKeys.includes(key));
  if (sharedId) return true;

  const uEmail = (user.email || '').toLowerCase().trim();
  const mEmail = (member.user?.email || member.email || '').toLowerCase().trim();
  if (uEmail && mEmail && !isGenericEmail(uEmail) && !isGenericEmail(mEmail) && uEmail === mEmail) {
    return true;
  }

  return false;
}

function isUserInGroup(user, group) {
  if (!user || !group) return false;
  const uids = getUserIdentityKeys(user);
  const email = (user.email || '').toLowerCase().trim();
  const hasValidEmail = !isGenericEmail(email);

  const isGroupAdmin = uids.some(u => u === group.adminId || u === group.admin?.id) ||
    (hasValidEmail && group.admin?.email && group.admin.email.toLowerCase().trim() === email);
  if (isGroupAdmin) return true;

  const inMembers = (group.members || []).some(m => userMatchesMember(user, m));
  if (inMembers) return true;

  const inMemberUids = Array.isArray(group.memberUids) && (
    uids.some(u => group.memberUids.includes(u)) ||
    (hasValidEmail && group.memberUids.includes(email))
  );
  return inMemberUids;
}

/* ─────────────────── GROUPS ─────────────────── */

/** POST /api/groups */
async function createGroup(req, res, next) {
  try {
    const { name, region, visitDate, startLocation } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required.' });

    const groupId = 'grp_' + Date.now() + '_' + nanoid(6);
    const user = req.user;
    const inviteToken = generateInviteToken(groupId, name.trim(), user.id);

    const adminMember = {
      id: 'mem_admin_' + user.id,
      userId: user.id,
      role: 'admin',
      user: {
        id: user.id,
        name: user.name || 'Admin',
        email: user.email || '',
        profileImage: user.profileImage || null,
      },
      joinedAt: new Date(),
    };

    const group = await Group.create({
      id: groupId,
      name: name.trim().slice(0, 100),
      region: region || 'Kolkata',
      visitDate: (visitDate || '').trim(),
      startLocation: (startLocation || '').trim(),
      adminId: user.id,
      admin: {
        id: user.id,
        name: user.name || 'Admin',
        email: user.email || '',
        profileImage: user.profileImage || null,
      },
      members: [adminMember],
      memberUids: [user.id],
      spots: [],
      inviteToken,
    });

    return res.status(201).json(group.toClientJSON(user.id));
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups */
async function getMyGroups(req, res, next) {
  try {
    const user = req.user || {};
    const uids = getUserIdentityKeys(user);
    const email = (user.email || '').toLowerCase().trim();
    const hasValidEmail = !isGenericEmail(email);

    if (uids.length === 0 && !hasValidEmail) {
      return res.json([]);
    }

    const orConditions = [];
    if (uids.length > 0) {
      orConditions.push(
        { memberUids: { $in: uids } },
        { adminId: { $in: uids } },
        { 'admin.id': { $in: uids } },
        { 'members.userId': { $in: uids } },
        { 'members.user.id': { $in: uids } }
      );
    }

    if (hasValidEmail) {
      orConditions.push(
        { 'admin.email': { $regex: new RegExp(`^${email}$`, 'i') } },
        { 'members.user.email': { $regex: new RegExp(`^${email}$`, 'i') } }
      );
    }

    if (orConditions.length === 0) {
      return res.json([]);
    }

    const groups = await Group.find({ $or: orConditions }).sort({ updatedAt: -1 });
    const uid = uids[0] || user.id;
    const results = [];

    for (const group of groups) {
      // Strictly verify this user is truly authorized for this group (no leakage)
      if (!isUserInGroup(user, group)) {
        continue;
      }
      results.push(group.toClientJSON(uid));
    }

    return res.json(results);
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups/:id */
async function getGroupById(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const uids = getUserIdentityKeys(user);
    const email = (user.email || '').toLowerCase().trim();
    const hasValidEmail = !isGenericEmail(email);
    const uid = uids[0] || user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (!isUserInGroup(user, group)) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

    // Auto-sync current user's latest name and avatar ONLY if they already exist in group
    let modified = false;
    group.members = (group.members || []).map((m) => {
      const match = userMatchesMember(user, m);
      if (match) {
        if (user.name && user.name !== 'Explorer' && user.name !== 'User' && user.name !== 'Pujo Explorer' && m.user?.name !== user.name) {
          m.user = { ...(m.user || {}), name: user.name };
          modified = true;
        }
        if (user.profileImage && m.user?.profileImage !== user.profileImage) {
          m.user = { ...(m.user || {}), profileImage: user.profileImage };
          modified = true;
        }
      }
      return m;
    });

    const isGroupAdmin = uids.some(u => u === group.adminId || u === group.admin?.id) ||
      (hasValidEmail && group.admin?.email && group.admin.email.toLowerCase().trim() === email);

    if (isGroupAdmin) {
      if (user.name && user.name !== 'Explorer' && user.name !== 'User' && user.name !== 'Pujo Explorer' && group.admin?.name !== user.name) {
        group.admin.name = user.name;
        modified = true;
      }
      if (user.profileImage && group.admin?.profileImage !== user.profileImage) {
        group.admin.profileImage = user.profileImage;
        modified = true;
      }
    }

    if (modified) {
      group.markModified('members');
      group.markModified('admin');
      group.save().catch(() => {});
    }

    if (!/^\d{8}$/.test(group.inviteToken || '')) {
      group.inviteToken = generateInviteToken(group.id, group.name, group.adminId);
      group.save().catch(() => {});
    }

    return res.json(group.toClientJSON(uid));
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id */
async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user || {};
    const uid = user.id || user.uid;
    const email = (user.email || '').toLowerCase().trim();

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const isAdmin =
      group.adminId === uid ||
      group.admin?.id === uid ||
      (email && group.admin?.email && group.admin.email.toLowerCase().trim() === email) ||
      (group.members || []).some(
        (m) => (m.userId === uid || m.user?.id === uid || (email && m.user?.email?.toLowerCase().trim() === email)) && m.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({ error: 'Only the admin can delete this group.' });
    }

    await Group.deleteOne({ id });
    await Message.deleteMany({ groupId: id });
    await Call.deleteMany({ groupId: id });
    await Presence.deleteMany({ groupId: id });

    emitGroupUpdate(id, 'group_deleted', { groupId: id });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/invite */
async function regenerateInvite(req, res, next) {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== uid) return res.status(403).json({ error: 'Only admin can regenerate invite.' });

    group.inviteToken = generateInviteToken(group.id, group.name, group.adminId);
    await group.save();

    return res.json({ inviteToken: group.inviteToken });
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups/invite-info/:token */
async function getInviteInfo(req, res, next) {
  try {
    let cleanToken = req.params.token.trim();
    if (cleanToken.includes('/join/')) {
      cleanToken = cleanToken.split('/join/')[1].split('?')[0].split('#')[0].trim();
    }

    const decoded = decodeInviteToken(cleanToken);
    const targetId = decoded?.id || cleanToken;

    const group = await Group.findOne({
      $or: [{ inviteToken: cleanToken }, { id: targetId }],
    });

    if (group) {
      return res.json({
        groupId: group.id,
        groupName: group.name,
        region: group.region,
        adminName: group.admin?.name || 'Admin',
        adminPhoto: group.admin?.profileImage || null,
        memberCount: (group.members || []).length,
        spotsCount: (group.spots || []).length,
      });
    }

    if (decoded && decoded.id && decoded.name) {
      return res.json({
        groupId: decoded.id,
        groupName: decoded.name,
        region: decoded.region || 'Kolkata',
        adminName: decoded.adminName || 'Admin',
        adminPhoto: decoded.adminPhoto || null,
        memberCount: 1,
        spotsCount: 0,
      });
    }

    return res.status(404).json({ error: 'Invalid or expired invite link.' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/join/:token */
async function joinGroup(req, res, next) {
  try {
    let cleanToken = req.params.token.trim();
    if (cleanToken.includes('/join/')) {
      cleanToken = cleanToken.split('/join/')[1].split('?')[0].split('#')[0].trim();
    }

    const decoded = decodeInviteToken(cleanToken);
    const targetId = decoded?.id || cleanToken;
    const user = req.user;

    let group = await Group.findOne({
      $or: [{ inviteToken: cleanToken }, { id: targetId }],
    });

    if (!group && decoded && decoded.id && decoded.name) {
      group = new Group({
        id: decoded.id,
        name: decoded.name,
        region: decoded.region || 'Kolkata',
        visitDate: decoded.visitDate || '',
        startLocation: decoded.startLocation || '',
        adminId: decoded.adminId || 'admin',
        admin: {
          id: decoded.adminId || 'admin',
          name: decoded.adminName || 'Admin',
          profileImage: decoded.adminPhoto || null,
        },
        members: [
          {
            id: 'mem_admin_' + Date.now(),
            userId: decoded.adminId || 'admin',
            role: 'admin',
            user: {
              id: decoded.adminId || 'admin',
              name: decoded.adminName || 'Admin',
              profileImage: decoded.adminPhoto || null,
            },
            joinedAt: new Date(),
          },
        ],
        memberUids: [decoded.adminId || 'admin'],
        spots: Array.isArray(decoded.spots)
          ? decoded.spots.map(s => ({
            id: s.id || 'spot_' + Date.now() + '_' + nanoid(6),
            spotId: s.spotId || s.id,
            spot: s.spot || s,
            status: s.status || 'suggested',
            voteCount: s.voteCount || 0,
            votes: s.votes || [],
            createdAt: new Date(),
          }))
          : [],
        inviteToken: cleanToken,
      });
      await group.save();
    }

    if (!group) {
      return res.status(404).json({ error: 'Group not found or invite expired.' });
    }

    const canonicalUserId = user.id || user.uid || user.firebaseUid;
    const isUserAdmin = group.adminId === canonicalUserId || group.admin?.id === canonicalUserId;
    const members = group.members || [];
    const existingIdx = members.findIndex((m) => userMatchesMember(user, m));

    const cleanUser = {
      id: canonicalUserId,
      name: user.name || 'Member',
      email: user.email || '',
      profileImage: user.profileImage || null,
    };

    let newMember = null;
    if (isUserAdmin) {
      const adminMember = members.find((m) => m.role === 'admin' || userMatchesMember(user, m));
      if (adminMember) {
        adminMember.user = cleanUser;
        adminMember.userId = canonicalUserId;
      }
    } else if (existingIdx !== -1) {
      members[existingIdx].user = cleanUser;
      members[existingIdx].userId = canonicalUserId;
      members[existingIdx].id = members[existingIdx].id || `mem_${canonicalUserId}`;
      newMember = members[existingIdx];
    } else {
      newMember = {
        id: 'mem_' + Date.now() + '_' + nanoid(6),
        userId: canonicalUserId,
        role: 'member',
        user: cleanUser,
        joinedAt: new Date(),
      };
      members.push(newMember);
    }

    const nextMemberUids = Array.from(new Set([...(group.memberUids || []), canonicalUserId]));
    if (user.email && !/^(user@pujoplan\.app|demo@pujoplan\.dev|anonymous)$/i.test(user.email)) {
      nextMemberUids.push(user.email.toLowerCase().trim());
    }
    group.memberUids = nextMemberUids.filter(Boolean);

    group.members = members;
    await group.save();

    console.log('[GroupController] joinGroup sync:', {
      groupId: group.id,
      userId: canonicalUserId,
      email: user.email || '',
      memberCount: group.members.length,
      isUserAdmin,
    });

    // Create system message
    if (!isUserAdmin && existingIdx === -1) {
      const sysMsg = await Message.create({
        id: 'msg_sys_' + Date.now() + '_' + nanoid(6),
        groupId: group.id,
        text: `🎉 ${user.name || 'A new member'} joined the group!`,
        type: 'system',
        senderId: user.id,
        senderName: user.name || 'Explorer',
        senderImage: user.profileImage || null,
      });

      emitGroupUpdate(group.id, 'new_message', sysMsg);
    }

    const clientGroup = group.toClientJSON(user.id);
    emitGroupUpdate(group.id, 'member_joined', { member: newMember, group: clientGroup });

    return res.json({
      ...clientGroup,
      groupId: group.id,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/groups/:id/members */
async function getMembers(req, res, next) {
  try {
    const { id } = req.params;
    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    return res.json(group.members || []);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id/members/:userId */
async function removeMember(req, res, next) {
  try {
    const { id, userId } = req.params;
    const uid = req.user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (group.adminId !== uid && uid !== userId) {
      return res.status(403).json({ error: 'Unauthorized to remove this member.' });
    }

    const removedMember = (group.members || []).find(
      (m) => m.id === userId || m.userId === userId || m.user?.id === userId
    );
    const targetUserId = removedMember?.userId || removedMember?.user?.id || userId;
    const targetMemberId = removedMember?.id || userId;

    group.members = (group.members || []).filter(
      (m) => m.id !== userId && m.userId !== userId && m.user?.id !== userId && (!removedMember || m !== removedMember)
    );
    group.memberUids = group.memberUids.filter((u) => u !== userId && u !== targetUserId);
    group.markModified('members');
    group.markModified('memberUids');
    await group.save();

    const clientGroup = group.toClientJSON(uid);

    emitGroupUpdate(id, 'member_left', {
      memberId: targetMemberId,
      userId: targetUserId,
      targetUserId,
      groupId: id,
      group: clientGroup,
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/leave */
async function leaveGroup(req, res, next) {
  try {
    const { id } = req.params;
    const uid = req.user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    group.members = (group.members || []).filter((m) => m.userId !== uid);
    group.memberUids = group.memberUids.filter((u) => u !== uid);
    await group.save();

    emitGroupUpdate(id, 'member_left', {
      memberId: uid,
      group: group.toClientJSON(uid),
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── SPOTS ─────────────────── */

/** POST /api/groups/:id/spots */
async function addSpot(req, res, next) {
  try {
    const { id } = req.params;
    let { spotId, spot } = req.body;
    const user = req.user;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const exists = (group.spots || []).some((s) => s.spotId === spotId || s.id === spotId);
    if (exists) {
      return res.json(group.toClientJSON(user.id));
    }

    let finalSpot = spot || {};
    if (!finalSpot.name) {
      try {
        const dbSpot = await prisma.pujaSpot.findUnique({
          where: { id: spotId },
        });
        if (dbSpot) {
          finalSpot = {
            id: dbSpot.id,
            name: dbSpot.name,
            area: dbSpot.area,
            region: dbSpot.region,
            latitude: dbSpot.latitude,
            longitude: dbSpot.longitude,
            category: dbSpot.category,
            crowdLevel: dbSpot.crowdLevel,
            address: dbSpot.address,
            nearestMetro: dbSpot.nearestMetro,
            ...finalSpot,
          };
        }
      } catch (_) { }
    }

    const newSpot = {
      id: 'gs_' + Date.now() + '_' + nanoid(6),
      spotId,
      spot: finalSpot,
      addedBy: {
        id: user.id,
        name: user.name,
        profileImage: user.profileImage,
      },
      status: 'suggested',
      voteCount: 0,
      votes: [],
      createdAt: new Date(),
    };

    group.spots.push(newSpot);
    await group.save();

    const clientGroup = group.toClientJSON(user.id);
    emitGroupUpdate(id, 'spots_updated', { spots: group.spots, group: clientGroup });

    return res.json(clientGroup);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/groups/:id/spots/:spotId */
async function removeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const user = req.user;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    group.spots = (group.spots || []).filter(
      (s) => s.id !== spotId && s.spotId !== spotId
    );
    await group.save();

    const clientGroup = group.toClientJSON(user.id);
    emitGroupUpdate(id, 'spots_updated', { spots: group.spots, group: clientGroup });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/spots/:spotId/vote */
async function voteSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const uid = req.user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const targetSpot = (group.spots || []).find(
      (s) => s.id === spotId || s.spotId === spotId
    );
    if (!targetSpot) return res.status(404).json({ error: 'Spot not found.' });

    targetSpot.votes = targetSpot.votes || [];
    const voteIdx = targetSpot.votes.indexOf(uid);
    if (voteIdx !== -1) {
      targetSpot.votes.splice(voteIdx, 1);
    } else {
      targetSpot.votes.push(uid);
    }
    targetSpot.voteCount = targetSpot.votes.length;

    await group.save();

    const clientGroup = group.toClientJSON(uid);
    emitGroupUpdate(id, 'spots_updated', { spots: group.spots, group: clientGroup });

    return res.json(targetSpot);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/spots/:spotId/finalize */
async function finalizeSpot(req, res, next) {
  try {
    const { id, spotId } = req.params;
    const uid = req.user.id;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });
    if (group.adminId !== uid) return res.status(403).json({ error: 'Only admin can finalize spots.' });

    const targetSpot = (group.spots || []).find(
      (s) => s.id === spotId || s.spotId === spotId
    );
    if (!targetSpot) return res.status(404).json({ error: 'Spot not found.' });

    targetSpot.status = targetSpot.status === 'finalized' ? 'suggested' : 'finalized';
    await group.save();

    const clientGroup = group.toClientJSON(uid);
    emitGroupUpdate(id, 'spots_updated', { spots: group.spots, group: clientGroup });

    return res.json(targetSpot);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/route */
async function generateRoute(req, res, next) {
  try {
    const { id } = req.params;
    const { startLocation } = req.body;

    const group = await Group.findOne({ id });
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    return res.json({
      success: true,
      startLocation: startLocation || group.startLocation,
      waypoints: (group.spots || []).map((s) => ({
        id: s.id,
        name: s.spot?.name,
        lat: s.spot?.latitude,
        lng: s.spot?.longitude,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── MESSAGES ─────────────────── */

/** GET /api/groups/:id/messages */
async function getGroupMessages(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user;

    const group = await Group.findOne({ id }).select('id adminId admin members memberUids').lean();
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (!isUserInGroup(user, group)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const messages = await Message.find({ groupId: id })
      .sort({ createdAt: 1 })
      .limit(500);
    return res.json(messages);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/messages */
async function sendGroupMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { text, type, imageUrl } = req.body;
    const user = req.user;

    const group = await Group.findOne({ id }).select('id adminId admin members memberUids').lean();
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (!isUserInGroup(user, group)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    // Strictly enforce 1 MB limit for image uploads
    if (imageUrl && typeof imageUrl === 'string') {
      if (imageUrl.length > 1.4 * 1024 * 1024) {
        return res.status(400).json({ error: 'Picture must be under 1 MB in size.' });
      }
    }

    const message = await Message.create({
      id: 'msg_' + Date.now() + '_' + nanoid(6),
      groupId: id,
      text: text || '',
      imageUrl: imageUrl || null,
      type: type || (imageUrl ? 'image' : 'text'),
      senderId: user.id,
      senderName: user.name || 'Explorer',
      senderImage: user.profileImage || null,
      user: {
        id: user.id,
        name: user.name || 'Explorer',
        profileImage: user.profileImage || null,
        email: user.email || '',
      },
      createdAt: new Date(),
    });

    emitGroupUpdate(id, 'new_message', message);
    return res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── LOCATIONS / PRESENCE ─────────────────── */

/** GET /api/groups/:id/locations */
async function getGroupLocations(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user;

    const group = await Group.findOne({ id }).select('id adminId admin members memberUids').lean();
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (!isUserInGroup(user, group)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const list = await Presence.find({ groupId: id });
    return res.json(list);
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/location */
async function updateMemberLocation(req, res, next) {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy, isSharingLocation, battery } = req.body;
    const user = req.user;

    const group = await Group.findOne({ id }).select('id adminId admin members memberUids').lean();
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    if (!isUserInGroup(user, group)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    const presence = await Presence.findOneAndUpdate(
      { groupId: id, userId: user.id },
      {
        $set: {
          name: user.name || 'Explorer',
          profileImage: user.profileImage || null,
          latitude: latitude !== undefined ? latitude : null,
          longitude: longitude !== undefined ? longitude : null,
          accuracy: accuracy !== undefined ? accuracy : null,
          isSharingLocation: isSharingLocation !== undefined ? isSharingLocation : true,
          ...(battery !== undefined && battery !== null ? { battery: Math.round(Number(battery)) } : {}),
          lastSeen: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    emitGroupUpdate(id, 'location_updated', presence);
    return res.json(presence);
  } catch (err) {
    next(err);
  }
}

/* ─────────────────── CALL SIGNALING ─────────────────── */

/** GET /api/groups/:id/call/status */
async function getCallStatus(req, res, next) {
  try {
    const { id } = req.params;
    const call = await Call.findOne({ groupId: id, status: { $ne: 'ended' } });
    return res.json({ active: !!call, call: call || null });
  } catch (err) {
    next(err);
  }
}

/** POST /api/groups/:id/call/signal */
async function sendCallSignal(req, res, next) {
  try {
    const { id } = req.params;
    const { type, offer, answer, candidate, status } = req.body;
    const user = req.user;

    let call = await Call.findOne({ groupId: id });

    if (!call) {
      call = new Call({
        groupId: id,
        type: type || 'audio',
        status: status || 'ringing',
        caller: {
          id: user.id,
          name: user.name || 'Caller',
          profileImage: user.profileImage || null,
        },
        candidates: [],
      });
    }

    if (status) call.status = status;
    if (offer) call.offer = offer;
    if (answer) call.answer = answer;
    if (candidate) call.candidates.push(candidate);

    await call.save();

    emitGroupUpdate(id, 'call_signal', {
      groupId: id,
      senderId: user.id,
      type,
      offer,
      answer,
      candidate,
      status: call.status,
      caller: call.caller,
    });

    return res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createGroup,
  getMyGroups,
  getGroupById,
  deleteGroup,
  regenerateInvite,
  getInviteInfo,
  joinGroup,
  getMembers,
  removeMember,
  leaveGroup,
  addSpot,
  removeSpot,
  voteSpot,
  finalizeSpot,
  generateRoute,
  getGroupMessages,
  sendGroupMessage,
  getGroupLocations,
  updateMemberLocation,
  getCallStatus,
  sendCallSignal,
};
