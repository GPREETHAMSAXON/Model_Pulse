import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';

import LoginPage    from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ModelDetailPage from './pages/ModelDetailPage';
import Layout from './components/Layout';

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  return token ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const token   = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) fetchMe();
  }, [token]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* Protected */}
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"        element={<DashboardPage />} />
          <Route path="models/:id"       element={<ModelDetailPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
