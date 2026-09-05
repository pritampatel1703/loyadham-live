import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Production from './pages/Production';
import VmixControl from './pages/VmixControl';
import AtemControl from './pages/AtemControl';
import Events from './pages/Events';
import Analytics from './pages/Analytics';
import Streaming from './pages/Streaming';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Camera from './pages/Camera';
import Home from './pages/Home';
import Watch from './pages/Watch';
import Output from './pages/Output';
import ProgramOutput from './pages/ProgramOutput';

function AppRoutes() {
  const { loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/camera" element={<Camera />} />
      <Route path="/home" element={<Home />} />
      <Route path="/watch" element={<Watch />} />
      <Route path="/output/pgm" element={<ProgramOutput />} />
      <Route path="/output/:id" element={<Output />} />
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="production" element={<Production />} />
        <Route path="vmix" element={<VmixControl />} />
        <Route path="atem" element={<AtemControl />} />
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
