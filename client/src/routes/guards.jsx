import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/ui/Loader';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader label="Loading Orbit" size="lg" variant="screen" />;
  return user ? children : <Navigate to="/login" replace />;
}

export function RequireManager({ children }) {
  const { user, loading, isManager } = useAuth();
  if (loading) return <Loader label="Loading Orbit" size="lg" variant="screen" />;
  if (!user) return <Navigate to="/login" replace />;
  return isManager ? children : <Navigate to="/" replace />;
}

