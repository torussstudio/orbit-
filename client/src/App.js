import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Clusters from './pages/Clusters';
import ClusterDetail from './pages/ClusterDetail';
import Credentials from './pages/Credentials';
import Knowledge from './pages/Knowledge';
import Members from './pages/Members';
import Calendar from './pages/Calendar';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="projects/:id/tasks" element={<Tasks />} />
            <Route path="projects/:id/tasks/:taskId" element={<TaskDetail />} />
            <Route path="projects/:id/clusters" element={<Clusters />} />
            <Route path="projects/:id/clusters/:clusterId" element={<ClusterDetail />} />
            <Route path="projects/:id/credentials" element={<Credentials />} />
            <Route path="projects/:id/knowledge" element={<Knowledge />} />
            <Route path="members" element={<Members />} />
            <Route path="calendar" element={<Calendar />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
