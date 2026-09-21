import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AppLayout from '../layouts/AppLayout';
import { getMyGroups, getLocalGroups } from '../services/api';
import { Users, Plus, ChevronRight, KeyRound, Calendar, ArrowLeft } from 'lucide-react';
import './GroupPlans.css';

export default function GroupPlans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Instant initial load from local cache
  const [groups, setGroups] = useState(() => getLocalGroups());
  const [loading, setLoading] = useState(() => getLocalGroups().length === 0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    
    // Check local groups immediately
    const cached = getLocalGroups();
    if (cached.length > 0) {
      setGroups(cached);
      setLoading(false);
    }

    // Safety timeout: Never keep spinner active for more than 2 seconds
    const timer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2000);

    // Load fresh groups from MongoDB backend in background
    const fetchGroups = async () => {
      try {
        const res = await getMyGroups();
        if (isMounted && res?.data) {
          setGroups(res.data);
        }
      } catch (err) {
        console.warn('[GroupPlans] Backend fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGroups();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [user]);

  return (
    <AppLayout title="Group Plans" back onBack={() => navigate('/dashboard')}>
      <div className="page-wrap gp">
        <button className="back-nav-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div className="gp__head">
          <h1 className="gp__title">Group Plans</h1>
          <div className="gp__actions">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/join-code')} title="Join with code">
              <KeyRound size={14} /> Join
            </button>
            <button className="btn btn-yellow btn-sm" onClick={() => navigate('/create-group')}>
              <Plus size={14} /> New Group
            </button>
          </div>
        </div>

        <div className="divider" />

        {loading ? (
          <div className="center-flex" style={{ minHeight: '35vh' }}>
            <div className="spinner" />
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--s8) var(--s4)' }}>
            <Users size={36} color="var(--gray)" />
            <p style={{ marginTop: 'var(--s2)', marginBottom: 'var(--s4)' }}>No group plans yet</p>
            <div style={{ display: 'flex', gap: 'var(--s2)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-yellow btn-sm" onClick={() => navigate('/create-group')}>
                Create a Group
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => navigate('/join-code')}>
                Join with Code
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft size={14} /> Back to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="gp__list">
            {groups.map(g => (
              <div
                key={g.id || g._id}
                className="plan-card plan-card--red"
                onClick={() => navigate(`/group/${g.id || g._id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(`/group/${g.id || g._id}`)}
              >
                <div className="plan-card__icon">
                  <Users size={18} />
                </div>
                <div className="plan-card__body">
                  <span className="plan-card__title">{g.name}</span>
                  <div className="plan-card__meta">
                    {g.visitDate && (
                      <span className="plan-card__meta-item">
                        <Calendar size={11} /> {g.visitDate}
                      </span>
                    )}
                    <span className="plan-card__meta-item">
                      <Users size={11} /> {g._count?.members ?? g.members?.length ?? 1} members
                    </span>
                    <span className="plan-card__meta-item">
                      {g._count?.spots ?? g.spots?.length ?? 0} pandals
                    </span>
                  </div>
                </div>
                <div className="plan-card__badges">
                  <span className={`badge ${g.myRole === 'admin' ? 'badge-yellow' : 'badge-gray'}`}>
                    {g.myRole === 'admin' ? 'Admin' : 'Member'}
                  </span>
                  <ChevronRight size={14} color="var(--text-muted)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
