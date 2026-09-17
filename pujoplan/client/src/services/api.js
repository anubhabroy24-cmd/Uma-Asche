import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
    if (err.response?.status === 401) {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const createSession = (idToken) => api.post('/auth/session', { idToken });

// ── User ──────────────────────────────────────────────────────
export const getMe = () => api.get('/users/me');

// ── Spots ─────────────────────────────────────────────────────
export const getSpots = (params) => api.get('/spots', { params });
export const getSpotById = (id) => api.get(`/spots/${id}`);

// ── Groups ────────────────────────────────────────────────────
export const createGroup = (data) => api.post('/groups', data);
export const getMyGroups = () => api.get('/groups');
export const getGroupById = (id) => api.get(`/groups/${id}`);
export const deleteGroup = (id) => api.delete(`/groups/${id}`);
export const regenerateInvite = (id) => api.post(`/groups/${id}/invite`);
export const getInviteInfo = (token) => api.get(`/groups/invite-info/${token}`);
export const joinGroup = (token) => api.post(`/groups/join/${token}`);
export const getMembers = (id) => api.get(`/groups/${id}/members`);
export const removeMember = (id, userId) => api.delete(`/groups/${id}/members/${userId}`);

export const addGroupSpot = (id, spotId) => api.post(`/groups/${id}/spots`, { spotId });
export const removeGroupSpot = (id, spotId) => api.delete(`/groups/${id}/spots/${spotId}`);
export const voteGroupSpot = (id, spotId) => api.post(`/groups/${id}/spots/${spotId}/vote`);
export const finalizeGroupSpot = (id, spotId) => api.post(`/groups/${id}/spots/${spotId}/finalize`);
export const generateGroupRoute = (id, data) => api.post(`/groups/${id}/route`, data);

export const getGroupMessages = (id) => api.get(`/groups/${id}/messages`);
export const sendGroupMessage = (id, text) => api.post(`/groups/${id}/messages`, { text });
export const getGroupLocations = (id) => api.get(`/groups/${id}/locations`);
export const updateGroupLocation = (id, data) => api.post(`/groups/${id}/location`, data);

// ── Solo Plans ────────────────────────────────────────────────
export const createSoloPlan = (data) => api.post('/solo-plans', data);
export const getMySoloPlans = () => api.get('/solo-plans');
export const deleteSoloPlan = (id) => api.delete(`/solo-plans/${id}`);
export const getSoloPlanById = (id) => api.get(`/solo-plans/${id}`);
export const addSoloPlanSpot = (id, spotId) => api.post(`/solo-plans/${id}/spots`, { spotId });
export const removeSoloPlanSpot = (id, spotId) => api.delete(`/solo-plans/${id}/spots/${spotId}`);
export const generateSoloRoute = (id, data) => api.post(`/solo-plans/${id}/route`, data);

export default api;
