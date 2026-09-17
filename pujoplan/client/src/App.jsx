import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Landing        from './pages/Landing';
import Dashboard      from './pages/Dashboard';
import CreateGroup    from './pages/CreateGroup';
import GroupDashboard from './pages/GroupDashboard';
import JoinGroup      from './pages/JoinGroup';
import JoinByCode     from './pages/JoinByCode';
import SpotExplorer   from './pages/SpotExplorer';
import SoloPlan       from './pages/SoloPlan';
import SoloPlanDetail from './pages/SoloPlanDetail';
import GroupPlans     from './pages/GroupPlans';
import PandalMapPage  from './pages/PandalMapPage';

// Full-screen loader shown during minimum 2-second splash delay on app launch
function SplashLoader() {
  return <Landing showButton={false} />;
}

// Redirect authenticated users away from landing after 2-second splash
function PublicRoute({ children, splashDone }) {
  const { user, loading } = useAuth();
  if (!splashDone || loading) return <SplashLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// Redirect unauthenticated users to landing after 2-second splash
function PrivateRoute({ children, splashDone }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!splashDone || loading) return <SplashLoader />;
  if (!user) return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

function AppRoutes() {
  const [splashDone, setSplashDone] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSplashDone(true);
    }, 2000); // exactly 2 seconds of loading splash screen
    return () => clearTimeout(timer);
  }, []);

  return (
    <Routes>
      {/* Public */}
      <Route path="/"    element={<PublicRoute splashDone={splashDone}><Landing /></PublicRoute>} />
      {/* Join is semi-public: shows invite info without auth, requires auth to actually join */}
      <Route path="/join/:token" element={<JoinGroup />} />

      {/* Protected */}
      <Route path="/dashboard"        element={<PrivateRoute splashDone={splashDone}><Dashboard /></PrivateRoute>} />
      <Route path="/groups"           element={<PrivateRoute splashDone={splashDone}><GroupPlans /></PrivateRoute>} />
      <Route path="/create-group"     element={<PrivateRoute splashDone={splashDone}><CreateGroup /></PrivateRoute>} />
      <Route path="/join-code"        element={<PrivateRoute splashDone={splashDone}><JoinByCode /></PrivateRoute>} />
      <Route path="/group/:id"        element={<PrivateRoute splashDone={splashDone}><GroupDashboard /></PrivateRoute>} />
      <Route path="/group/:id/spots"  element={<PrivateRoute splashDone={splashDone}><SpotExplorer mode="group" /></PrivateRoute>} />
      <Route path="/solo"             element={<PrivateRoute splashDone={splashDone}><SoloPlan /></PrivateRoute>} />
      <Route path="/solo/:id"         element={<PrivateRoute splashDone={splashDone}><SoloPlanDetail /></PrivateRoute>} />
      <Route path="/solo/:id/spots"   element={<PrivateRoute splashDone={splashDone}><SpotExplorer mode="solo" /></PrivateRoute>} />
      <Route path="/map"              element={<PrivateRoute splashDone={splashDone}><PandalMapPage /></PrivateRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
