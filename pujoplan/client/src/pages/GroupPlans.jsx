import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import { getMyGroups } from '../services/api';
import { Users, Plus, ChevronRight, KeyRound, Calendar, ArrowLeft } from 'lucide-react';
import './GroupPlans.css';

export default function GroupPlans() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchGroups = () => {
      getMyGroups()
        .then(r => {
          if (isMounted) setGroups(Array.isArray(r.data) ? r.data : []);
        })
        .catch(() => {
          if (isMounted) setGroups([]);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    };

    fetchGroups();
    const interval = setInterval(fetchGroups, 3000);
    window.addEventListener('focus', fetchGroups);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', fetchGroups);
    };
  }, []);

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
                key={g.id}
                className="plan-card plan-card--red"
                onClick={() => navigate(`/group/${g.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate(`/group/${g.id}`)}
              >
                <div className="plan-card__icon">
                  <Users size={18} />
                </div>
                <div className="plan-card__body">
                  <div className="plan-card__row">
                    <span className="plan-card__title">{g.name}</span>
                    {g.myRole && (
                      <span className={`badge badge-${g.myRole === 'admin' ? 'yellow' : 'gray'}`}>
                        {g.myRole}
                      </span>
                    )}
                  </div>
                  <div className="plan-card__meta">
                    <span>{g._count?.members ?? 0} members</span>
                    <span>· {g._count?.spots ?? 0} spots</span>
                    {g.visitDate && (
                      <span>· <Calendar size={10} style={{ display: 'inline' }} /> {g.visitDate}</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="plan-card__arrow" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
