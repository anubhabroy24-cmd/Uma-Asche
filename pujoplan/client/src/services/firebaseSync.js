import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';

function withTimeout(promise, ms = 3500) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Firestore timeout')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export function isGenericEmail(email) {
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

export function getCanonicalUid(user) {
  if (!user) return 'anonymous';
  if (user.id && user.id !== 'anonymous' && user.id !== 'local-user' && user.id !== 'admin') return user.id;
  if (user.firebaseUid) return user.firebaseUid;
  if (user.uid) return user.uid;
  if (user.email && !isGenericEmail(user.email)) {
    return `user_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
  try {
    let devUid = localStorage.getItem('pp_client_device_uid');
    if (!devUid) {
      devUid = 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 7);
      localStorage.setItem('pp_client_device_uid', devUid);
    }
    return devUid;
  } catch (_) {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }
}

export function normalizeUser(user) {
  if (!user) return null;
  const uid = getCanonicalUid(user);
  return {
    id: uid,
    name: user.name || (user.email && !isGenericEmail(user.email) ? user.email.split('@')[0] : 'Explorer'),
    email: user.email || '',
    profileImage: user.profileImage || null,
  };
}

// ── Groups ──────────────────────────────────────────────────────────

export async function fsCreateGroup(group) {
  const groupRef = doc(db, 'groups', group.id);
  const cleanAdmin = normalizeUser(group.admin || { id: group.adminId });
  
  console.log('[fsCreateGroup] Creating with admin:', cleanAdmin.id, 'admin email:', cleanAdmin.email);
  
  const payload = {
    ...group,
    admin: cleanAdmin,
    adminId: cleanAdmin.id,
    members: [
      {
        id: 'mem_admin_' + cleanAdmin.id,
        userId: cleanAdmin.id,
        role: 'admin',
        user: cleanAdmin,
      },
    ],
    memberUids: [cleanAdmin.id, !isGenericEmail(cleanAdmin.email) ? cleanAdmin.email.toLowerCase() : null].filter(Boolean),
    spots: group.spots || [],
    createdAt: group.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  console.log('[fsCreateGroup] Payload to write to Firestore:', payload);
  
  try {
    await withTimeout(setDoc(groupRef, payload, { merge: true }), 3500);
    console.log('[fsCreateGroup] Success, group created with ID:', group.id);
    return payload;
  } catch (err) {
    console.error('[fsCreateGroup] FIRESTORE ERROR:', err.message, err.code);
    throw new Error('Firestore error: ' + (err.message || err.code || 'Unknown error'));
  }
}



export async function fsGetGroupById(groupIdOrToken) {
  if (!groupIdOrToken) return null;
  const clean = String(groupIdOrToken).trim();
  try {
    // 1. Direct document ID lookup
    const groupRef = doc(db, 'groups', clean);
    const snap = await withTimeout(getDoc(groupRef), 3000).catch(() => null);
    if (snap && snap.exists()) {
      return snap.data();
    }

    // 2. Query by inviteToken field
    const q = query(collection(db, 'groups'), where('inviteToken', '==', clean), limit(1));
    const qSnap = await withTimeout(getDocs(q), 3000).catch(() => null);
    if (qSnap && !qSnap.empty) {
      return qSnap.docs[0].data();
    }

    // 3. Query uppercase inviteToken
    const qUpper = query(collection(db, 'groups'), where('inviteToken', '==', clean.toUpperCase()), limit(1));
    const qUpperSnap = await withTimeout(getDocs(qUpper), 3000).catch(() => null);
    if (qUpperSnap && !qUpperSnap.empty) {
      return qUpperSnap.docs[0].data();
    }
  } catch (err) {
    console.warn('[Firestore] Get group error:', err.message);
  }
  return null;
}

export function fsSubscribeToGroup(groupId, onUpdate) {
  if (!groupId) return () => {};
  try {
    const groupRef = doc(db, 'groups', groupId);
    return onSnapshot(groupRef, (snap) => {
      if (snap && snap.exists()) {
        const data = snap.data();
        console.log('[MEMBER_JOINED] Realtime group snapshot update:', data.id, 'members count:', data.members?.length);
        if (onUpdate) onUpdate(data);
      }
    }, (err) => {
      console.warn('[MEMBER_JOINED] Group snapshot error:', err.message);
    });
  } catch (err) {
    console.warn('[MEMBER_JOINED] Group subscribe catch:', err.message);
    return () => {};
  }
}

export async function fsGetMyGroups(user) {
  if (!user) return [];
  try {
    const uid = getCanonicalUid(user);
    const fbUid = user.firebaseUid;
    const email = (user.email || '').toLowerCase().trim();
    const groupsMap = new Map();
    const groupsCol = collection(db, 'groups');

    // Launch all targeted Firestore queries in parallel (0ms sequential wait!)
    const queries = [
      query(groupsCol, where('memberUids', 'array-contains', uid)),
    ];
    if (fbUid && fbUid !== uid) {
      queries.push(query(groupsCol, where('memberUids', 'array-contains', fbUid)));
    }
    if (email) {
      queries.push(query(groupsCol, where('memberUids', 'array-contains', email)));
    }

    const snaps = await Promise.all(
      queries.map(q => withTimeout(getDocs(q), 1500).catch(() => null))
    );

    snaps.forEach(snap => {
      if (snap) {
        snap.forEach(d => {
          if (d.exists() && d.data()?.id) {
            groupsMap.set(d.data().id, d.data());
          }
        });
      }
    });

    // If still empty (e.g. legacy docs created before memberUids indexing), quick direct scan
    if (groupsMap.size === 0) {
      const snapAll = await withTimeout(getDocs(groupsCol), 1800).catch(() => null);
      if (snapAll) {
        snapAll.forEach(d => {
          const g = d.data();
          if (!g || !g.id) return;
          const gAdminEmail = (g.admin?.email || '').toLowerCase().trim();
          const isAdmin = g.adminId === uid || g.adminId === fbUid || (email && gAdminEmail === email);
          const isMember = Array.isArray(g.members) && g.members.some(m => {
            if (!m) return false;
            const mUid = m.userId || m.user?.id || m.id;
            const mEmail = (m.user?.email || m.email || '').toLowerCase().trim();
            return (mUid && (mUid === uid || mUid === fbUid)) || (email && mEmail === email);
          });
          const inMemberUids = Array.isArray(g.memberUids) && (
            g.memberUids.includes(uid) ||
            (fbUid && g.memberUids.includes(fbUid)) ||
            (email && g.memberUids.includes(email))
          );
          if (isAdmin || isMember || inMemberUids) {
            groupsMap.set(g.id, g);
          }
        });
      }
    }

    const results = [];
    for (const g of groupsMap.values()) {
      const gAdminEmail = (g.admin?.email || '').toLowerCase().trim();
      const isAdmin = g.adminId === uid || g.adminId === fbUid || (email && gAdminEmail === email);
      results.push({
        ...g,
        myRole: isAdmin ? 'admin' : 'member',
        _count: {
          members: (g.members || []).length,
          spots: (g.spots || []).length,
        },
      });
    }

    return results;
  } catch (err) {
    console.warn('[Firestore] Get my groups fallback:', err.message);
    return [];
  }
}

// ── Solo Plans (Cloud Firestore) ───────────────────────────────────

export async function fsCreateSoloPlan(plan, user) {
  try {
    const cleanUser = normalizeUser(user);
    const planRef = doc(db, 'solo_plans', plan.id);
    const payload = {
      ...plan,
      userId: cleanUser.id,
      userEmail: cleanUser.email?.toLowerCase().trim() || '',
      userName: cleanUser.name,
      spots: plan.spots || [],
      createdAt: plan.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await withTimeout(setDoc(planRef, payload, { merge: true }), 3500);
    return payload;
  } catch (err) {
    console.warn('[Firestore] Create solo plan error:', err.message);
    return plan;
  }
}

export async function fsGetMySoloPlans(user) {
  if (!user) return [];
  try {
    const cleanUser = normalizeUser(user);
    const plansCol = collection(db, 'solo_plans');
    const plansMap = new Map();

    const q = query(plansCol, where('userId', '==', cleanUser.id));
    const snap = await withTimeout(getDocs(q), 3000).catch(() => null);
    if (snap) {
      snap.forEach(d => {
        if (d.exists() && d.data()?.id) plansMap.set(d.data().id, d.data());
      });
    }

    if (cleanUser.email) {
      const qEmail = query(plansCol, where('userEmail', '==', cleanUser.email.toLowerCase().trim()));
      const snapEmail = await withTimeout(getDocs(qEmail), 3000).catch(() => null);
      if (snapEmail) {
        snapEmail.forEach(d => {
          if (d.exists() && d.data()?.id) plansMap.set(d.data().id, d.data());
        });
      }
    }

    return Array.from(plansMap.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (err) {
    console.warn('[Firestore] Get solo plans error:', err.message);
    return [];
  }
}

export async function fsGetSoloPlanById(planId) {
  if (!planId) return null;
  try {
    const planRef = doc(db, 'solo_plans', planId);
    const snap = await withTimeout(getDoc(planRef), 3000).catch(() => null);
    if (snap && snap.exists()) return snap.data();
  } catch (err) {
    console.warn('[Firestore] Get solo plan by ID error:', err.message);
  }
  return null;
}

export async function fsUpdateSoloPlan(planId, updates) {
  try {
    const planRef = doc(db, 'solo_plans', planId);
    await updateDoc(planRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('[Firestore] Update solo plan error:', err.message);
    return false;
  }
}

export async function fsDeleteSoloPlan(planId) {
  try {
    const planRef = doc(db, 'solo_plans', planId);
    await deleteDoc(planRef);
    return true;
  } catch (err) {
    console.warn('[Firestore] Delete solo plan error:', err.message);
    return false;
  }
}

export async function fsJoinGroup(tokenOrId, user) {
  try {
    const cleanToken = tokenOrId.trim();
    const cleanUser = normalizeUser(user);
    const uid = cleanUser.id;
    const email = cleanUser.email?.toLowerCase().trim();

    let targetGroup = null;

    const directRef = doc(db, 'groups', cleanToken);
    const directSnap = await withTimeout(getDoc(directRef), 4000).catch(() => null);
    if (directSnap && directSnap.exists()) {
      targetGroup = directSnap.data();
    } else {
      const q = query(collection(db, 'groups'), where('inviteToken', '==', cleanToken), limit(1));
      const qSnap = await withTimeout(getDocs(q), 4000).catch(() => null);
      if (qSnap && !qSnap.empty) {
        targetGroup = qSnap.docs[0].data();
      }
    }

    if (!targetGroup) return null;

    const isUserAdmin = targetGroup.adminId === uid || (!isGenericEmail(email) && targetGroup.admin?.email?.toLowerCase() === email);
    const members = Array.isArray(targetGroup.members) ? [...targetGroup.members] : [];

    const existingIdx = members.findIndex(m => {
      const mUid = m.userId || m.user?.id;
      if (mUid && uid && mUid === uid) return true;
      const mEmail = (m.user?.email || m.email || '').toLowerCase().trim();
      if (email && mEmail && !isGenericEmail(email) && !isGenericEmail(mEmail) && email === mEmail) return true;
      return false;
    });

    if (isUserAdmin) {
      const adminMember = members.find(m => m.role === 'admin' || m.userId === targetGroup.adminId);
      if (adminMember) {
        adminMember.user = cleanUser;
        adminMember.userId = uid;
      }
    } else if (existingIdx !== -1) {
      members[existingIdx].user = cleanUser;
      members[existingIdx].userId = uid;
    } else {
      members.push({
        id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        userId: uid,
        role: 'member',
        user: cleanUser,
      });
    }

    const memberUids = members
      .map(m => m.userId || m.user?.id)
      .concat(members.map(m => (!isGenericEmail(m.user?.email) ? m.user?.email?.toLowerCase() : null)))
      .filter(Boolean);

    const updated = {
      ...targetGroup,
      members,
      memberUids: Array.from(new Set(memberUids)),
      spots: targetGroup.spots || [],
      updatedAt: new Date().toISOString(),
    };

    const groupRef = doc(db, 'groups', targetGroup.id);
    await withTimeout(setDoc(groupRef, updated, { merge: true }), 4000);

    console.log('[MEMBER_JOINED] User joined group in Firestore:', cleanUser.name, 'Group:', targetGroup.id, 'Total members:', members.length);

    // Send system message to group chat
    try {
      await fsSendMessage(targetGroup.id, {
        text: `🎉 ${cleanUser.name} joined the group!`,
        type: 'system',
      }, cleanUser);
    } catch (_) {}

    return {
      ...updated,
      groupId: targetGroup.id,
      myRole: isUserAdmin ? 'admin' : 'member',
    };
  } catch (err) {
    console.warn('[Firestore] Join group fallback:', err.message);
    return null;
  }
}

export async function fsRemoveMember(groupId, memberIdOrUserId) {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await withTimeout(getDoc(groupRef), 3000).catch(() => null);
    if (!snap || !snap.exists()) return false;
    const data = snap.data();
    const members = (data.members || []).filter(m => m.id !== memberIdOrUserId && m.userId !== memberIdOrUserId && m.user?.id !== memberIdOrUserId);
    const memberUids = members.map(m => m.userId || m.user?.id).filter(Boolean);
    await withTimeout(updateDoc(groupRef, {
      members,
      memberUids: Array.from(new Set(memberUids)),
      updatedAt: new Date().toISOString(),
    }), 3500);
    return true;
  } catch (err) {
    console.warn('[Firestore] Remove member error:', err.message);
    return false;
  }
}

export async function fsLeaveGroup(groupId, user) {
  if (!user) return false;
  const cleanUser = normalizeUser(user);
  return await fsRemoveMember(groupId, cleanUser.id);
}

export async function fsUpdateGroupSpots(groupId, spots) {
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      spots: spots || [],
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('[Firestore] Update spots error:', err.message);
    return false;
  }
}

// ── Messages ────────────────────────────────────────────────────────

export async function fsSendMessage(groupId, payload, user) {
  try {
    const cleanUser = normalizeUser(user);
    const msgsCol = collection(db, 'groups', groupId, 'messages');
    const newMsg = {
      text: payload.text || '',
      imageUrl: payload.imageUrl || null,
      type: payload.type || 'user',
      callType: payload.callType || null,
      duration: payload.duration || null,
      userId: cleanUser.id,
      user: cleanUser,
      createdAt: new Date().toISOString(),
    };
    console.log('[SEND_MSG] Sending message to Firestore group:', groupId, 'text:', newMsg.text);
    const ref = await addDoc(msgsCol, newMsg);
    return { id: ref.id, ...newMsg };
  } catch (err) {
    console.warn('[SEND_MSG] Send message error:', err.message);
    return null;
  }
}

export async function fsGetMessages(groupId) {
  try {
    const msgsCol = collection(db, 'groups', groupId, 'messages');
    const q = query(msgsCol, orderBy('createdAt', 'asc'), limit(150));
    const snap = await getDocs(q);
    const msgs = [];
    snap.forEach(d => {
      msgs.push({ id: d.id, ...d.data() });
    });
    return msgs;
  } catch (err) {
    console.warn('[Firestore] Get messages error:', err.message);
    return null;
  }
}

export function fsSubscribeToMessages(groupId, onUpdate) {
  if (!groupId) return () => {};
  try {
    const msgsCol = collection(db, 'groups', groupId, 'messages');
    const q = query(msgsCol, orderBy('createdAt', 'asc'), limit(150));
    return onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(d => {
        msgs.push({ id: d.id, ...d.data() });
      });
      console.log('[RECV_MSG] Realtime messages updated:', groupId, 'count:', msgs.length);
      if (onUpdate) onUpdate(msgs);
    }, (err) => {
      console.warn('[RECV_MSG] Messages snapshot error:', err.message);
    });
  } catch (err) {
    console.warn('[RECV_MSG] Messages subscribe catch:', err.message);
    return () => {};
  }
}

// ── Calling & Signaling ─────────────────────────────────────────────

export async function fsSendCallSignal(groupId, data, user) {
  try {
    const cleanUser = normalizeUser(user);
    const now = Date.now();
    const callDocRef = doc(db, 'groups', groupId, 'call', 'state');

    if (data.type === 'start') {
      console.log('[SIGNAL_OFFER_SENT] Starting call in group:', groupId, 'mode:', data.callMode);
      const state = {
        active: true,
        callMode: data.payload?.callMode || data.callMode || 'video',
        startedBy: cleanUser,
        startedAt: now,
        participants: [
          {
            id: cleanUser.id,
            name: cleanUser.name,
            profileImage: cleanUser.profileImage,
            isMuted: false,
            isVideoOn: (data.payload?.callMode || 'video') === 'video',
            joinedAt: now,
          },
        ],
        updatedAt: now,
      };
      await setDoc(callDocRef, state);
    } else if (data.type === 'join') {
      const snap = await getDoc(callDocRef);
      const current = snap.exists() ? snap.data() : { active: true, participants: [] };
      const participants = Array.isArray(current.participants) ? [...current.participants] : [];

      if (!participants.some(p => p.id === cleanUser.id)) {
        participants.push({
          id: cleanUser.id,
          name: cleanUser.name,
          profileImage: cleanUser.profileImage,
          isMuted: Boolean(data.payload?.isMuted),
          isVideoOn: data.payload?.isVideoOn !== undefined ? Boolean(data.payload?.isVideoOn) : true,
          joinedAt: now,
        });
      }

      await setDoc(callDocRef, {
        ...current,
        active: true,
        startedBy: current.startedBy || cleanUser,
        startedAt: current.startedAt || now,
        callMode: data.payload?.callMode || current.callMode || 'video',
        participants,
        updatedAt: now,
      }, { merge: true });

      const sigCol = collection(db, 'groups', groupId, 'call_signals');
      await addDoc(sigCol, {
        from: cleanUser.id,
        fromName: cleanUser.name,
        type: 'user_joined',
        to: 'all',
        payload: data.payload || {},
        timestamp: now,
      });
    } else if (data.type === 'leave') {
      const snap = await getDoc(callDocRef);
      if (snap.exists()) {
        const current = snap.data();
        const participants = (current.participants || []).filter(p => p.id !== cleanUser.id);
        const active = participants.length > 0;
        await setDoc(callDocRef, {
          ...current,
          active,
          participants,
          updatedAt: now,
        }, { merge: true });
      }

      const sigCol = collection(db, 'groups', groupId, 'call_signals');
      await addDoc(sigCol, {
        from: cleanUser.id,
        type: 'user_left',
        to: 'all',
        timestamp: now,
      });
    } else if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice_candidate') {
      console.log('[SIGNAL_OFFER_SENT] Sending signal:', data.type, 'from:', cleanUser.id, 'to:', data.to);
      const sigCol = collection(db, 'groups', groupId, 'call_signals');
      await addDoc(sigCol, {
        from: cleanUser.id,
        fromName: cleanUser.name,
        to: data.to,
        type: data.type,
        payload: data.payload,
        timestamp: now,
      });
    }

    return true;
  } catch (err) {
    console.warn('[Firestore] Send call signal error:', err.message);
    return false;
  }
}

export function fsSubscribeToCallSignals(groupId, onSignal, onStateChange) {
  if (!groupId) return () => {};
  const unsubs = [];
  try {
    const callDocRef = doc(db, 'groups', groupId, 'call', 'state');
    const unsubState = onSnapshot(callDocRef, (snap) => {
      if (snap && snap.exists()) {
        const state = snap.data();
        console.log('[SIGNAL_OFFER_RECEIVED] Call state update:', state);
        if (onStateChange) onStateChange(state);
      }
    }, (err) => console.warn('[SIGNAL] Call state snapshot error:', err.message));
    unsubs.push(unsubState);

    const sigCol = collection(db, 'groups', groupId, 'call_signals');
    const q = query(sigCol, limit(50));
    const unsubSig = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const sig = change.doc.data();
          console.log('[SIGNAL_OFFER_RECEIVED] Call signal received:', sig.type, 'from:', sig.from, 'to:', sig.to);
          if (onSignal) onSignal(sig);
        }
      });
    }, (err) => console.warn('[SIGNAL] Signals snapshot error:', err.message));
    unsubs.push(unsubSig);
  } catch (err) {
    console.warn('[SIGNAL] Call subscribe catch:', err.message);
  }
  return () => unsubs.forEach(u => u());
}

export async function fsGetCallStatus(groupId, since = 0) {
  try {
    const callDocRef = doc(db, 'groups', groupId, 'call', 'state');
    const snap = await getDoc(callDocRef);
    const now = Date.now();

    let state = {
      active: false,
      callMode: 'video',
      startedBy: null,
      startedAt: null,
      participants: [],
      signals: [],
      serverTime: now,
    };

    if (snap && snap.exists()) {
      const data = snap.data();
      if (data.active && data.startedAt && now - data.startedAt < 360000 && data.participants?.length > 0) {
        state = {
          ...state,
          ...data,
          active: true,
        };
      }
    }

    try {
      const sigCol = collection(db, 'groups', groupId, 'call_signals');
      const sigSnap = await getDocs(sigCol);
      const signals = [];
      if (sigSnap) {
        sigSnap.forEach(d => {
          const sig = d.data();
          if (sig && sig.timestamp && sig.timestamp > since) {
            signals.push(sig);
          }
        });
      }
      signals.sort((a, b) => a.timestamp - b.timestamp);
      state.signals = signals;
    } catch (_) {}

    return state;
  } catch (err) {
    console.warn('[Firestore] Get call status error:', err.message);
    return null;
  }
}

// ── Live Locations & Presence ────────────────────────────────────────

export async function fsUpdateLocation(groupId, locData, user) {
  try {
    const cleanUser = normalizeUser(user);
    const locRef = doc(db, 'groups', groupId, 'locations', cleanUser.id);
    const payload = {
      userId: cleanUser.id,
      userName: cleanUser.name,
      profileImage: cleanUser.profileImage,
      latitude: locData.latitude,
      longitude: locData.longitude,
      isSharingLocation: locData.isSharingLocation !== undefined ? Boolean(locData.isSharingLocation) : true,
      lastLocationUpdate: new Date().toISOString(),
    };
    console.log('[PRESENCE_UPDATE] Updating location for user:', cleanUser.name, 'Group:', groupId);
    await setDoc(locRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn('[PRESENCE_UPDATE] Update location error:', err.message);
    return false;
  }
}

export function fsSubscribeToLocations(groupId, onUpdate) {
  if (!groupId) return () => {};
  try {
    const locCol = collection(db, 'groups', groupId, 'locations');
    return onSnapshot(locCol, (snap) => {
      const locs = [];
      snap.forEach(d => locs.push(d.data()));
      console.log('[PRESENCE_UPDATE] Realtime locations update count:', locs.length);
      if (onUpdate) onUpdate(locs);
    }, (err) => {
      console.warn('[PRESENCE_UPDATE] Locations snapshot error:', err.message);
    });
  } catch (err) {
    console.warn('[PRESENCE_UPDATE] Locations subscribe catch:', err.message);
    return () => {};
  }
}

export async function fsGetLocations(groupId) {
  try {
    const locCol = collection(db, 'groups', groupId, 'locations');
    const snap = await getDocs(locCol);
    const locs = [];
    snap.forEach(d => locs.push(d.data()));
    return locs;
  } catch (err) {
    console.warn('[Firestore] Get locations error:', err.message);
    return null;
  }
}


