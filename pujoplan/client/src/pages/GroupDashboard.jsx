import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../layouts/AppLayout';
import PujaMap from '../components/PujaMap';
import GroupChat from '../components/GroupChat';
import GmapsBottomSheet from '../components/GmapsBottomSheet';
import DistanceChatbot from '../components/DistanceChatbot';
import { solveNearestNeighbor, calculateLegDistances } from '../utils/routeOptimizer';
import { DEFAULT_PANDALS } from '../data/defaultPandals';
import {
  getGroupById, voteGroupSpot, removeGroupSpot,
  finalizeGroupSpot, generateGroupRoute,
  removeMember, leaveGroup, regenerateInvite, deleteGroup,
  getGroupLocations, updateGroupLocation, deduplicateMembers,
} from '../services/api';
import { subscribeToGroupUpdates } from '../services/socket';
import { getReliableCurrentLocation } from '../services/routingService';
import {
  MapPin, Plus, ThumbsUp, Trash2, Copy, Share2,
  Check, Star, Route, Users, ChevronDown, ChevronUp, AlertTriangle,
  MessageSquare, Navigation, ArrowLeft, EyeOff, Compass, LogOut,
} from 'lucide-react';
import './GroupDashboard.css';

function isGenericEmail(email) {
  if (!email) return true;
  const em = email.toLowerCase().trim();
  return (
    em.endsWith('@pujoplan.app') ||
    em.endsWith('@pujoplan.dev') ||
    em.endsWith('@demo.com') ||
    em.includes('local-user')
  );
}

function findMatchingPandal(targetId, targetName) {
  if (!targetId && !targetName) return null;
  const tid = String(targetId || '').toLowerCase().trim();
  const tidNum = tid.replace(/[^0-9]/g, '');
  const tname = String(targetName || '').toLowerCase().trim();

  return DEFAULT_PANDALS.find((p) => {
    const pid = String(p.id || '').toLowerCase().trim();
    const pidNum = pid.replace(/[^0-9]/g, '');
    const pname = String(p.name || '').toLowerCase().trim();

    if (tid && (pid === tid || pid.replace(/[^a-z0-9]/g, '') === tid.replace(/[^a-z0-9]/g, ''))) return true;
    if (tidNum && pidNum && parseInt(tidNum, 10) === parseInt(pidNum, 10)) return true;
    if (tname && tname !== 'pandal spot' && (pname === tname || pname.includes(tname) || tname.includes(pname))) return true;
    return false;
  }) || null;
}

function normalizeGroup(rawGroup) {
  if (!rawGroup) return null;
  const rawSpots = Array.isArray(rawGroup.spots) ? rawGroup.spots : [];
  const spots = rawSpots.map((s) => {
    const spotId = s.spotId || s.spot?.id || s.id;
    let spotObj = (s.spot && s.spot.name) ? { ...s.spot } : (s.spot || {});
    if (!spotObj.name || !spotObj.latitude) {
      const found = findMatchingPandal(spotId, spotObj?.name || s?.name);
      if (found) {
        spotObj = { ...found, ...spotObj };
      }
    }
    return {
      ...s,
      id: s.id || `gs_${spotId}`,
      spotId,
      spot: spotObj,
      status: s.status || 'suggested',
      voteCount: s.voteCount || 0,
      iVoted: Boolean(s.iVoted),
      addedBy: s.addedBy || { name: 'Member' },
    };
  });

  const rawMembers = Array.isArray(rawGroup.members) ? rawGroup.members : [];
  return {
    ...rawGroup,
    name: rawGroup.name || 'Group Plan',
    members: rawMembers,
    spots,
    _count: {
      members: rawMembers.length,
      spots: spots.length,
    },
  };
}

const CROWD_CLR = {
  'Very High': 'var(--red)',
  'High': '#ff9900',
  'Moderate': 'var(--gray-light)',
  'Low': '#44bbaa',
};

const KNOWN_START_COORDS = {
  'howrah railway station': { lat: 22.5839, lng: 88.3424 },
  'howrah station': { lat: 22.5839, lng: 88.3424 },
  'howrah': { lat: 22.5839, lng: 88.3424 },
  'sealdah station': { lat: 22.5701, lng: 88.3698 },
  'sealdah': { lat: 22.5701, lng: 88.3698 },
  'shalimar': { lat: 22.5574, lng: 88.3242 },
  'santragachi': { lat: 22.5800, lng: 88.2780 },
  'bagbazar': { lat: 22.6025, lng: 88.3688 },
  'kumartuli': { lat: 22.5992, lng: 88.3664 },
  'sovabazar': { lat: 22.5962, lng: 88.3653 },
  'ahiritola': { lat: 22.5938, lng: 88.3582 },
  'hatibagan': { lat: 22.5980, lng: 88.3725 },
  'shyambazar': { lat: 22.6022, lng: 88.3712 },
  'girish park': { lat: 22.5862, lng: 88.3620 },
  'mohammad ali park': { lat: 22.5815, lng: 88.3601 },
  'college square': { lat: 22.5746, lng: 88.3639 },
  'college street': { lat: 22.5746, lng: 88.3639 },
  'mg road': { lat: 22.5812, lng: 88.3645 },
  'central': { lat: 22.5726, lng: 88.3639 },
  'chandni chowk': { lat: 22.5678, lng: 88.3556 },
  'esplanade': { lat: 22.5645, lng: 88.3533 },
  'dharmatala': { lat: 22.5645, lng: 88.3533 },
  'new market': { lat: 22.5601, lng: 88.3524 },
  'park street': { lat: 22.5518, lng: 88.3524 },
  'maidan': { lat: 22.5462, lng: 88.3430 },
  'rabindra sadan': { lat: 22.5385, lng: 88.3468 },
  'exide': { lat: 22.5385, lng: 88.3468 },
  'victoria memorial': { lat: 22.5448, lng: 88.3426 },
  'netaji bhavan': { lat: 22.5338, lng: 88.3475 },
  'jatin das park': { lat: 22.5290, lng: 88.3472 },
  'hazra': { lat: 22.5230, lng: 88.3470 },
  'bhowanipore': { lat: 22.5300, lng: 88.3480 },
  'kalighat': { lat: 22.5261, lng: 88.3432 },
  'chetla': { lat: 22.5201, lng: 88.3418 },
  'rashbehari': { lat: 22.5180, lng: 88.3520 },
  'rabindra sarobar': { lat: 22.5122, lng: 88.3475 },
  'southern avenue': { lat: 22.5115, lng: 88.3550 },
  'deshapriya park': { lat: 22.5195, lng: 88.3562 },
  'maddox square': { lat: 22.5292, lng: 88.3592 },
  'ballygunge': { lat: 22.5255, lng: 88.3601 },
  'ballygunge phari': { lat: 22.5270, lng: 88.3650 },
  'gariahat': { lat: 22.5186, lng: 88.3650 },
  'ekdalia': { lat: 22.5186, lng: 88.3657 },
  'singhi park': { lat: 22.5209, lng: 88.3642 },
  'dhakuria': { lat: 22.5106, lng: 88.3704 },
  'jadavpur': { lat: 22.4985, lng: 88.3755 },
  'tollygunge': { lat: 22.4990, lng: 88.3471 },
  'kudghat': { lat: 22.4850, lng: 88.3440 },
  'bansdroni': { lat: 22.4740, lng: 88.3520 },
  'naktala': { lat: 22.4750, lng: 88.3680 },
  'garia': { lat: 22.4640, lng: 88.3840 },
  'patuli': { lat: 22.4780, lng: 88.3880 },
  'santoshpur': { lat: 22.4950, lng: 88.3880 },
  'kasba': { lat: 22.5150, lng: 88.3850 },
  'ruby': { lat: 22.5130, lng: 88.4030 },
  'anandapur': { lat: 22.5180, lng: 88.4150 },
  'mukundapur': { lat: 22.4950, lng: 88.4020 },
  'topsia': { lat: 22.5400, lng: 88.3850 },
  'tangra': { lat: 22.5530, lng: 88.3870 },
  'entally': { lat: 22.5580, lng: 88.3700 },
  'beliaghata': { lat: 22.5658, lng: 88.3905 },
  'phoolbagan': { lat: 22.5714, lng: 88.3912 },
  'kankurgachi': { lat: 22.5768, lng: 88.3888 },
  'maniktala': { lat: 22.5862, lng: 88.3734 },
  'ultadanga': { lat: 22.5957, lng: 88.3861 },
  'lake town': { lat: 22.5996, lng: 88.3986 },
  'sree bhumi': { lat: 22.5996, lng: 88.3986 },
  'sreebhumi': { lat: 22.5996, lng: 88.3986 },
  'vip road': { lat: 22.6050, lng: 88.4100 },
  'salt lake': { lat: 22.5867, lng: 88.4178 },
  'salt lake sector 5': { lat: 22.5735, lng: 88.4331 },
  'sector v': { lat: 22.5735, lng: 88.4331 },
  'new town': { lat: 22.5862, lng: 88.4789 },
  'rajarhat': { lat: 22.6167, lng: 88.5000 },
  'dum dum': { lat: 22.6517, lng: 88.3986 },
  'airport': { lat: 22.6547, lng: 88.4467 },
  'belgharia': { lat: 22.6600, lng: 88.3800 },
  'dunlop': { lat: 22.6500, lng: 88.3750 },
  'barranagar': { lat: 22.6400, lng: 88.3700 },
  'alipore': { lat: 22.5320, lng: 88.3300 },
  'new alipore': { lat: 22.5085, lng: 88.3341 },
  'behala': { lat: 22.5016, lng: 88.3135 },
  'taratala': { lat: 22.5110, lng: 88.3180 },
  'tarratala': { lat: 22.5110, lng: 88.3180 },
  'thakurpukur': { lat: 22.4600, lng: 88.3000 },
  'joka': { lat: 22.4400, lng: 88.2900 },
  // Howrah & Outer Suburbs
  'amta': { lat: 22.57828, lng: 88.00922 },
  'amta station': { lat: 22.5744, lng: 88.0189 },
  'bagnan': { lat: 22.4690, lng: 87.9710 },
  'uluberia': { lat: 22.4744, lng: 88.1090 },
  'domjur': { lat: 22.6416, lng: 88.2235 },
  'andul': { lat: 22.5855, lng: 88.2435 },
  'dankuni': { lat: 22.6865, lng: 88.2936 },
  'kolaghat': { lat: 22.4330, lng: 87.8730 },
  'panskura': { lat: 22.4200, lng: 87.7300 },
  'tamluk': { lat: 22.3000, lng: 87.9200 },
  'haldia': { lat: 22.0667, lng: 88.0667 },
  'mecheda': { lat: 22.4300, lng: 87.8600 },
  'kharagpur': { lat: 22.3300, lng: 87.3200 },
  'midnapore': { lat: 22.4200, lng: 87.3200 },
  'medinipur': { lat: 22.4200, lng: 87.3200 },
  'serampore': { lat: 22.7500, lng: 88.3400 },
  'shrirampur': { lat: 22.7500, lng: 88.3400 },
  'rishra': { lat: 22.7100, lng: 88.3500 },
  'konnagar': { lat: 22.7000, lng: 88.3500 },
  'uttarpara': { lat: 22.6700, lng: 88.3500 },
  'bally': { lat: 22.6500, lng: 88.3400 },
  'chandannagar': { lat: 22.8700, lng: 88.3700 },
  'chinsurah': { lat: 22.9000, lng: 88.3900 },
  'hooghly': { lat: 22.9000, lng: 88.3900 },
  'bandel': { lat: 22.9200, lng: 88.3700 },
  'singur': { lat: 22.8100, lng: 88.2300 },
  'tarakeswar': { lat: 22.8872, lng: 88.0200 },
  'barasat': { lat: 22.7200, lng: 88.4800 },
  'madhyamgram': { lat: 22.7000, lng: 88.4500 },
  'habra': { lat: 22.8362, lng: 88.6318 },
  'barrackpore': { lat: 22.7600, lng: 88.3700 },
  'sodepur': { lat: 22.7000, lng: 88.3900 },
  'khardah': { lat: 22.7200, lng: 88.3800 },
  'titagarh': { lat: 22.7400, lng: 88.3700 },
  'naihati': { lat: 22.9000, lng: 88.4200 },
  'bhatpara': { lat: 22.8700, lng: 88.4100 },
  'kalyani': { lat: 22.9750, lng: 88.4344 },
  'ranaghat': { lat: 23.1800, lng: 88.5800 },
  'santipur': { lat: 23.2500, lng: 88.4300 },
  'krishnanagar': { lat: 23.4000, lng: 88.5000 },
  'sonarpur': { lat: 22.4400, lng: 88.4300 },
  'baruipur': { lat: 22.3600, lng: 88.4300 },
  'diamond harbour': { lat: 22.1900, lng: 88.2000 },
  'canning': { lat: 22.3100, lng: 88.6600 },
  'budge budge': { lat: 22.4800, lng: 88.1800 },
  'maheshtala': { lat: 22.5100, lng: 88.2500 },
  'durgapur': { lat: 23.5204, lng: 87.3119 },
  'asansol': { lat: 23.6739, lng: 86.9524 },
  'siliguri': { lat: 26.7271, lng: 88.3953 },
  'bardhaman': { lat: 23.2324, lng: 87.8615 },
  'burdwan': { lat: 23.2324, lng: 87.8615 },
  'malda': { lat: 25.0108, lng: 88.1411 },
  'berhampore': { lat: 24.1000, lng: 88.2500 },
  'baharampur': { lat: 24.1000, lng: 88.2500 },
  'kolkata': { lat: 22.5726, lng: 88.3639 },
};

function getGroupStartCoords(locName) {
  if (!locName || typeof locName !== 'string') return { lat: 22.5726, lng: 88.3639 };
  const clean = locName.trim().toLowerCase();
  if (KNOWN_START_COORDS[clean]) return KNOWN_START_COORDS[clean];

  for (const [key, coords] of Object.entries(KNOWN_START_COORDS)) {
    if (clean.includes(key) || key.includes(clean)) return coords;
  }
  return { lat: 22.5726, lng: 88.3639 };
}

async function geocodeCustomLocation(startLoc) {
  if (!startLoc || !startLoc.trim()) return { lat: 22.5726, lng: 88.3639 };
  const quick = getGroupStartCoords(startLoc);
  if (quick.lat !== 22.5726 || quick.lng !== 88.3639 || startLoc.toLowerCase().includes('central')) {
    return quick;
  }
  try {
    // 1. Search in West Bengal, India
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(startLoc + ', West Bengal, India')}&format=json&limit=1`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0 && data[0].lat && data[0].lon) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    }
    // 2. Broader search if needed
    const broadRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(startLoc + ', India')}&format=json&limit=1`
    );
    if (broadRes.ok) {
      const broadData = await broadRes.json();
      if (broadData && broadData.length > 0 && broadData[0].lat && broadData[0].lon) {
        return { lat: parseFloat(broadData[0].lat), lng: parseFloat(broadData[0].lon) };
      }
    }
  } catch (_) { }
  return quick;
}

export default function GroupDashboard() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab') || (searchParams.get('call') ? 'chat' : 'plan');
  const [activeTab, setActiveTab] = useState(initialTab); // 'plan' | 'route' | 'ai' | 'chat'

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'chat' || params.get('call')) {
      setActiveTab('chat');
    }
  }, [location.search]);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Live location & navigation states
  const [locations, setLocations] = useState([]);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [centerTarget, setCenterTarget] = useState(null);
  const [myLocation, setMyLocation] = useState(null); // { latitude, longitude, accuracy }
  const [waypoints, setWaypoints] = useState([]);
  const [startFromMe, setStartFromMe] = useState(false); // Default: use group startLocation
  const [toastMessage, setToastMessage] = useState('');
  const [visitedStops, setVisitedStops] = useState(new Set()); // Set of waypoint indices (1-based for stops)
  const mapComponentRef = useRef(null);

  // Toggle visited status for a pandal stop by index
  const handleMarkVisited = useCallback((index) => {
    setVisitedStops((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Invalidate map bounds on tab switch to route
  useEffect(() => {
    if (activeTab === 'route') {
      const timer = setTimeout(() => {
        mapComponentRef.current?.invalidateSize();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const requestGpsLocation = useCallback(() => {
    if (!navigator?.geolocation) return;

    const onPos = (pos) => {
      setMyLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 30,
      });
    };

    navigator.geolocation.getCurrentPosition(
      onPos,
      () => {
        navigator.geolocation.getCurrentPosition(onPos, () => { }, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  // Auto-read GPS when mounted or when Route tab opens
  useEffect(() => {
    requestGpsLocation();
  }, [requestGpsLocation, activeTab]);

  // Passive watchPosition while Route tab is open — keeps the blue dot and red tracker live
  useEffect(() => {
    if (!navigator?.geolocation) return;

    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setMyLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 30,
          });
        },
        () => { }, // Silently ignore errors
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    } catch (_) { }

    return () => {
      if (watchId !== null && navigator?.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUserId = user?.id || user?.uid || user?.firebaseUid;
  const currentUserEmail = (user?.email || '').toLowerCase().trim();
  const isAdmin =
    group?.myRole === 'admin' ||
    group?.adminId === currentUserId ||
    group?.admin?.id === currentUserId ||
    (currentUserEmail && !isGenericEmail(group?.admin?.email) && group?.admin?.email?.toLowerCase().trim() === currentUserEmail) ||
    (group?.members || []).some(
      (m) =>
        (m.userId === currentUserId ||
          m.user?.id === currentUserId ||
          (currentUserEmail && !isGenericEmail(m.user?.email) && m.user?.email?.toLowerCase().trim() === currentUserEmail)) &&
        m.role === 'admin'
    );
  const inviteUrl = group ? `${window.location.origin}/join/${group.inviteToken}` : '';
  const inviteCode = group?.inviteToken || '';

  const load = useCallback(async (isSilent = false) => {
    try {
      const { data } = await getGroupById(id);
      setGroup(normalizeGroup(data));
    } catch (e) {
      if (!isSilent) {
        setError(e.response?.data?.error || 'Failed to load group.');
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    load();
    const grpInterval = setInterval(() => {
      load(true);
    }, 4000);

    // 1. Realtime Socket.io listener (instant MongoDB Atlas updates over WebSocket)
    const unsubSocket = subscribeToGroupUpdates(id, {
      onMemberJoined: ({ member, group: updatedGroup }) => {
        if (updatedGroup) {
          setGroup(normalizeGroup(updatedGroup));
        } else if (member) {
          setGroup((prev) => {
            if (!prev) return prev;
            const currentMembers = prev.members || [];
            if (currentMembers.some((m) => m.userId === member.userId || m.id === member.id)) {
              return prev;
            }
            const newMembers = [...currentMembers, member];
            return normalizeGroup({
              ...prev,
              members: newMembers,
            });
          });
        }
      },
      onMemberLeft: ({ memberId, userId, targetUserId, group: updatedGroup }) => {
        const removedIds = [memberId, userId, targetUserId].filter(Boolean);
        const currentUserId = user?.id || user?.firebaseUid;
        const currentUserEmail = (user?.email || '').toLowerCase().trim();

        const isMeRemoved = removedIds.some(
          (rid) =>
            rid === currentUserId ||
            rid === user?.id ||
            rid === user?.firebaseUid ||
            (currentUserEmail && typeof rid === 'string' && rid.toLowerCase() === currentUserEmail)
        ) || (updatedGroup && !updatedGroup.memberUids?.includes(currentUserId) && updatedGroup.adminId !== currentUserId);

        if (isMeRemoved) {
          try {
            localStorage.removeItem(`pp_shared_group_${id}`);
            const remaining = (JSON.parse(localStorage.getItem('pp_local_groups') || '[]')).filter(g => g.id !== id);
            localStorage.setItem('pp_local_groups', JSON.stringify(remaining));
          } catch (_) { }

          navigate('/groups', { replace: true });
          return;
        }

        if (updatedGroup) {
          setGroup(normalizeGroup(updatedGroup));
        } else if (removedIds.length > 0) {
          setGroup((prev) => {
            if (!prev) return prev;
            const newMembers = (prev.members || []).filter(
              (m) => !removedIds.includes(m.id) && !removedIds.includes(m.userId) && !removedIds.includes(m.user?.id)
            );
            return normalizeGroup({
              ...prev,
              members: newMembers,
            });
          });
        }
      },
      onSpotsUpdated: ({ spots, group: updatedGroup }) => {
        if (updatedGroup) {
          setGroup(normalizeGroup(updatedGroup));
        } else if (spots) {
          setGroup((prev) => normalizeGroup({
            ...prev,
            spots,
          }));
        }
      },
      onLocationUpdated: (loc) => {
        if (loc && loc.userId) {
          setLocations((prev) => {
            const next = prev.filter((l) => l.userId !== loc.userId);
            next.push(loc);
            return next;
          });
        }
      },
      onGroupDeleted: () => {
        navigate('/groups');
      },
    });

    return () => {
      clearInterval(grpInterval);
      unsubSocket();
    };
  }, [load, id, navigate]);

  // Order pandals using nearest-neighbor greedy algorithm starting from designated plan start location
  useEffect(() => {
    if (!group) return;

    let isMounted = true;

    async function computeInitialOrder() {
      let groupCoords = getGroupStartCoords(group.startLocation);
      if (group.startLocation && groupCoords.lat === 22.5726 && groupCoords.lng === 88.3639 && !group.startLocation.toLowerCase().includes('central')) {
        groupCoords = await geocodeCustomLocation(group.startLocation);
      }

      if (!isMounted) return;

      const startWp = (startFromMe && myLocation?.latitude) ? {
        id: 'start-me',
        name: 'My Current Location (Start)',
        lat: myLocation.latitude,
        lng: myLocation.longitude,
      } : {
        id: 'start-0',
        name: group.startLocation ? `${group.startLocation} (Start)` : 'Kolkata Central (Start)',
        lat: groupCoords.lat,
        lng: groupCoords.lng,
      };

      const spotWps = (group.spots || [])
        .map((s, idx) => {
          const targetId = s.spotId || s.spot?.id || s.id;
          const matched = (!s?.spot || !s.spot.latitude || !s.spot.name)
            ? findMatchingPandal(targetId, s?.spot?.name || s?.name)
            : null;
          const sp = { ...(matched || {}), ...(s?.spot || {}) };
          if (!sp.latitude || !sp.longitude) return null;
          return {
            id: s.id || `spot-${idx}`,
            groupSpotId: s.id,
            spotId: targetId,
            name: sp.name || `Pandal ${idx + 1}`,
            lat: Number(sp.latitude),
            lng: Number(sp.longitude),
          };
        })
        .filter(Boolean);

      if (spotWps.length > 0) {
        const optimized = solveNearestNeighbor(startWp, spotWps);
        setWaypoints(optimized);
      } else {
        setWaypoints([startWp]);
      }
    }

    computeInitialOrder();

    return () => {
      isMounted = false;
    };
  }, [group, startFromMe]);

  // Poll group members locations every 5 seconds
  const fetchLocations = useCallback(async () => {
    try {
      const { data } = await getGroupLocations(id);
      setLocations(data);
      const myState = data.find(m => m.userId === user?.id);
      if (myState?.isSharingLocation && !isSharing) {
        setIsSharing(true);
      } else if (myState && !myState.isSharingLocation && isSharing) {
        setIsSharing(false);
      }
    } catch (_) { }
  }, [id, user?.id, isSharing]);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // Continuous GPS watch & sync when sharing
  const lastWriteTimeRef = useRef(0);
  useEffect(() => {
    if (!isSharing) return;

    let watchId = null;
    let syncInterval = null;

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const loc = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy || 25,
            };
            setMyLocation(loc);

            const now = Date.now();
            if (now - lastWriteTimeRef.current > 5000) {
              lastWriteTimeRef.current = now;
              updateGroupLocation(id, {
                latitude: loc.latitude,
                longitude: loc.longitude,
                isSharingLocation: true,
              }).catch(() => { });
            }
          },
          (err) => {
            console.warn('Geolocation watchPosition note:', err?.message);
          },
          { enableHighAccuracy: false, maximumAge: 10000, timeout: 8000 }
        );
      } catch (_) { }
    }

    // Periodic heartbeat sync every 10s to keep sharing alive on server
    syncInterval = setInterval(() => {
      if (myLocation?.latitude && myLocation?.longitude) {
        const now = Date.now();
        if (now - lastWriteTimeRef.current > 9000) {
          lastWriteTimeRef.current = now;
          updateGroupLocation(id, {
            latitude: myLocation.latitude,
            longitude: myLocation.longitude,
            isSharingLocation: true,
          }).catch(() => { });
        }
      }
    }, 10000);

    return () => {
      if (watchId !== null && navigator?.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (syncInterval) {
        clearInterval(syncInterval);
      }
    };
  }, [id, isSharing, myLocation?.latitude, myLocation?.longitude]);

  // Toggle Location Sharing
  async function handleToggleSharing() {
    setSharingLoading(true);
    if (isSharing) {
      try {
        await updateGroupLocation(id, { isSharingLocation: false });
        setIsSharing(false);
        setToastMessage('Stopped sharing location.');
        fetchLocations();
      } catch (e) {
        setToastMessage('Failed to stop sharing location.');
      } finally {
        setSharingLoading(false);
      }
    } else {
      try {
        const defaultLat = waypoints?.[0]?.lat || 22.5726;
        const defaultLng = waypoints?.[0]?.lng || 88.3639;
        const loc = await getReliableCurrentLocation({ lat: defaultLat, lng: defaultLng });

        const locData = {
          latitude: loc.lat,
          longitude: loc.lng,
          isSharingLocation: true,
        };

        await updateGroupLocation(id, locData);
        setIsSharing(true);
        setMyLocation({
          latitude: loc.lat,
          longitude: loc.lng,
          accuracy: loc.accuracy || 25,
        });
        setToastMessage('📍 Sharing live location with group!');
        fetchLocations();
      } catch (err) {
        setToastMessage('Could not retrieve location. Please check browser permissions.');
      } finally {
        setSharingLoading(false);
      }
    }
  }

  // Stable Route Summary callback (prevents re-render loops and map flickering)
  const handleRouteSummary = useCallback((summary) => {
    setRouteData((prev) => {
      if (prev?.totalDistanceKm === summary.totalDistanceKm && prev?.estimatedDurationMin === summary.estimatedDurationMin) {
        return prev;
      }
      return {
        ...(prev || {
          start: { name: 'Start Point' },
          stops: [],
        }),
        ...summary,
      };
    });
  }, []);

  // Waypoint operations with live distance recalculations
  const handleAddWaypoint = (newWp) => {
    setWaypoints((prev) => {
      const updated = [...prev, { ...newWp, id: `wp-${Date.now()}` }];
      return calculateLegDistances(updated);
    });
  };

  const handleRemoveWaypoint = async (idx, targetWp) => {
    const target = targetWp || waypoints[idx];
    if (!target) return;

    // 1. Immediately update waypoints in state with live distance recalculation
    const remaining = waypoints.filter((_, i) => i !== idx);
    setWaypoints(calculateLegDistances(remaining));

    // 2. Identify if this is a group spot saved on backend
    const targetSpotId = target.spotId || (group?.spots || []).find(
      (s) => s.spotId === target.id || s.id === target.id || s.spot?.name === target.name
    )?.spotId || target.id;

    const matchedSpot = (group?.spots || []).find(
      (s) => s.spotId === targetSpotId || s.id === targetSpotId || s.spot?.name === target.name
    );

    if (matchedSpot) {
      const deleteId = matchedSpot.spotId || matchedSpot.id;
      try {
        await removeGroupSpot(id, deleteId);
        setGroup((prev) => ({
          ...prev,
          spots: (prev.spots || []).filter(
            (s) => s.spotId !== deleteId && s.id !== deleteId && s.spot?.name !== target.name
          ),
        }));
        setToastMessage(`Removed "${target.name}" from route and group.`);
      } catch (err) {
        console.warn('Backend delete spot error:', err);
        setToastMessage(err.response?.data?.error || 'Failed to remove spot on server.');
      }
    } else {
      setToastMessage(`Removed "${target.name}" from route.`);
    }
  };

  const handleUpdateWaypoints = (reordered) => {
    const recalculated = calculateLegDistances(reordered);
    setWaypoints(recalculated);
  };

  const handleOptimizeNearestNeighbor = async (preferCurrentGps = null) => {
    if (waypoints.length <= 1) return;
    const useGps = preferCurrentGps !== null ? preferCurrentGps : startFromMe;
    let groupCoords = getGroupStartCoords(group?.startLocation);
    if (group?.startLocation && groupCoords.lat === 22.5726 && groupCoords.lng === 88.3639 && !group.startLocation.toLowerCase().includes('central')) {
      groupCoords = await geocodeCustomLocation(group.startLocation);
    }

    const startWp = (useGps && myLocation?.latitude) ? {
      id: 'start-me',
      name: 'My Current Location (Start)',
      lat: myLocation.latitude,
      lng: myLocation.longitude,
    } : {
      id: 'start-0',
      name: group?.startLocation ? `${group.startLocation} (Start)` : 'Kolkata Central (Start)',
      lat: groupCoords.lat,
      lng: groupCoords.lng,
    };

    const destinationStops = waypoints.slice(1);
    const optimized = solveNearestNeighbor(startWp, destinationStops);
    setWaypoints(optimized);
    setToastMessage(`Ordered stops from ${startWp.name.split('(')[0].trim()} via Nearest-Neighbor!`);
  };

  const handleToggleStartOrigin = () => {
    const nextVal = !startFromMe;
    setStartFromMe(nextVal);
    handleOptimizeNearestNeighbor(nextVal);
  };

  async function toggleVote(spotId) {
    try {
      const { data } = await voteGroupSpot(id, spotId);
      setGroup(p => ({
        ...p,
        spots: p.spots.map(s => s.spotId === spotId
          ? { ...s, voteCount: data.voteCount, iVoted: data.voted } : s),
      }));
    } catch (_) { }
  }

  async function handleRemoveSpot(spotId) {
    try {
      await removeGroupSpot(id, spotId);
      setGroup(p => ({
        ...p,
        spots: p.spots.filter(s => s.spotId !== spotId && s.id !== spotId),
      }));
      // Synchronize with map waypoints live
      setWaypoints(prev => {
        const remaining = prev.filter(w => w.spotId !== spotId && w.id !== spotId);
        return calculateLegDistances(remaining);
      });
      setToastMessage('Spot removed from group and route.');
    } catch (e) {
      console.warn('Backend remove spot error:', e);
      setToastMessage(e.response?.data?.error || 'Failed to remove spot.');
    }
  }

  async function handleFinalize(spotId) {
    try {
      const { data } = await finalizeGroupSpot(id, spotId);
      setGroup(p => ({
        ...p,
        spots: p.spots.map(s => s.spotId === spotId ? { ...s, status: data.status } : s),
      }));
    } catch (_) { }
  }

  async function handleRoute() {
    setRouteError('');
    setRouteLoading(true);
    try {
      const { data } = await generateGroupRoute(id, { startLocation: group.startLocation });
      setRouteData(data);
    } catch (e) {
      setRouteError(e.response?.data?.error || 'Route generation failed.');
    } finally {
      setRouteLoading(false);
    }
  }

  function copyInvite() {
    const codeToCopy = group?.inviteToken || inviteCode;
    navigator.clipboard.writeText(codeToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function shareInvite() {
    const codeToShare = group?.inviteToken || inviteCode;
    if (navigator.share) {
      navigator.share({
        title: `Join ${group.name} on PujoPlan`,
        text: `Join my Durga Puja group "${group.name}"! Enter this code in PujoPlan:\n\n${codeToShare}`,
      }).catch(() => { });
    } else {
      copyInvite();
    }
  }

  async function handleRegenInvite() {
    if (!window.confirm('Old link will stop working. Regenerate?')) return;
    try {
      const { data } = await regenerateInvite(id);
      setGroup(p => ({ ...p, inviteToken: data.inviteToken }));
    } catch (_) { }
  }

  async function handleRemoveMember(memberId, memberUserId) {
    const targetId = memberId || memberUserId;
    if (!targetId) return;
    try {
      await removeMember(id, targetId);
      setGroup(p => {
        if (!p || !p.members) return p;
        return {
          ...p,
          members: p.members.filter(m => m.id !== targetId && m.userId !== targetId && m.user?.id !== targetId)
        };
      });
      setLocations(p => p.filter(l => l.id !== targetId && l.userId !== targetId));
      setToastMessage('Member removed successfully');
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove member.');
    }
  }

  const [confirmLeave, setConfirmLeave] = useState(false);

  async function handleLeaveGroup() {
    try {
      await leaveGroup(id);
      navigate('/groups', { replace: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to leave group.');
    }
  }

  async function handleDeleteGroup() {
    try {
      await deleteGroup(id);
      try {
        localStorage.removeItem(`pp_shared_group_${id}`);
        const localGroups = (JSON.parse(localStorage.getItem('pp_local_groups') || '[]')).filter(g => g.id !== id);
        localStorage.setItem('pp_local_groups', JSON.stringify(localGroups));
        if (currentUserId) {
          const uKey = `pp_local_groups_${currentUserId}`;
          const uGroups = (JSON.parse(localStorage.getItem(uKey) || '[]')).filter(g => g.id !== id);
          localStorage.setItem(uKey, JSON.stringify(uGroups));
        }
      } catch (_) {}

      navigate('/groups', { replace: true });
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete group.');
    }
  }

  if (loading) return <AppLayout back onBack={() => navigate('/groups')}><div className="center-flex"><div className="spinner" /></div></AppLayout>;
  if (error) return (
    <AppLayout back onBack={() => navigate('/groups')}>
      <div className="page-wrap">
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-outline btn-full" style={{ marginTop: 16 }} onClick={() => navigate('/groups')}>
          Back to Group Plans
        </button>
      </div>
    </AppLayout>
  );

  const finalizedSpots = (group?.spots || []).filter(s => s.status === 'finalized');
  const suggestedSpots = (group?.spots || [])
    .filter(s => s.status !== 'finalized')
    .sort((a, b) => b.voteCount - a.voteCount);

  const activeMembers = locations.filter(m => m.isSharingLocation && m.latitude && m.longitude);
  const activeSharingCount = activeMembers.length;

  return (
    <AppLayout title={group?.name || 'Group Plan'} back onBack={() => navigate('/groups')}>
      <div className="page-wrap gd">
        <button className="back-nav-btn" onClick={() => navigate('/groups')}>
          <ArrowLeft size={16} /> Back to Group Plans
        </button>

        {/* Meta */}
        <div className="gd__meta">
          <span>{(group?.members || []).length} members</span>
          <span>·</span>
          <span>{(group?.spots || []).length} spots</span>
          {group?.visitDate && <><span>·</span><span>{group.visitDate}</span></>}
          <span className={`badge badge-${isAdmin ? 'yellow' : 'gray'}`} style={{ marginLeft: 'auto' }}>
            {group?.myRole || 'member'}
          </span>
        </div>

        {/* Segmented Navigation Tabs: Plan, Route, AI, Chat */}
        <div className="gd__tabs">
          <button
            type="button"
            className={`gd__tab ${activeTab === 'plan' ? 'gd__tab--active' : ''}`}
            onClick={() => setActiveTab('plan')}
          >
            <MapPin size={14} />
            <span>Plan</span>
          </button>
          <button
            type="button"
            className={`gd__tab ${activeTab === 'route' ? 'gd__tab--active' : ''}`}
            onClick={() => setActiveTab('route')}
          >
            <Route size={14} />
            <span>Route</span>
          </button>
          <button
            type="button"
            className={`gd__tab ${activeTab === 'ai' ? 'gd__tab--active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Compass size={14} />
            <span>AI</span>
          </button>
          <button
            type="button"
            className={`gd__tab ${activeTab === 'chat' ? 'gd__tab--active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
        </div>

        {/* ── 1. Plan Tab (Pandal Selection & Management) ── */}
        {activeTab === 'plan' && (
          <div className="gd__tab-pane">
            {/* Invite Code strip */}
            <div className="gd__invite">
              <div className="gd__invite-text">
                <span className="gd__invite-label">Invite Code</span>
                <span className="gd__invite-code">{inviteCode}</span>
              </div>
              <button className="btn btn-yellow btn-sm" onClick={copyInvite}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={shareInvite} style={{ padding: '8px 8px' }}>
                <Share2 size={15} />
              </button>
              {isAdmin && (
                <button className="btn btn-ghost btn-sm" onClick={handleRegenInvite} title="Regenerate code" style={{ padding: '8px 8px' }}>
                  ↻
                </button>
              )}
            </div>

            <div className="divider" />

            {/* Members toggle */}
            <button className="gd__toggle" onClick={() => setShowMembers(v => !v)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} />
                <span className="section-title" style={{ marginBottom: 0 }}>
                  MEMBERS ({group.members?.length || 0})
                </span>
              </div>
              {showMembers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showMembers && (
              <div className="gd__members">
                {(group.members || []).map((m, idx) => {
                  const memberId = m.id || `mem-${idx}`;
                  const memberUserId = m.userId || m.user?.id;
                  const isMemberAdmin = m.role === 'admin' || m.userId === group.adminId || m.user?.id === group.adminId || (!isGenericEmail(group.admin?.email) && m.user?.email === group.admin?.email);
                  const isCurrentAdminRow = isMemberAdmin;

                  return (
                    <div key={memberId || memberUserId || idx} className="gd__member">
                      {m.user?.profileImage
                        ? <img src={m.user.profileImage} alt="" className="gd__member-avatar" referrerPolicy="no-referrer" />
                        : <div className="gd__member-avatar gd__member-avatar--ph">{m.user?.name?.[0] || 'U'}</div>
                      }
                      <div className="gd__member-info">
                        <span className="gd__member-name">{m.user?.name || 'Member'}</span>
                        <span className={`badge badge-${isMemberAdmin ? 'yellow' : 'gray'}`} style={{ fontSize: '.6rem' }}>
                          {isMemberAdmin ? '👑 Admin' : 'Member'}
                        </span>
                      </div>
                      {isAdmin && !isCurrentAdminRow && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '6px', cursor: 'pointer' }}
                          title="Remove member"
                          onClick={() => handleRemoveMember(memberId, memberUserId)}
                        >
                          <Trash2 size={13} color="var(--red)" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="divider" />

            {/* Spots header */}
            <div className="gd__spots-head">
              <span className="section-title" style={{ marginBottom: 0 }}>PANDALS</span>
              <button className="btn btn-yellow btn-sm" onClick={() => navigate(`/group/${id}/spots`)}>
                <Plus size={13} /> Add
              </button>
            </div>

            {group.spots.length === 0 ? (
              <div className="empty-state">
                <MapPin size={28} />
                <p>No pandals yet. Add some!</p>
                <button className="btn btn-yellow btn-sm" onClick={() => navigate(`/group/${id}/spots`)}>
                  Browse Pandals
                </button>
              </div>
            ) : (
              <div className="gd__spots">
                {finalizedSpots.length > 0 && (
                  <>
                    <p style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.1em', color: 'var(--yellow)', marginBottom: 8 }}>
                      ✓ FINALIZED
                    </p>
                    {finalizedSpots.map(gs => (
                      <SpotRow key={gs.id} gs={gs} isAdmin={isAdmin} uid={user.id}
                        onVote={toggleVote} onRemove={handleRemoveSpot} onFinalize={handleFinalize} />
                    ))}
                    {suggestedSpots.length > 0 && <div className="divider" style={{ margin: '12px 0' }} />}
                  </>
                )}
                {suggestedSpots.length > 0 && (
                  <>
                    {finalizedSpots.length > 0 && (
                      <p style={{ fontSize: '.68rem', fontWeight: 800, letterSpacing: '.1em', color: 'var(--gray-mid)', marginBottom: 8 }}>
                        SUGGESTED
                      </p>
                    )}
                    {suggestedSpots.map(gs => (
                      <SpotRow key={gs.id} gs={gs} isAdmin={isAdmin} uid={user.id}
                        onVote={toggleVote} onRemove={handleRemoveSpot} onFinalize={handleFinalize} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Admin danger zone: Delete Group */}
            {isAdmin && (
              <>
                <div className="divider" />
                <div className="gd__danger">
                  <p className="section-title" style={{ color: 'var(--red)', marginBottom: 8 }}>DANGER ZONE</p>
                  {confirmDel ? (
                    <div className="gd__confirm">
                      <AlertTriangle size={16} color="var(--red)" />
                      <span>This will permanently delete the group.</span>
                      <button className="btn btn-red btn-sm" onClick={handleDeleteGroup}>Delete</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-outline btn-sm"
                      style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                      onClick={() => setConfirmDel(true)}>
                      <Trash2 size={13} /> Delete Group
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Member option: Leave Group */}
            {!isAdmin && (
              <>
                <div className="divider" />
                <div className="gd__danger">
                  <p className="section-title" style={{ color: 'var(--red)', marginBottom: 8 }}>LEAVE GROUP</p>
                  {confirmLeave ? (
                    <div className="gd__confirm">
                      <AlertTriangle size={16} color="var(--red)" />
                      <span>Are you sure you want to leave this group?</span>
                      <button className="btn btn-red btn-sm" onClick={handleLeaveGroup}>Yes, Leave</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(false)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ borderColor: 'rgba(234,67,53,0.5)', color: 'var(--red)' }}
                      onClick={() => setConfirmLeave(true)}
                    >
                      <LogOut size={13} /> Leave Group
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 2. Route Tab (Map, Routing, Location Tracking & Red Track to Start) ── */}
        {activeTab === 'route' && (
          <div className="gd__tab-pane">
            <div className="gd__route-head">
              <span className="section-title" style={{ marginBottom: 0 }}>NAVIGATION & ROUTE</span>
              <button
                className="btn btn-red btn-sm"
                onClick={handleRoute}
                disabled={routeLoading || waypoints.length < 2}
              >
                {routeLoading
                  ? <span className="spinner" style={{ width: 15, height: 15, borderWidth: 2, borderTopColor: '#fff' }} />
                  : <Route size={14} />
                }
                {routeLoading ? 'Calculating…' : 'Recalculate Route'}
              </button>
            </div>

            {/* Map Legend */}
            <div style={{ display: 'flex', gap: 16, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 4, background: '#EA4335', borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>You → Start point</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 28, height: 4, background: '#4285F4', borderRadius: 4, flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>Pandal route (nearest-neighbor)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, background: '#4285F4', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 4px #4285F4', flexShrink: 0 }} />
                <span style={{ fontSize: '.72rem', color: 'var(--gray-light)' }}>Your Location</span>
              </div>
              {!myLocation?.latitude && (
                <button
                  type="button"
                  onClick={requestGpsLocation}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#8ab4f8',
                    background: 'rgba(66,133,244,0.12)',
                    border: '1px solid rgba(66,133,244,0.3)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '.72rem',
                    cursor: 'pointer',
                  }}
                >
                  <Navigation size={12} />
                  Enable GPS Location
                </button>
              )}
            </div>

            {routeError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{routeError}</div>}

            <div className="gmaps-integrated-wrapper" style={{ position: 'relative', marginTop: 12, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <PujaMap
                ref={mapComponentRef}
                waypoints={waypoints}
                onWaypointsChange={handleUpdateWaypoints}
                myLocation={myLocation}
                liveMembers={locations}
                currentUserId={user?.id}
                centerTarget={centerTarget}
                onRouteSummary={handleRouteSummary}
                onError={(msg) => setToastMessage(msg)}
                visitedStops={visitedStops}
                onMarkVisited={handleMarkVisited}
                height={460}
              />

              <GmapsBottomSheet
                routeData={routeData}
                waypoints={waypoints}
                onUpdateWaypoints={handleUpdateWaypoints}
                onAddWaypoint={handleAddWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                onOptimizeNearestNeighbor={handleOptimizeNearestNeighbor}
                startFromMe={startFromMe}
                onToggleStartOrigin={handleToggleStartOrigin}
                isSharing={isSharing}
                onToggleSharing={handleToggleSharing}
                sharingLoading={sharingLoading}
                onRecenterOnMe={() => {
                  mapComponentRef.current?.recenterMe();
                }}
                onFitRoute={() => {
                  mapComponentRef.current?.fitRoute();
                }}
                liveMembers={locations}
                currentUserId={user?.id}
                onFocusMember={(coords) => setCenterTarget(coords)}
                toastMessage={toastMessage}
                onCloseToast={() => setToastMessage('')}
                visitedStops={visitedStops}
                onMarkVisited={handleMarkVisited}
              />
            </div>
          </div>
        )}

        {/* ── 3. AI Assistant Tab (Distance & Route Bot) ── */}
        {activeTab === 'ai' && (
          <div className="gd__tab-pane" style={{ marginTop: 2 }}>
            <DistanceChatbot
              embedded={true}
              groupSpots={group?.spots ? group.spots.map(s => s.spot || s) : []}
              groupName={group?.name}
              startLocation={group?.startLocation}
              waypoints={waypoints}
            />
          </div>
        )}

        {/* ── 4. Chat Tab (Friends Group Chat) ── */}
        {activeTab === 'chat' && (
          <div className="gd__tab-pane">
            <GroupChat groupId={id} currentUser={user} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function SpotRow({ gs, isAdmin, uid, onVote, onRemove, onFinalize }) {
  const targetSpotId = gs?.spotId || gs?.id;
  const matched = (!gs?.spot || !gs.spot.name) ? findMatchingPandal(targetSpotId, gs?.name) : null;
  const spot = { ...(matched || {}), ...(gs?.spot || {}) };
  const spotName = spot.name || gs?.name || matched?.name || 'Durga Puja Pandal';
  const spotArea = spot.area || gs?.area || matched?.area || 'Kolkata';
  const crowdLevel = spot.crowdLevel || gs?.crowdLevel || matched?.crowdLevel || 'Moderate';
  const crowdClr = CROWD_CLR[crowdLevel] || 'var(--gray-light)';
  const addedByName = gs?.addedBy?.name || 'Member';

  return (
    <div className={`gd__spot ${gs?.status === 'finalized' ? 'gd__spot--fin' : ''}`}>
      <div className="gd__spot-info">
        <span className="gd__spot-name">{spotName}</span>
        <div className="gd__spot-meta">
          <MapPin size={10} /> {spotArea}
          <span style={{ color: crowdClr }}>● {crowdLevel}</span>
        </div>
        <span className="gd__spot-by">by {addedByName}</span>
      </div>

      <div className="gd__spot-actions">
        <button
          className={`gd__vote ${gs?.iVoted ? 'gd__vote--on' : ''}`}
          onClick={() => onVote(targetSpotId)}
        >
          <ThumbsUp size={13} /> {gs?.voteCount || 0}
        </button>

        {isAdmin && (
          <button
            className={`btn btn-sm ${gs?.status === 'finalized' ? 'btn-yellow' : 'btn-outline'}`}
            style={{ padding: '6px 8px' }}
            onClick={() => onFinalize(targetSpotId)}
            title={gs?.status === 'finalized' ? 'Unfinalize' : 'Finalize'}
          >
            <Star size={13} />
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ padding: '6px 8px' }}
          onClick={() => onRemove(targetSpotId)}
          title={`Remove ${spotName}`}
          aria-label={`Remove ${spotName}`}
        >
          <Trash2 size={13} color="var(--red)" />
        </button>
      </div>
    </div>
  );
}
