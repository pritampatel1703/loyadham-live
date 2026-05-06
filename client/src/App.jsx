import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Production from './pages/Production';
import VmixControl from './pages/VmixControl';
import Events from './pages/Events';
import Analytics from './pages/Analytics';
import Streaming from './pages/Streaming';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Camera from './pages/Camera';
import Home from './pages/Home';
import Watch from './pages/Watch';

function ProtectedRoute({ children }) {
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/camera" element={<Camera />} />
      <Route path="/home" element={<Home />} />
      <Route path="/watch" element={<Watch />} />
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="production" element={<Production />} />
        <Route path="vmix" element={<VmixControl />} />
        <Route path="events" element={<Events />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="streaming" element={<Streaming />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
