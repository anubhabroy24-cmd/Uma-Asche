import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../layouts/AppLayout';
import PujaMap from '../components/PujaMap';
import GroupChat from '../components/GroupChat';
import GmapsBottomSheet from '../components/GmapsBottomSheet';
import DistanceChatbot from '../components/DistanceChatbot';
import { solveNearestNeighbor, calculateLegDistances } from '../utils/routeOptimizer';
import {
  getGroupById, voteGroupSpot, removeGroupSpot,
  finalizeGroupSpot, generateGroupRoute,
  removeMember, regenerateInvite, deleteGroup,
  getGroupLocations, updateGroupLocation,
} from '../services/api';
import {
  MapPin, Plus, ThumbsUp, Trash2, Copy, Share2,
  Check, Star, Route, Users, ChevronDown, ChevronUp, AlertTriangle,
  MessageSquare, Navigation, ArrowLeft, EyeOff,
} from 'lucide-react';
import './GroupDashboard.css';

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
  'bagnan': { lat: 22.4678, lng: 87.9708 },
  'uluberia': { lat: 22.4744, lng: 88.1098 },
  'domjur': { lat: 22.6416, lng: 88.2235 },
  'andul': { lat: 22.5855, lng: 88.2435 },
  'dankuni': { lat: 22.6865, lng: 88.2936 },
  'serampore': { lat: 22.7522, lng: 88.3433 },
  'srirampur': { lat: 22.7522, lng: 88.3433 },
  'rishra': { lat: 22.7126, lng: 88.3512 },
  'konnagar': { lat: 22.7000, lng: 88.3500 },
  'uttarpara': { lat: 22.6685, lng: 88.3496 },
  'bally': { lat: 22.6500, lng: 88.3400 },
  'chandannagar': { lat: 22.8671, lng: 88.3674 },
  'chinsurah': { lat: 22.9011, lng: 88.3968 },
  'hooghly': { lat: 22.9011, lng: 88.3968 },
  'bandel': { lat: 22.9218, lng: 88.3756 },
  'singur': { lat: 22.8100, lng: 88.2300 },
  'tarakeswar': { lat: 22.8872, lng: 88.0200 },
  'barasat': { lat: 22.7214, lng: 88.4816 },
  'madhyamgram': { lat: 22.6980, lng: 88.4550 },
  'habra': { lat: 22.8362, lng: 88.6318 },
  'barrackpore': { lat: 22.7644, lng: 88.3777 },
  'naihati': { lat: 22.8988, lng: 88.4239 },
  'sonarpur': { lat: 22.4388, lng: 88.4312 },
  'baruipur': { lat: 22.3654, lng: 88.4325 },
  'diamond harbour': { lat: 22.1906, lng: 88.1925 },
  'canning': { lat: 22.3106, lng: 88.6575 },
  'budge budge': { lat: 22.4822, lng: 88.1818 },
  'maheshtala': { lat: 22.5078, lng: 88.2472 },
  'kolaghat': { lat: 22.4300, lng: 87.8700 },
  'mecheda': { lat: 22.4172, lng: 87.8732 },
  'tamluk': { lat: 22.2989, lng: 87.9258 },
  'kharagpur': { lat: 22.3302, lng: 87.3237 },
  'midnapore': { lat: 22.4257, lng: 87.3199 },
  'burdwan': { lat: 23.2324, lng: 87.8615 },
  'bardhaman': { lat: 23.2324, lng: 87.8615 },
};

function getGroupStartCoords(startLoc) {
  if (!startLoc || !startLoc.trim()) return { lat: 22.5726, lng: 88.3639 };
  const query = startLoc.toLowerCase().trim();
  for (const [key, coords] of Object.entries(KNOWN_START_COORDS)) {
    if (query.includes(key) || key.includes(query)) {
      return coords;
    }
  }
  return { lat: 22.5726, lng: 88.3639 };
}

// Asynchronous geocoder for custom addresses with Nominatim fallback
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
  } catch (_) {}
  return quick;
}

export default function GroupDashboard() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('plan'); // 'plan' | 'chat'
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
  const mapComponentRef = useRef(null);

  const isAdmin = group?.myRole === 'admin';
  const inviteUrl = group ? `${window.location.origin}/join/${group.inviteToken}` : '';

  const load = useCallback(async () => {
    try {
      const { data } = await getGroupById(id);
      setGroup(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
        .filter((s) => s.spot && s.spot.latitude && s.spot.longitude)
        .map((s, idx) => ({
          id: s.id || `spot-${idx}`,
          groupSpotId: s.id,
          spotId: s.spotId || s.spot?.id,
          name: s.spot.name,
          lat: Number(s.spot.latitude),
          lng: Number(s.spot.longitude),
        }));

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

  // watchPosition with debounced write every 5 seconds
  const lastWriteTimeRef = useRef(0);
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 25,
        };
        setMyLocation(loc);

        // Debounce server writes every 5 seconds if location sharing is on
        if (isSharing) {
          const now = Date.now();
          if (now - lastWriteTimeRef.current > 5000) {
            lastWriteTimeRef.current = now;
            updateGroupLocation(id, {
              latitude: loc.latitude,
              longitude: loc.longitude,
              isSharingLocation: true,
            }).catch(() => {});
          }
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [id, isSharing]);

  // Toggle Location Sharing
  async function handleToggleSharing() {
    setSharingLoading(true);
    if (isSharing) {
      try {
        await updateGroupLocation(id, { isSharingLocation: false });
        setIsSharing(false);
        fetchLocations();
      } catch (e) {
        setToastMessage('Failed to stop sharing location.');
      } finally {
        setSharingLoading(false);
      }
    } else {
      if (!navigator.geolocation) {
        setToastMessage('Geolocation is not supported by your browser.');
        setSharingLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await updateGroupLocation(id, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              isSharingLocation: true,
            });
            setIsSharing(true);
            setMyLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy || 25,
            });
            fetchLocations();
          } catch (e) {
            setToastMessage('Could not update live location.');
          } finally {
            setSharingLoading(false);
          }
        },
        (err) => {
          setToastMessage(err.message || 'Location permission denied.');
          setSharingLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
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
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function shareInvite() {
    if (navigator.share) {
      navigator.share({ title: `Join ${group.name}`, url: inviteUrl }).catch(() => { });
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

  async function handleRemoveMember(userId) {
    if (!window.confirm('Remove this member?')) return;
    try {
      await removeMember(id, userId);
      setGroup(p => ({ ...p, members: p.members.filter(m => m.user.id !== userId) }));
    } catch (e) { alert(e.response?.data?.error || 'Failed.'); }
  }

  async function handleDeleteGroup() {
    try {
      await deleteGroup(id);
      navigate('/dashboard', { replace: true });
    } catch (e) { alert(e.response?.data?.error || 'Failed to delete.'); }
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

  const finalizedSpots = group.spots.filter(s => s.status === 'finalized');
  const suggestedSpots = group.spots
    .filter(s => s.status !== 'finalized')
    .sort((a, b) => b.voteCount - a.voteCount);

  const activeMembers = locations.filter(m => m.isSharingLocation && m.latitude && m.longitude);
  const activeSharingCount = activeMembers.length;

  return (
    <AppLayout title={group.name} back onBack={() => navigate('/groups')}>
      <div className="page-wrap gd">
        <button className="back-nav-btn" onClick={() => navigate('/groups')}>
          <ArrowLeft size={16} /> Back to Group Plans
        </button>

        {/* Meta */}
        <div className="gd__meta">
          <span>{group.members.length} members</span>
          <span>·</span>
          <span>{group.spots.length} spots</span>
          {group.visitDate && <><span>·</span><span>{group.visitDate}</span></>}
          <span className={`badge badge-${isAdmin ? 'yellow' : 'gray'}`} style={{ marginLeft: 'auto' }}>
            {group.myRole}
          </span>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="gd__tabs">
          <button
            type="button"
            className={`gd__tab ${activeTab === 'plan' ? 'gd__tab--active' : ''}`}
            onClick={() => setActiveTab('plan')}
          >
            <MapPin size={14} />
            <span>Plan & Route</span>
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

        {activeTab === 'chat' && (
          <div className="gd__tab-pane">
            <GroupChat groupId={id} currentUser={user} />
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="gd__tab-pane">
            {/* Invite strip */}
            <div className="gd__invite">
              <div className="gd__invite-text">
                <span className="gd__invite-label">Invite Link</span>
                <span className="gd__invite-url">{inviteUrl}</span>
              </div>
              <button className="btn btn-yellow btn-sm" onClick={copyInvite}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={shareInvite} style={{ padding: '8px 8px' }}>
                <Share2 size={15} />
              </button>
              {isAdmin && (
                <button className="btn btn-ghost btn-sm" onClick={handleRegenInvite} title="Regenerate" style={{ padding: '8px 8px' }}>
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
                  MEMBERS ({group.members.length})
                </span>
              </div>
              {showMembers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showMembers && (
              <div className="gd__members">
                {group.members.map(m => (
                  <div key={m.id} className="gd__member">
                    {m.user.profileImage
                      ? <img src={m.user.profileImage} alt="" className="gd__member-avatar" referrerPolicy="no-referrer" />
                      : <div className="gd__member-avatar gd__member-avatar--ph">{m.user.name[0]}</div>
                    }
                    <div className="gd__member-info">
                      <span className="gd__member-name">{m.user.name}</span>
                      <span className={`badge badge-${m.role === 'admin' ? 'yellow' : 'gray'}`} style={{ fontSize: '.6rem' }}>
                        {m.role === 'admin' ? '👑 Admin' : 'Member'}
                      </span>
                    </div>
                    {isAdmin && m.user.id !== user.id && (
                      <button className="btn btn-ghost btn-sm" style={{ padding: '6px' }}
                        onClick={() => handleRemoveMember(m.user.id)}>
                        <Trash2 size={13} color="var(--red)" />
                      </button>
                    )}
                  </div>
                ))}
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

            <div className="divider" />

            {/* Google Maps-Style Navigation System */}
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
              />
            </div>

            {/* Admin danger zone */}
            {isAdmin && (
              <>
                <div className="divider" />
                <div className="gd__danger">
                  <p className="section-title" style={{ color: 'var(--red)', marginBottom: 8 }}>DANGER ZONE</p>
                  {confirmDel ? (
                    <div className="gd__confirm">
                      <AlertTriangle size={16} color="var(--red)" />
                      <span>This cannot be undone.</span>
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
          </div>
        )}

        {/* Distance Chatbot: strictly inside 9:16 frame, only when group is created & plan is done */}
        {group && group.spots && group.spots.length > 0 && (
          <DistanceChatbot
            groupSpots={group.spots.map(s => s.spot || s)}
            groupName={group.name}
            startLocation={group.startLocation}
            waypoints={waypoints}
          />
        )}
      </div>
    </AppLayout>
  );
}

function SpotRow({ gs, isAdmin, uid, onVote, onRemove, onFinalize }) {
  const crowdClr = CROWD_CLR[gs.spot.crowdLevel] || 'var(--gray-light)';
  const isOwner = gs.addedBy?.id === uid;

  return (
    <div className={`gd__spot ${gs.status === 'finalized' ? 'gd__spot--fin' : ''}`}>
      <div className="gd__spot-info">
        <span className="gd__spot-name">{gs.spot.name}</span>
        <div className="gd__spot-meta">
          <MapPin size={10} /> {gs.spot.area}
          <span style={{ color: crowdClr }}>● {gs.spot.crowdLevel}</span>
        </div>
        <span className="gd__spot-by">by {gs.addedBy?.name}</span>
      </div>

      <div className="gd__spot-actions">
        <button
          className={`gd__vote ${gs.iVoted ? 'gd__vote--on' : ''}`}
          onClick={() => onVote(gs.spotId)}
        >
          <ThumbsUp size={13} /> {gs.voteCount}
        </button>

        {isAdmin && (
          <button
            className={`btn btn-sm ${gs.status === 'finalized' ? 'btn-yellow' : 'btn-outline'}`}
            style={{ padding: '6px 8px' }}
            onClick={() => onFinalize(gs.spotId)}
            title={gs.status === 'finalized' ? 'Unfinalize' : 'Finalize'}
          >
            <Star size={13} />
          </button>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ padding: '6px 8px' }}
          onClick={() => onRemove(gs.spotId || gs.id)}
          title={`Remove ${gs.spot.name}`}
          aria-label={`Remove ${gs.spot.name}`}
        >
          <Trash2 size={13} color="var(--red)" />
        </button>
      </div>
    </div>
  );
}
