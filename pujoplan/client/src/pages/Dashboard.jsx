import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../layouts/AppLayout';
import { getMyGroups, getMySoloPlans, getLocalGroups, getLocalSoloPlans } from '../services/api';
import { Users, MapPin, ChevronRight, Plus, KeyRound, Sparkles, Compass } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(() => getLocalGroups());
  const [soloPlans, setSoloPlans] = useState(() => getLocalSoloPlans());
  const [loading, setLoading] = useState(() => getLocalGroups().length === 0 && getLocalSoloPlans().length === 0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Instant local cache population
    setGroups(getLocalGroups());
    setSoloPlans(getLocalSoloPlans());
    setLoading(false);

    // Background sync with MongoDB API
    Promise.all([
      getMyGroups().then(res => res?.data && setGroups(res.data)).catch(() => {}),
      getMySoloPlans().then(res => res?.data && setSoloPlans(res.data)).catch(() => {}),
    ]);
  }, [user]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <AppLayout theme="pure-black">
      <div className="page-wrap db">

        {/* Greeting */}
        <div className="db__greet">
          <div>
            <p className="section-title" style={{ marginBottom: 3 }}>DURGA PUJA 2026</p>
            <h1 className="db__name">শুভ শারদীয়া 🙏, {firstName}</h1>
          </div>
        </div>

        {/* Main Hub Buttons: View Group Plans & View Solo Plans */}
        <div className="db__hub">
          <button
            className="db__hub-card db__hub-card--group"
            onClick={() => navigate('/groups')}
            aria-label="View Group Plans"
          >
            <div className="db__hub-icon">
              <Users size={28} />
            </div>
            <div className="db__hub-content">
              <div className="db__hub-top">
                <span className="db__hub-title">View Group Plans</span>
                {!loading && (
                  <span className="db__hub-badge db__hub-badge--red">
                    {groups.length} {groups.length === 1 ? 'Group' : 'Groups'}
                  </span>
                )}
              </div>
              <p className="db__hub-subtitle">Collaborative routes & voting with friends</p>
            </div>
            <ChevronRight size={22} className="db__hub-arrow" />
          </button>

          <button
            className="db__hub-card db__hub-card--solo"
            onClick={() => navigate('/solo')}
            aria-label="View Solo Plans"
          >
            <div className="db__hub-icon">
              <MapPin size={28} />
            </div>
            <div className="db__hub-content">
              <div className="db__hub-top">
                <span className="db__hub-title">View Solo Plans</span>
                {!loading && (
                  <span className="db__hub-badge db__hub-badge--yellow">
                    {soloPlans.length} {soloPlans.length === 1 ? 'Plan' : 'Plans'}
                  </span>
                )}
              </div>
              <p className="db__hub-subtitle">Personal pandal hopping itinerary & route</p>
            </div>
            <ChevronRight size={22} className="db__hub-arrow" />
          </button>
        </div>

        <div className="divider" style={{ margin: 'var(--s5) 0 var(--s4)' }} />

        {/* Quick Actions */}
        <div className="db__quick-section">
          <p className="section-title" style={{ marginBottom: 'var(--s3)' }}>QUICK ACTIONS</p>
          <div className="db__quick-grid">
            <button className="db__quick-btn" onClick={() => navigate('/create-group')}>
              <Plus size={16} className="db__quick-btn-icon" />
              <span>Create New Group</span>
            </button>
            <button className="db__quick-btn" onClick={() => navigate('/solo')}>
              <Sparkles size={16} className="db__quick-btn-icon" />
              <span>Create Solo Plan</span>
            </button>
            <button className="db__quick-btn" onClick={() => navigate('/join-code')}>
              <KeyRound size={16} className="db__quick-btn-icon" />
              <span>Join with Code</span>
            </button>
          </div>
        </div>

        {/* Zoomed Dhak Animation positioned in lower section */}
        <div className="db__dhak-wrap">
          <video
            src="/dhak.mp4"
            poster="/dhak_poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="db__dhak-video"
          />
        </div>

      </div>
    </AppLayout>
  );
}
