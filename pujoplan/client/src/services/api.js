import axios from 'axios';
import { DEFAULT_PANDALS } from '../data/defaultPandals';
import { solveNearestNeighbor } from '../utils/routeOptimizer';

export const PRODUCTION_API_URL = 'https://uma-asche.onrender.com/api';
export const API_BASE_URL = import.meta.env.VITE_API_URL || PRODUCTION_API_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 8000,
});

// Attach JWT and user profile headers on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  try {
    const gName = localStorage.getItem('pp_google_name');
    const gEmail = localStorage.getItem('pp_google_email');
    const gPhoto = localStorage.getItem('pp_google_photo');
    const storedUserRaw = localStorage.getItem('pp_user');
    let uName = gName;
    let uEmail = gEmail;
    let uPhoto = gPhoto;
    if (storedUserRaw) {
      const parsed = JSON.parse(storedUserRaw);
      if (parsed.name && parsed.name !== 'User' && parsed.name !== 'Pujo Explorer') uName = parsed.name;
      if (parsed.email) uEmail = parsed.email;
      if (parsed.profileImage) uPhoto = parsed.profileImage;
    }
    if (uName) config.headers['X-User-Name'] = encodeURIComponent(uName);
    if (uEmail) config.headers['X-User-Email'] = encodeURIComponent(uEmail);
    if (uPhoto) config.headers['X-User-Photo'] = encodeURIComponent(uPhoto);
  } catch (_) { }

  return config;
});

// Intercept responses: catch HTML responses (from SPA 404 rewrites on Vercel/Netlify) and 401s
api.interceptors.response.use(
  res => {
    if (
      typeof res.data === 'string' &&
      (res.data.includes('<!DOCTYPE html') ||
        res.data.includes('<!doctype html') ||
        res.data.includes('<html') ||
        res.data.includes('<head') ||
        res.headers['content-type']?.includes('text/html'))
    ) {
      const err = new Error('HTML response received from API fallback.');
      err.response = { status: 404, data: null };
      return Promise.reject(err);
    }
    return res;
  },
  err => {
    return Promise.reject(err);
  }
);

// ─── Local DB Helper for Standalone / Netlify / APK Mode ───────────
function getStoredUser() {
  const gName = localStorage.getItem('pp_google_name');
  const gPhoto = localStorage.getItem('pp_google_photo');
  const gEmail = localStorage.getItem('pp_google_email');

  try {
    const raw = localStorage.getItem('pp_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.firebaseUid || parsed.email)) {
        if (gName && (!parsed.name || parsed.name === 'User' || parsed.name === 'Pujo Explorer')) {
          parsed.name = gName;
        }
        if (gPhoto && !parsed.profileImage) {
          parsed.profileImage = gPhoto;
        }
        if (gEmail && !parsed.email) {
          parsed.email = gEmail;
        }
        return parsed;
      }
    }
  } catch (_) { }

  const fallbackId = gEmail ? `user_${gEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : 'local-user';

  return {
    id: fallbackId,
    name: gName || (gEmail ? gEmail.split('@')[0] : 'Pujo Explorer'),
    email: gEmail || 'user@pujoplan.app',
    profileImage: gPhoto || null,
  };
}

function isSameUser(member, user) {
  if (!member || !user) return false;
  const mUid = member.userId || member.user?.id || member.id;
  const mFid = member.user?.firebaseUid || member.firebaseUid;
  const mEmail = (member.user?.email || member.email || '').toLowerCase().trim();

  const uUid = user.id || user.userId;
  const uFid = user.firebaseUid;
  const uEmail = (user.email || '').toLowerCase().trim();

  if (mUid && (mUid === uUid || mUid === uFid)) return true;
  if (mFid && (mFid === uUid || mFid === uFid)) return true;
  if (mEmail && uEmail && mEmail === uEmail) return true;
  return false;
}

function getSharedGroup(groupId) {
  if (!groupId) return null;
  try {
    const raw = localStorage.getItem(`pp_shared_group_${groupId}`);
    if (raw) {
      const grp = JSON.parse(raw);
      if (grp && typeof grp === 'object' && grp.id) return grp;
    }
  } catch (_) { }
  return null;
}

function saveSharedGroup(group) {
  if (!group || !group.id) return;
  try {
    // Normalize member list and deduplicate
    group.members = deduplicateMembers(group.members || [], group.adminId, group.admin);
    group._count = group._count || {};
    group._count.members = group.members.length;
    group._count.spots = (group.spots || []).length;
    if (!group.inviteToken) group.inviteToken = generatePortableInviteToken(group);

    localStorage.setItem(`pp_shared_group_${group.id}`, JSON.stringify(group));
  } catch (_) { }
}

export function deduplicateMembers(members = [], adminId, adminObj) {
  const result = [];
  const adminEmail = (adminObj?.email || '').toLowerCase().trim();

  // Ensure admin is member #1
  const adminMember = members.find(m =>
    m.role === 'admin' ||
    m.userId === adminId ||
    m.user?.id === adminId ||
    (adminEmail && (m.email?.toLowerCase().trim() === adminEmail || m.user?.email?.toLowerCase().trim() === adminEmail))
  );

  const cleanAdmin = {
    id: adminMember?.id || 'mem_admin',
    userId: adminId || 'admin',
    role: 'admin',
    user: adminMember?.user || adminObj || { id: adminId || 'admin', name: adminObj?.name || 'Admin', profileImage: adminObj?.profileImage || null, email: adminEmail },
  };
  result.push(cleanAdmin);

  for (const m of members) {
    if (!m) continue;
    // Check if this member is the admin
    if (isSameUser(m, cleanAdmin) || isSameUser(m, cleanAdmin.user)) {
      continue;
    }
    // Check if already in result
    const alreadyExists = result.some(existing => isSameUser(existing, m));
    if (alreadyExists) {
      continue;
    }

    const uid = m.userId || m.user?.id || (m.user?.email ? `user_${m.user.email.replace(/[^a-zA-Z0-9]/g, '_')}` : ('mem_' + Date.now()));
    result.push({
      id: m.id || ('mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      userId: uid,
      role: 'member',
      user: m.user || { id: uid, name: m.name || 'Member', profileImage: m.profileImage || null, email: m.email || '' },
    });
  }

  return result;
}

export function getLocalGroups() {
  try {
    const user = getStoredUser();
    if (!user || (!user.id && !user.firebaseUid && !user.email)) return [];

    const uid = user.id || user.firebaseUid;
    const email = (user.email || '').toLowerCase().trim();

    // Check all deterministic user storage keys
    const possibleKeys = [
      uid ? `pp_local_groups_${uid}` : null,
      user.firebaseUid ? `pp_local_groups_${user.firebaseUid}` : null,
      email ? `pp_local_groups_user_${email.replace(/[^a-z0-9]/g, '_')}` : null,
    ].filter(Boolean);

    const groupMap = new Map();

    for (const key of possibleKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const g of list) {
              if (g && g.id) groupMap.set(g.id, g);
            }
          }
        }
      } catch (_) { }
    }

    const filtered = Array.from(groupMap.values()).map(base => {
      const shared = getSharedGroup(base.id);
      const grp = shared || base;
      const isAdmin = grp.adminId === uid || (grp.admin?.email && email && grp.admin.email.toLowerCase() === email);
      const members = deduplicateMembers(grp.members || [], grp.adminId, grp.admin);
      const isMember = members.some(m => isSameUser(m, user));

      if (!isAdmin && !isMember) return null;

      return {
        ...grp,
        members,
        _count: {
          members: members.length,
          spots: (grp.spots || []).length,
        },
        myRole: isAdmin ? 'admin' : 'member',
      };
    }).filter(Boolean);

    return filtered;
  } catch {
    return [];
  }
}

export function saveLocalGroups(groups) {
  const safe = Array.isArray(groups) ? groups : [];
  const user = getStoredUser();
  if (!user) return;
  const uid = user.id || user.firebaseUid;
  const email = (user.email || '').toLowerCase().trim();

  const keys = [
    uid ? `pp_local_groups_${uid}` : null,
    user.firebaseUid ? `pp_local_groups_${user.firebaseUid}` : null,
    email ? `pp_local_groups_user_${email.replace(/[^a-z0-9]/g, '_')}` : null,
  ].filter(Boolean);

  for (const k of keys) {
    localStorage.setItem(k, JSON.stringify(safe));
  }
}

export function getLocalSoloPlans() {
  try {
    const user = getStoredUser();
    const userId = user?.id || user?.firebaseUid || (user?.email ? `user_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}` : 'anonymous');
    const storageKey = `pp_local_soloplans_${userId}`;
    let data = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(item => item && typeof item === 'object' && item.id && item.name);
  } catch {
    return [];
  }
}

export function saveLocalSoloPlans(plans) {
  const safe = Array.isArray(plans) ? plans : [];
  const user = getStoredUser();
  const userId = user?.id || user?.firebaseUid || (user?.email ? `user_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}` : 'anonymous');
  const storageKey = `pp_local_soloplans_${userId}`;
  localStorage.setItem(storageKey, JSON.stringify(safe));
}

function generateRandomToken(len = 7) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

function generatePortableInviteToken(group) {
  return generateRandomToken(8).replace(/[^0-9]/g, '').padEnd(8, '0');
}

function decodePortableInviteToken(token) {
  if (!token) return null;
  try {
    let clean = token.trim();
    if (clean.startsWith('PJ_')) clean = clean.substring(3);
    clean = clean.replace(/-/g, '+').replace(/_/g, '/');
    while (clean.length % 4) clean += '=';
    const jsonStr = decodeURIComponent(escape(atob(clean)));
    const data = JSON.parse(jsonStr);
    if (data && data.id && data.name) return data;
  } catch (e) { }
  return null;
}

// ── Auth ──────────────────────────────────────────────────────
export const createSession = async (idToken) => {
  try {
    return await api.post('/auth/session', { idToken });
  } catch (err) {
    const user = getStoredUser();
    const mockPayload = btoa(unescape(encodeURIComponent(JSON.stringify({
      id: user.id || user.firebaseUid,
      name: user.name,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 86400 * 30,
    }))));
    const token = `header.${mockPayload}.signature`;
    return { data: { token, user } };
  }
};

// ── User ──────────────────────────────────────────────────────
export const getMe = async () => {
  try {
    return await api.get('/users/me');
  } catch (err) {
    return { data: getStoredUser() };
  }
};

// ── Spots ─────────────────────────────────────────────────────
export const getSpots = async (params = {}) => {
  try {
    return await api.get('/spots', { params });
  } catch (err) {
    let spots = [...DEFAULT_PANDALS];
    if (params.region && params.region !== 'All' && params.region !== 'Kolkata') {
      spots = spots.filter(s => s.region.toLowerCase().includes(params.region.toLowerCase()));
    }
    if (params.category && params.category !== 'All') {
      spots = spots.filter(s => s.category?.toLowerCase() === params.category.toLowerCase());
    }
    if (params.crowdLevel && params.crowdLevel !== 'All') {
      spots = spots.filter(s => s.crowdLevel?.toLowerCase() === params.crowdLevel.toLowerCase());
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      spots = spots.filter(s => s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q));
    }
    return { data: { spots, total: spots.length, page: 1, totalPages: 1 } };
  }
};

export const getSpotById = async (id) => {
  try {
    return await api.get(`/spots/${id}`);
  } catch (err) {
    const spot = DEFAULT_PANDALS.find(s => s.id === id) || DEFAULT_PANDALS[0];
    return { data: spot };
  }
};

// ── Groups ────────────────────────────────────────────────────
export const createGroup = async (data) => {
  const user = getStoredUser();
  try {
    const res = await api.post('/groups', data);
    if (res.data) {
      saveSharedGroup(res.data);
      const groups = getLocalGroups();
      groups.unshift(res.data);
      saveLocalGroups(groups);
      return res;
    }
  } catch (err) {
    console.warn('[API] createGroup API fallback:', err.message);
  }

  const tempGroup = {
    id: 'grp_' + Date.now(),
    name: data.name,
    region: data.region || 'Kolkata',
    visitDate: data.visitDate,
    startLocation: data.startLocation,
    adminId: user.id,
    createdAt: new Date().toISOString(),
    admin: { id: user.id, name: user.name, email: user.email, profileImage: user.profileImage },
    members: [{ id: 'mem_admin', userId: user.id, role: 'admin', user }],
    spots: [],
    _count: { members: 1, spots: 0 },
    myRole: 'admin',
  };
  tempGroup.inviteToken = generatePortableInviteToken(tempGroup);
  saveSharedGroup(tempGroup);
  const groups = getLocalGroups();
  groups.unshift(tempGroup);
  saveLocalGroups(groups);
  return { data: tempGroup };
};

export const getMyGroups = async () => {
  try {
    const res = await api.get('/groups');
    if (Array.isArray(res.data)) {
      saveLocalGroups(res.data);
      for (const g of res.data) {
        if (g && g.id) saveSharedGroup(g);
      }
      return res;
    }
  } catch (err) {
    console.warn('[API] getMyGroups using local cache:', err.message);
  }

  return { data: getLocalGroups() };
};

export const getGroupById = async (id) => {
  try {
    const res = await api.get(`/groups/${id}`);
    if (res.data && res.data.id) {
      saveSharedGroup(res.data);
      return res;
    }
  } catch (err) {
    console.warn('[API] getGroupById fallback to cache:', err.message);
  }

  const group = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
  if (group) return { data: group };
  throw new Error('Group not found');
};

export const deleteGroup = async (id) => {
  try {
    await api.delete(`/groups/${id}`);
  } catch (_) { }

  try {
    localStorage.removeItem(`pp_shared_group_${id}`);
  } catch (_) { }
  const groups = getLocalGroups().filter(g => g.id !== id);
  saveLocalGroups(groups);
  return { data: { success: true } };
};

export const regenerateInvite = async (id) => {
  try {
    return await api.post(`/groups/${id}/invite`);
  } catch (err) {
    const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
    if (grp) {
      grp.inviteToken = generatePortableInviteToken(grp);
      saveSharedGroup(grp);
      const groups = getLocalGroups().map(g => g.id === id ? { ...g, inviteToken: grp.inviteToken } : g);
      saveLocalGroups(groups);
      return { data: { inviteToken: grp.inviteToken } };
    }
    throw new Error('Group not found');
  }
};

export const getInviteInfo = async (token) => {
  let cleanToken = token ? decodeURIComponent(token).trim() : '';
  if (cleanToken.includes('/join/')) {
    cleanToken = cleanToken.split('/join/')[1].split('?')[0].split('#')[0].trim();
  }
  if (!cleanToken) throw new Error('Invite code is missing.');

  try {
    const res = await api.get(`/groups/invite-info/${encodeURIComponent(cleanToken)}`);
    if (res.data) return res;
  } catch (_) { }

  const decoded = decodePortableInviteToken(cleanToken);
  if (decoded && decoded.id && decoded.name) {
    return {
      data: {
        groupId: decoded.id,
        groupName: decoded.name,
        region: decoded.region || 'Kolkata',
        adminName: decoded.adminName || 'Admin',
        adminPhoto: decoded.adminPhoto || null,
        memberCount: 1,
        spotsCount: (decoded.spots || []).length,
      },
    };
  }

  const targetId = decoded?.id || cleanToken;
  const shared = getSharedGroup(targetId);
  if (shared) {
    return {
      data: {
        groupId: shared.id,
        groupName: shared.name,
        region: shared.region,
        adminName: shared.admin?.name || shared.adminName || 'Admin',
        adminPhoto: shared.admin?.profileImage || shared.adminPhoto || null,
        memberCount: shared.members?.length || 1,
        spotsCount: (shared.spots || []).length,
      },
    };
  }

  throw new Error('Invalid or expired invite link.');
};

export const joinGroup = async (token) => {
  const user = getStoredUser();
  let cleanToken = token ? decodeURIComponent(token).trim() : '';
  if (cleanToken.includes('/join/')) {
    cleanToken = cleanToken.split('/join/')[1].split('?')[0].split('#')[0].trim();
  }
  if (!cleanToken) throw new Error('Invite code is missing.');

  try {
    const res = await api.post(`/groups/join/${encodeURIComponent(cleanToken)}`);
    if (res.data && (res.data.id || res.data.groupId)) {
      const gData = { ...res.data, id: res.data.id || res.data.groupId, groupId: res.data.id || res.data.groupId };
      saveSharedGroup(gData);
      const groups = getLocalGroups();
      const existingIdx = groups.findIndex(g => g.id === gData.id);
      if (existingIdx !== -1) {
        groups[existingIdx] = gData;
      } else {
        groups.unshift(gData);
      }
      saveLocalGroups(groups);
      return { data: gData };
    }
  } catch (err) {
    console.warn('[API] joinGroup server error:', err.response?.data?.error || err.message);
  }

  // Portable token fallback
  const decoded = decodePortableInviteToken(cleanToken);
  const targetId = decoded?.id || cleanToken;
  let grp = getSharedGroup(targetId);

  if (!grp && decoded) {
    grp = {
      id: decoded.id,
      name: decoded.name,
      region: decoded.region || 'Kolkata',
      visitDate: decoded.visitDate || '',
      startLocation: decoded.startLocation || '',
      adminId: decoded.adminId,
      inviteToken: cleanToken,
      createdAt: decoded.createdAt || new Date().toISOString(),
      admin: {
        id: decoded.adminId,
        name: decoded.adminName || 'Admin',
        profileImage: decoded.adminPhoto || null,
      },
      members: [
        {
          id: 'mem_admin',
          userId: decoded.adminId,
          role: 'admin',
          user: { id: decoded.adminId, name: decoded.adminName || 'Admin', profileImage: decoded.adminPhoto || null },
        },
      ],
      spots: Array.isArray(decoded.spots) ? decoded.spots : [],
      _count: { members: 1, spots: Array.isArray(decoded.spots) ? decoded.spots.length : 0 },
    };
  }

  if (grp) {
    const isUserAdmin = isSameUser(grp.admin, user) || (grp.adminId && (grp.adminId === user.id || grp.adminId === user.firebaseUid));
    if ((!grp.spots || grp.spots.length === 0) && decoded?.spots && decoded.spots.length > 0) {
      grp.spots = decoded.spots;
    }
    const existingMemberIdx = (grp.members || []).findIndex(m => isSameUser(m, user));
    if (isUserAdmin) {
      const adminMember = (grp.members || []).find(m => m.role === 'admin' || isSameUser(m, user));
      if (adminMember) {
        adminMember.userId = user.id;
        adminMember.user = user;
      }
    } else if (existingMemberIdx !== -1) {
      grp.members[existingMemberIdx].user = user;
      grp.members[existingMemberIdx].userId = user.id;
    } else {
      grp.members = grp.members || [];
      grp.members.push({
        id: 'mem_' + Date.now(),
        userId: user.id,
        role: 'member',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profileImage: user.profileImage,
        },
      });
    }

    grp.members = deduplicateMembers(grp.members, grp.adminId, grp.admin);
    grp._count = {
      members: grp.members.length,
      spots: (grp.spots || []).length,
    };
    grp.myRole = isUserAdmin ? 'admin' : 'member';

    saveSharedGroup(grp);
    const groups = getLocalGroups();
    const existingIdx = groups.findIndex(g => g.id === grp.id);
    if (existingIdx !== -1) {
      groups[existingIdx] = grp;
    } else {
      groups.unshift(grp);
    }
    saveLocalGroups(groups);

    return { data: { ...grp, groupId: grp.id } };
  }

  throw new Error('Invalid or expired invite link.');
};

export const getMembers = async (id) => {
  try {
    return await api.get(`/groups/${id}/members`);
  } catch (err) {
    const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
    if (!grp) return { data: [] };
    const members = deduplicateMembers(grp.members || [], grp.adminId, grp.admin);
    return { data: members };
  }
};

export const removeMember = async (id, userId) => {
  try {
    return await api.delete(`/groups/${id}/members/${userId}`);
  } catch (err) {
    const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
    if (grp) {
      grp.members = (grp.members || []).filter(m => m.userId !== userId && m.id !== userId && m.user?.id !== userId);
      grp._count = grp._count || {};
      grp._count.members = grp.members.length;
      saveSharedGroup(grp);

      const groups = getLocalGroups().map(g => g.id === id ? grp : g);
      saveLocalGroups(groups);
    }
    return { data: { success: true } };
  }
};

export const leaveGroup = async (id) => {
  try {
    return await api.post(`/groups/${id}/leave`);
  } catch (err) {
    const user = getStoredUser();
    const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
    if (grp) {
      grp.members = (grp.members || []).filter(m =>
        m.userId !== user.id &&
        m.userId !== user.firebaseUid &&
        m.user?.id !== user.id &&
        m.user?.email !== user.email
      );
      if (grp._count) grp._count.members = grp.members.length;
      saveSharedGroup(grp);

      const groups = getLocalGroups().filter(g => g.id !== id);
      saveLocalGroups(groups);
    }
    return { data: { success: true } };
  }
};

export const addGroupSpot = async (id, spotId, spotData) => {
  const user = getStoredUser();
  const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
  const spot = (spotData && spotData.name)
    ? spotData
    : (DEFAULT_PANDALS.find(s => s.id === spotId || String(s.id).toLowerCase() === String(spotId).toLowerCase()) || spotData || {});

  if (grp && (spot.name || spotId)) {
    grp.spots = grp.spots || [];
    if (!grp.spots.some(s => s.spotId === spotId || s.id === spotId)) {
      grp.spots.push({
        id: 'gs_' + Date.now(),
        spotId,
        spot,
        addedBy: { id: user.id, name: user.name, profileImage: user.profileImage },
        status: 'suggested',
        voteCount: 0,
        iVoted: false,
        votes: [],
        createdAt: new Date().toISOString(),
      });
      grp._count = grp._count || {};
      grp._count.spots = grp.spots.length;
      saveSharedGroup(grp);
      const groups = getLocalGroups().map(g => g.id === id ? grp : g);
      saveLocalGroups(groups);
    }
  }

  try {
    return await api.post(`/groups/${id}/spots`, { spotId, spot });
  } catch (_) {
    return { data: grp };
  }
};

export const removeGroupSpot = async (id, spotId) => {
  const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
  if (grp) {
    grp.spots = (grp.spots || []).filter(s => s.spotId !== spotId && s.id !== spotId);
    grp._count = grp._count || {};
    grp._count.spots = grp.spots.length;
    saveSharedGroup(grp);
    const groups = getLocalGroups().map(g => g.id === id ? grp : g);
    saveLocalGroups(groups);
  }

  try {
    return await api.delete(`/groups/${id}/spots/${spotId}`);
  } catch (_) {
    return { data: { success: true } };
  }
};

export const voteGroupSpot = async (id, spotId) => {
  const user = getStoredUser();
  const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
  if (grp) {
    const sp = (grp.spots || []).find(s => s.spotId === spotId || s.id === spotId);
    if (sp) {
      if (sp.iVoted) {
        sp.iVoted = false;
        sp.voteCount = Math.max(0, (sp.voteCount || 1) - 1);
      } else {
        sp.iVoted = true;
        sp.voteCount = (sp.voteCount || 0) + 1;
      }
      saveSharedGroup(grp);
      const groups = getLocalGroups().map(g => g.id === id ? grp : g);
      saveLocalGroups(groups);
    }
  }

  try {
    return await api.post(`/groups/${id}/spots/${spotId}/vote`);
  } catch (_) {
    return { data: { success: true } };
  }
};

export const finalizeGroupSpot = async (id, spotId) => {
  const grp = getSharedGroup(id) || getLocalGroups().find(g => g.id === id);
  if (grp) {
    const sp = (grp.spots || []).find(s => s.spotId === spotId || s.id === spotId);
    if (sp) {
      sp.status = sp.status === 'finalized' ? 'suggested' : 'finalized';
      saveSharedGroup(grp);
      const groups = getLocalGroups().map(g => g.id === id ? grp : g);
      saveLocalGroups(groups);
    }
  }

  try {
    return await api.post(`/groups/${id}/spots/${spotId}/finalize`);
  } catch (_) {
    return { data: { success: true } };
  }
};

export const generateGroupRoute = async (id, data) => {
  try {
    return await api.post(`/groups/${id}/route`, data);
  } catch (err) {
    const startCoord = data.startCoordinates || [22.5726, 88.3639];
    const spots = data.spots || [];
    const startPoint = { name: 'Starting Point', lat: startCoord[0], lng: startCoord[1] };
    const stops = spots.map(s => ({ ...s, lat: s.latitude, lng: s.longitude }));
    const orderedWaypoints = solveNearestNeighbor(startPoint, stops);
    const orderedSpots = orderedWaypoints.slice(1);
    const coordinates = [startCoord, ...orderedSpots.map(s => [s.lat, s.lng])];
    const totalKm = orderedSpots.reduce((sum, s) => sum + (s.legDistanceKm || 0), 0);
    return {
      data: {
        route: {
          orderedSpots,
          geometry: { type: 'LineString', coordinates: coordinates.map(c => [c[1], c[0]]) },
          distanceKm: totalKm > 0 ? totalKm.toFixed(1) : '12.5',
          durationMins: Math.max(15, Math.round(totalKm * 3.5)) || 45,
          startCoordinates: startCoord,
        }
      }
    };
  }
};

// ── Messages & Live Tracking ─────────────────────────────────
export const getGroupMessages = async (id) => {
  if (!id) return { data: [] };
  const cacheKey = `pp_messages_${id}`;
  try {
    const res = await api.get(`/groups/${id}/messages`);
    if (Array.isArray(res.data)) {
      localStorage.setItem(cacheKey, JSON.stringify(res.data));
      return res;
    }
  } catch (err) {
    console.warn('[API] getGroupMessages network error, loading local message cache:', err.message);
  }

  // Fallback to local persistence cache so chat history NEVER vanishes
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Array.isArray(cached) && cached.length > 0) {
        return { data: cached };
      }
    }
  } catch (_) { }

  return { data: [] };
};

export const sendGroupMessage = async (id, payload) => {
  if (!id) return { data: null };
  const body = typeof payload === 'string' ? { text: payload } : payload;
  const user = getStoredUser();
  const cacheKey = `pp_messages_${id}`;

  let savedMsg = null;
  try {
    const res = await api.post(`/groups/${id}/messages`, body);
    if (res.data && res.data.id) {
      savedMsg = res.data;
    }
  } catch (err) {
    console.warn('[API] sendGroupMessage server save error, saving locally:', err.message);
  }

  if (!savedMsg) {
    savedMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      groupId: id,
      text: body?.text || '',
      imageUrl: body?.imageUrl || null,
      type: body?.type || (body?.imageUrl ? 'image' : 'text'),
      senderId: user.id,
      senderName: user.name,
      senderImage: user.profileImage,
      user: {
        id: user.id,
        name: user.name,
        profileImage: user.profileImage,
        email: user.email || '',
      },
      createdAt: new Date().toISOString(),
    };
  }

  // Persist into localStorage message store so it never vanishes
  try {
    const raw = localStorage.getItem(cacheKey);
    const list = raw ? JSON.parse(raw) : [];
    const exists = list.some(m => m.id === savedMsg.id || (m.text === savedMsg.text && m.senderId === savedMsg.senderId && Math.abs(new Date(m.createdAt) - new Date(savedMsg.createdAt)) < 2000));
    if (!exists) {
      list.push(savedMsg);
      if (list.length > 500) list.shift();
      localStorage.setItem(cacheKey, JSON.stringify(list));
    }
  } catch (_) { }

  return { data: savedMsg };
};

export const getGroupLocations = async (id) => {
  try {
    const res = await api.get(`/groups/${id}/locations`);
    if (Array.isArray(res.data)) return res;
  } catch (_) { }

  const raw = localStorage.getItem(`pp_locs_${id}`);
  return { data: raw ? JSON.parse(raw) : [] };
};

export const updateGroupLocation = async (id, data) => {
  const user = getStoredUser();
  const raw = localStorage.getItem(`pp_locs_${id}`);
  let locs = raw ? JSON.parse(raw) : [];
  locs = locs.filter(l => l.userId !== user.id);
  locs.push({
    userId: user.id,
    userName: user.name,
    profileImage: user.profileImage,
    latitude: data.latitude,
    longitude: data.longitude,
    lastLocationUpdate: new Date().toISOString(),
    isSharingLocation: data.isSharingLocation ?? true,
  });
  localStorage.setItem(`pp_locs_${id}`, JSON.stringify(locs));

  try {
    return await api.post(`/groups/${id}/location`, data);
  } catch (_) {
    return { data: { success: true } };
  }
};

// ── Calling & Signaling Services (Stream Video & Socket.io) ──
export const STREAM_API_KEY = 'bazavn2fpwsf';
export const STREAM_API_SECRET = 'y5wbvp69z4m25cvbyz2zvyc3wtjxp3rgya5w5j46k62xds58y3q5u5sbqsz4cqpy';

// Pure JavaScript SHA-256 implementation (zero browser/crypto dependency)
function pureSha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;
  var result = '';
  var words = [];
  var asciiBitLength = ascii[lengthProperty] * 8;
  var hash = [];
  var k = [];
  var primeCounter = 0;
  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, (j += 16));
    var oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];
      var a = hash[0], e = hash[4];
      var temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
              (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
              w[i - 7] +
              (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
            0);
      var temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      var b = (hash[i] >>> (j * 8)) & 255;
      result += String.fromCharCode(b);
    }
  }
  return result;
}

// Pure JavaScript HMAC-SHA256
function pureHmacSha256(key, message) {
  var blockSize = 64;
  if (key.length > blockSize) {
    key = pureSha256(key);
  }
  while (key.length < blockSize) {
    key += '\x00';
  }
  var oKeyPad = '', iKeyPad = '';
  for (var i = 0; i < blockSize; i++) {
    oKeyPad += String.fromCharCode(key.charCodeAt(i) ^ 0x5c);
    iKeyPad += String.fromCharCode(key.charCodeAt(i) ^ 0x36);
  }
  return pureSha256(oKeyPad + pureSha256(iKeyPad + message));
}

export function generateClientStreamToken(userId) {
  try {
    const cleanUid = String(userId || 'user_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { user_id: cleanUid, iat: now, exp: now + 86400 * 30 };

    const b64Url = (str) => {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };

    const headB64 = b64Url(JSON.stringify(header));
    const payB64 = b64Url(JSON.stringify(payload));
    const dataToSign = `${headB64}.${payB64}`;

    const rawSig = pureHmacSha256(STREAM_API_SECRET, dataToSign);
    const sigB64 = btoa(rawSig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${dataToSign}.${sigB64}`;
  } catch (e) {
    console.warn('[Stream] Pure JS token generation error:', e.message);
  }
  return null;
}

export const getStreamCallToken = async (groupId, callId) => {
  const user = getStoredUser();
  const rawUid = user.id || user.uid || user.firebaseUid || 'user_' + Date.now();
  const userId = String(rawUid).replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetCallId = String(callId || (groupId ? `group_${groupId}` : 'pujo_call_' + Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    const res = await api.post('/calls/stream-token', { groupId, callId: targetCallId });
    if (res.data && res.data.token) return res;
  } catch (err) {
    try {
      const res = await api.post('/calls/token', { groupId, callId: targetCallId });
      if (res.data && res.data.token) return res;
    } catch (e) {
      console.warn('[API] getStreamCallToken server error, falling back to direct token generator:', e.message);
    }
  }

  // Generate valid Stream Video token client-side so calls work directly on APK/Web
  const fallbackToken = await generateClientStreamToken(userId);

  return {
    data: {
      token: fallbackToken,
      apiKey: STREAM_API_KEY,
      userId,
      userName: user.name || 'Group Member',
      userImage: user.profileImage || undefined,
      callId: targetCallId,
      callType: 'default',
    },
  };
};

export const sendCallSignal = async (groupId, signalData = {}) => {
  if (!groupId) return { data: { success: false } };
  try {
    const res = await api.post(`/groups/${groupId}/call/signal`, { groupId, ...signalData });
    if (res.data) return res;
  } catch (_) {
    try {
      const res = await api.post('/calls/signal', { groupId, ...signalData });
      if (res.data) return res;
    } catch (err) {
      console.warn('[API] sendCallSignal error:', err.message);
    }
  }
  return { data: { success: false } };
};

export const getCallStatus = async (groupId) => {
  if (!groupId) return { data: { active: false, call: null } };
  try {
    const res = await api.get(`/groups/${groupId}/call/status`);
    if (res.data) return res;
  } catch (_) {
    try {
      const res = await api.get('/calls/status', { params: { groupId } });
      if (res.data) return res;
    } catch (err) {
      console.warn('[API] getCallStatus error:', err.message);
    }
  }
  return { data: { active: false, call: null } };
};

// ── Solo Plans (MongoDB Express API) ─────────────────────────
export const createSoloPlan = async (data) => {
  try {
    const res = await api.post('/solo-plans', data);
    if (res.data) return res;
  } catch (err) {
    console.warn('[API] createSoloPlan error:', err.message);
  }

  const user = getStoredUser();
  const newPlan = {
    id: 'solo_' + Date.now(),
    name: data.name || 'My Solo Plan',
    region: data.region || 'Kolkata',
    visitDate: data.visitDate,
    startLocation: data.startLocation,
    createdAt: new Date().toISOString(),
    spots: [],
  };
  return { data: newPlan };
};

export const getMySoloPlans = async () => {
  try {
    const res = await api.get('/solo-plans');
    if (Array.isArray(res.data)) return res;
  } catch (err) {
    console.warn('[API] getMySoloPlans error:', err.message);
  }

  return { data: [] };
};

export const deleteSoloPlan = async (id) => {
  try {
    await api.delete(`/solo-plans/${id}`);
  } catch (_) { }

  return { data: { success: true } };
};

export const getSoloPlanById = async (id) => {
  try {
    const res = await api.get(`/solo-plans/${id}`);
    if (res.data) return res;
  } catch (err) {
    console.warn('[API] getSoloPlanById error:', err.message);
  }

  throw new Error('Plan not found');
};

export const addSoloPlanSpot = async (id, spotId, spotData) => {
  const spot = (spotData && spotData.name)
    ? spotData
    : (DEFAULT_PANDALS.find(s => s.id === spotId || String(s.id).toLowerCase() === String(spotId).toLowerCase()) || spotData || {});

  try {
    const res = await api.post(`/solo-plans/${id}/spots`, { spotId, spot });
    if (res.data) return res;
  } catch (err) {
    console.warn('[API] addSoloPlanSpot error:', err.message);
  }

  throw new Error('Plan not found');
};

export const removeSoloPlanSpot = async (id, spotId) => {
  try {
    await api.delete(`/solo-plans/${id}/spots/${spotId}`);
    return { data: { success: true } };
  } catch (err) {
    console.warn('[API] removeSoloPlanSpot error:', err.message);
  }

  return { data: { success: true } };
};

export const generateSoloRoute = async (id, data) => {
  try {
    return await api.post(`/solo-plans/${id}/route`, data);
  } catch (err) {
    const startCoord = data.startCoordinates || [22.5726, 88.3639];
    const spots = data.spots || [];
    const startPoint = { name: 'Starting Point', lat: startCoord[0], lng: startCoord[1] };
    const stops = spots.map(s => ({ ...s, lat: s.latitude, lng: s.longitude }));
    const orderedWaypoints = solveNearestNeighbor(startPoint, stops);
    const orderedSpots = orderedWaypoints.slice(1);
    const coordinates = [startCoord, ...orderedSpots.map(s => [s.lat, s.lng])];
    const totalKm = orderedSpots.reduce((sum, s) => sum + (s.legDistanceKm || 0), 0);
    return {
      data: {
        route: {
          orderedSpots,
          geometry: { type: 'LineString', coordinates: coordinates.map(c => [c[1], c[0]]) },
          distanceKm: totalKm > 0 ? totalKm.toFixed(1) : '12.5',
          durationMins: Math.max(15, Math.round(totalKm * 3.5)) || 45,
          startCoordinates: startCoord,
        }
      }
    };
  }
};

export default api;
