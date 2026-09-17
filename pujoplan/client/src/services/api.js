import axios from 'axios';
import { DEFAULT_PANDALS } from '../data/defaultPandals';
import { solveNearestNeighbor } from '../utils/routeOptimizer';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token and reload
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/session')) {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

// ─── Local DB Helper for Standalone / Netlify / APK Mode ───────────
function getStoredUser() {
  try {
    const raw = localStorage.getItem('pp_user');
    return raw ? JSON.parse(raw) : { id: 'local-user', name: 'User' };
  } catch {
    return { id: 'local-user', name: 'User' };
  }
}

function getLocalGroups() {
  try {
    return JSON.parse(localStorage.getItem('pp_local_groups') || '[]');
  } catch {
    return [];
  }
}

function saveLocalGroups(groups) {
  localStorage.setItem('pp_local_groups', JSON.stringify(groups));
}

function getLocalSoloPlans() {
  try {
    return JSON.parse(localStorage.getItem('pp_local_soloplans') || '[]');
  } catch {
    return [];
  }
}

function saveLocalSoloPlans(plans) {
  localStorage.setItem('pp_local_soloplans', JSON.stringify(plans));
}

function generateRandomToken(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

// ── Auth ──────────────────────────────────────────────────────
export const createSession = async (idToken) => {
  try {
    return await api.post('/auth/session', { idToken });
  } catch (err) {
    const user = getStoredUser();
    return { data: { token: 'local-token', user } };
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
    if (params.search) {
      const q = params.search.toLowerCase();
      spots = spots.filter(s => s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q));
    }
    return { data: spots };
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
  try {
    return await api.post('/groups', data);
  } catch (err) {
    const user = getStoredUser();
    const newGroup = {
      id: 'grp_' + Date.now(),
      name: data.name,
      region: data.region || 'Kolkata',
      visitDate: data.visitDate,
      startLocation: data.startLocation,
      adminId: user.id,
      inviteToken: generateRandomToken(8),
      createdAt: new Date().toISOString(),
      admin: { id: user.id, name: user.name, email: user.email, profileImage: user.profileImage },
      members: [{ id: 'mem_' + Date.now(), userId: user.id, role: 'admin', user }],
      spots: [],
      _count: { members: 1, spots: 0 },
      myRole: 'admin',
    };
    const groups = getLocalGroups();
    groups.unshift(newGroup);
    saveLocalGroups(groups);
    return { data: newGroup };
  }
};

export const getMyGroups = async () => {
  try {
    return await api.get('/groups');
  } catch (err) {
    return { data: getLocalGroups() };
  }
};

export const getGroupById = async (id) => {
  try {
    return await api.get(`/groups/${id}`);
  } catch (err) {
    const groups = getLocalGroups();
    const group = groups.find(g => g.id === id);
    if (!group) throw new Error('Group not found');
    return { data: group };
  }
};

export const deleteGroup = async (id) => {
  try {
    return await api.delete(`/groups/${id}`);
  } catch (err) {
    const groups = getLocalGroups().filter(g => g.id !== id);
    saveLocalGroups(groups);
    return { data: { success: true } };
  }
};

export const regenerateInvite = async (id) => {
  try {
    return await api.post(`/groups/${id}/invite`);
  } catch (err) {
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    if (grp) {
      grp.inviteToken = generateRandomToken(8);
      saveLocalGroups(groups);
      return { data: { inviteToken: grp.inviteToken } };
    }
    throw new Error('Group not found');
  }
};

export const getInviteInfo = async (token) => {
  try {
    return await api.get(`/groups/invite-info/${token}`);
  } catch (err) {
    const groups = getLocalGroups();
    const grp = groups.find(g => g.inviteToken === token);
    if (!grp) throw new Error('Invalid or expired invite link.');
    return {
      data: {
        groupId: grp.id,
        groupName: grp.name,
        region: grp.region,
        adminName: grp.admin?.name || 'Admin',
        adminPhoto: grp.admin?.profileImage,
        memberCount: grp.members?.length || 1,
      },
    };
  }
};

export const joinGroup = async (token) => {
  try {
    return await api.post(`/groups/join/${token}`);
  } catch (err) {
    const user = getStoredUser();
    const groups = getLocalGroups();
    const grp = groups.find(g => g.inviteToken === token);
    if (!grp) throw new Error('Invalid or expired invite link.');
    if (!grp.members.some(m => m.userId === user.id)) {
      grp.members.push({ id: 'mem_' + Date.now(), userId: user.id, role: 'member', user });
      grp._count.members = grp.members.length;
      saveLocalGroups(groups);
    }
    return { data: grp };
  }
};

export const getMembers = async (id) => {
  try {
    return await api.get(`/groups/${id}/members`);
  } catch (err) {
    const grp = getLocalGroups().find(g => g.id === id);
    return { data: grp?.members || [] };
  }
};

export const removeMember = async (id, userId) => {
  try {
    return await api.delete(`/groups/${id}/members/${userId}`);
  } catch (err) {
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    if (grp) {
      grp.members = grp.members.filter(m => m.userId !== userId);
      grp._count.members = grp.members.length;
      saveLocalGroups(groups);
    }
    return { data: { success: true } };
  }
};

export const addGroupSpot = async (id, spotId) => {
  try {
    return await api.post(`/groups/${id}/spots`, { spotId });
  } catch (err) {
    const user = getStoredUser();
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    const spot = DEFAULT_PANDALS.find(s => s.id === spotId);
    if (grp && spot) {
      if (!grp.spots.some(s => s.spotId === spotId)) {
        grp.spots.push({
          id: 'gs_' + Date.now(),
          spotId,
          spot,
          addedBy: user,
          status: 'suggested',
          voteCount: 0,
          iVoted: false,
          votes: [],
          createdAt: new Date().toISOString(),
        });
        grp._count.spots = grp.spots.length;
        saveLocalGroups(groups);
      }
    }
    return { data: grp };
  }
};

export const removeGroupSpot = async (id, spotId) => {
  try {
    return await api.delete(`/groups/${id}/spots/${spotId}`);
  } catch (err) {
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    if (grp) {
      grp.spots = grp.spots.filter(s => s.spotId !== spotId && s.id !== spotId);
      grp._count.spots = grp.spots.length;
      saveLocalGroups(groups);
    }
    return { data: { success: true } };
  }
};

export const voteGroupSpot = async (id, spotId) => {
  try {
    return await api.post(`/groups/${id}/spots/${spotId}/vote`);
  } catch (err) {
    const user = getStoredUser();
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    if (grp) {
      const sp = grp.spots.find(s => s.spotId === spotId || s.id === spotId);
      if (sp) {
        if (sp.iVoted) {
          sp.iVoted = false;
          sp.voteCount = Math.max(0, sp.voteCount - 1);
        } else {
          sp.iVoted = true;
          sp.voteCount = (sp.voteCount || 0) + 1;
        }
        saveLocalGroups(groups);
      }
    }
    return { data: { success: true } };
  }
};

export const finalizeGroupSpot = async (id, spotId) => {
  try {
    return await api.post(`/groups/${id}/spots/${spotId}/finalize`);
  } catch (err) {
    const groups = getLocalGroups();
    const grp = groups.find(g => g.id === id);
    if (grp) {
      const sp = grp.spots.find(s => s.spotId === spotId || s.id === spotId);
      if (sp) {
        sp.status = sp.status === 'finalized' ? 'suggested' : 'finalized';
        saveLocalGroups(groups);
      }
    }
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
  try {
    return await api.get(`/groups/${id}/messages`);
  } catch (err) {
    const raw = localStorage.getItem(`pp_chat_${id}`);
    return { data: raw ? JSON.parse(raw) : [] };
  }
};

export const sendGroupMessage = async (id, text) => {
  try {
    return await api.post(`/groups/${id}/messages`, { text });
  } catch (err) {
    const user = getStoredUser();
    const raw = localStorage.getItem(`pp_chat_${id}`);
    const msgs = raw ? JSON.parse(raw) : [];
    const newMsg = {
      id: 'msg_' + Date.now(),
      text,
      userId: user.id,
      userName: user.name,
      createdAt: new Date().toISOString(),
    };
    msgs.push(newMsg);
    localStorage.setItem(`pp_chat_${id}`, JSON.stringify(msgs));
    return { data: newMsg };
  }
};

export const getGroupLocations = async (id) => {
  try {
    return await api.get(`/groups/${id}/locations`);
  } catch (err) {
    const raw = localStorage.getItem(`pp_locs_${id}`);
    return { data: raw ? JSON.parse(raw) : [] };
  }
};

export const updateGroupLocation = async (id, data) => {
  try {
    return await api.post(`/groups/${id}/location`, data);
  } catch (err) {
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
    return { data: { success: true } };
  }
};

// ── Solo Plans ────────────────────────────────────────────────
export const createSoloPlan = async (data) => {
  try {
    return await api.post('/solo-plans', data);
  } catch (err) {
    const newPlan = {
      id: 'solo_' + Date.now(),
      name: data.name || 'My Solo Plan',
      region: data.region || 'Kolkata',
      visitDate: data.visitDate,
      startLocation: data.startLocation,
      createdAt: new Date().toISOString(),
      spots: [],
    };
    const plans = getLocalSoloPlans();
    plans.unshift(newPlan);
    saveLocalSoloPlans(plans);
    return { data: newPlan };
  }
};

export const getMySoloPlans = async () => {
  try {
    return await api.get('/solo-plans');
  } catch (err) {
    return { data: getLocalSoloPlans() };
  }
};

export const deleteSoloPlan = async (id) => {
  try {
    return await api.delete(`/solo-plans/${id}`);
  } catch (err) {
    const plans = getLocalSoloPlans().filter(p => p.id !== id);
    saveLocalSoloPlans(plans);
    return { data: { success: true } };
  }
};

export const getSoloPlanById = async (id) => {
  try {
    return await api.get(`/solo-plans/${id}`);
  } catch (err) {
    const plans = getLocalSoloPlans();
    const plan = plans.find(p => p.id === id);
    if (!plan) throw new Error('Plan not found');
    return { data: plan };
  }
};

export const addSoloPlanSpot = async (id, spotId) => {
  try {
    return await api.post(`/solo-plans/${id}/spots`, { spotId });
  } catch (err) {
    const plans = getLocalSoloPlans();
    const plan = plans.find(p => p.id === id);
    const spot = DEFAULT_PANDALS.find(s => s.id === spotId);
    if (plan && spot) {
      if (!plan.spots.some(s => s.spotId === spotId)) {
        plan.spots.push({
          id: 'sps_' + Date.now(),
          spotId,
          spot,
          visitOrder: plan.spots.length,
        });
        saveLocalSoloPlans(plans);
      }
    }
    return { data: plan };
  }
};

export const removeSoloPlanSpot = async (id, spotId) => {
  try {
    return await api.delete(`/solo-plans/${id}/spots/${spotId}`);
  } catch (err) {
    const plans = getLocalSoloPlans();
    const plan = plans.find(p => p.id === id);
    if (plan) {
      plan.spots = plan.spots.filter(s => s.spotId !== spotId && s.id !== spotId);
      saveLocalSoloPlans(plans);
    }
    return { data: { success: true } };
  }
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
