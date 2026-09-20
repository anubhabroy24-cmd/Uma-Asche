import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CreateGroup from './pages/CreateGroup';
import GroupDashboard from './pages/GroupDashboard';
import JoinGroup from './pages/JoinGroup';
import JoinByCode from './pages/JoinByCode';
import SpotExplorer from './pages/SpotExplorer';
import SoloPlan from './pages/SoloPlan';
import SoloPlanDetail from './pages/SoloPlanDetail';
import GroupPlans from './pages/GroupPlans';
import PandalMapPage from './pages/PandalMapPage';

import IncomingCallOverlay from './components/IncomingCallOverlay';

// Branded full-screen splash loader with logo and spinner
function SplashLoader() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100%',
      backgroundColor: '#09090b',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <img
        src="/logo.png"
        alt="PujoPlan"
        style={{
          width: '96px',
          height: '96px',
          borderRadius: '20px',
          objectFit: 'cover',
          marginBottom: '20px',
          boxShadow: '0 8px 24px rgba(255, 180, 0, 0.25)'
        }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <h1 style={{
        fontSize: '1.8rem',
        fontWeight: '800',
        color: '#ffcc00',
        margin: '0 0 8px 0',
        letterSpacing: '-0.5px'
      }}>
        🪔 PujoPlan
      </h1>
      <p style={{
        fontSize: '0.9rem',
        color: '#a1a1aa',
        margin: '0 0 24px 0'
      }}>
        Explore Kolkata • Plan Together
      </p>
      <div style={{
        width: '28px',
        height: '28px',
        border: '3px solid rgba(255, 204, 0, 0.2)',
        borderTopColor: '#ffcc00',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
    </div>
  );
}

// Redirect authenticated users away from landing after 2-second splash
function PublicRoute({ children, splashDone }) {
  const { user, loading } = useAuth();
  if (!splashDone || loading) return <Landing showButton={false} />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// Redirect unauthenticated users to landing after 2-second splash
function PrivateRoute({ children, splashDone }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!splashDone || loading) return <Landing showButton={false} />;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

function AppRoutes() {
  const [splashDone, setSplashDone] = React.useState(false);

  React.useEffect(() => {
    // Request push & local notification permissions on app launch
    import('./services/notificationService')
      .then(m => m.requestNotificationPermission())
      .catch(() => { });

    const timer = setTimeout(() => {
      setSplashDone(true);
    }, 2000); // exactly 2 seconds of loading splash screen
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <IncomingCallOverlay />
      <Routes>
        {/* Public */}
        <Route path="/" element={<PublicRoute splashDone={splashDone}><Landing showButton={true} /></PublicRoute>} />
        {/* Join is semi-public: shows invite info without auth, requires auth to actually join */}
        <Route path="/join/:token" element={<JoinGroup />} />

        {/* Protected */}
        <Route path="/dashboard" element={<PrivateRoute splashDone={splashDone}><Dashboard /></PrivateRoute>} />
        <Route path="/groups" element={<PrivateRoute splashDone={splashDone}><GroupPlans /></PrivateRoute>} />
        <Route path="/create-group" element={<PrivateRoute splashDone={splashDone}><CreateGroup /></PrivateRoute>} />
        <Route path="/join-code" element={<PrivateRoute splashDone={splashDone}><JoinByCode /></PrivateRoute>} />
        <Route path="/group/:id" element={<PrivateRoute splashDone={splashDone}><GroupDashboard /></PrivateRoute>} />
        <Route path="/group/:id/spots" element={<PrivateRoute splashDone={splashDone}><SpotExplorer mode="group" /></PrivateRoute>} />
        <Route path="/solo" element={<PrivateRoute splashDone={splashDone}><SoloPlan /></PrivateRoute>} />
        <Route path="/solo/:id" element={<PrivateRoute splashDone={splashDone}><SoloPlanDetail /></PrivateRoute>} />
        <Route path="/solo/:id/spots" element={<PrivateRoute splashDone={splashDone}><SpotExplorer mode="solo" /></PrivateRoute>} />
        <Route path="/map" element={<PrivateRoute splashDone={splashDone}><PandalMapPage /></PrivateRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
