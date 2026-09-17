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

// Full-screen loader shown while Firebase auth state resolves
function SplashLoader() {
  return <Landing showButton={false} />;
}

// Redirect authenticated users away from landing
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashLoader />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return children;
}

// Redirect unauthenticated users to landing
function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SplashLoader />;
  if (!user)   return <Navigate to="/" state={{ from: location }} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"    element={<PublicRoute><Landing /></PublicRoute>} />
      {/* Join is semi-public: shows invite info without auth, requires auth to actually join */}
      <Route path="/join/:token" element={<JoinGroup />} />

      {/* Protected */}
      <Route path="/dashboard"        element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/groups"           element={<PrivateRoute><GroupPlans /></PrivateRoute>} />
      <Route path="/create-group"     element={<PrivateRoute><CreateGroup /></PrivateRoute>} />
      <Route path="/join-code"        element={<PrivateRoute><JoinByCode /></PrivateRoute>} />
      <Route path="/group/:id"        element={<PrivateRoute><GroupDashboard /></PrivateRoute>} />
      <Route path="/group/:id/spots"  element={<PrivateRoute><SpotExplorer mode="group" /></PrivateRoute>} />
      <Route path="/solo"             element={<PrivateRoute><SoloPlan /></PrivateRoute>} />
      <Route path="/solo/:id"         element={<PrivateRoute><SoloPlanDetail /></PrivateRoute>} />
      <Route path="/solo/:id/spots"   element={<PrivateRoute><SpotExplorer mode="solo" /></PrivateRoute>} />
      <Route path="/map"              element={<PrivateRoute><PandalMapPage /></PrivateRoute>} />

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
