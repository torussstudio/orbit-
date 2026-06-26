import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth, RequireManager } from './routes/guards';
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
import InReview from './pages/InReview';
import AccountSettings from './pages/AccountSettings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="projects/:id/tasks" element={<Tasks />} />
            <Route path="projects/:id/tasks/:taskId" element={<TaskDetail />} />
            <Route path="projects/:id/clusters" element={<Clusters />} />
            <Route path="projects/:id/clusters/:clusterId" element={<ClusterDetail />} />
            <Route path="projects/:id/credentials" element={<Credentials />} />
            <Route path="projects/:id/knowledge" element={<Knowledge />} />
            <Route path="members" element={<RequireManager><Members /></RequireManager>} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="in-review" element={<RequireManager><InReview /></RequireManager>} />
            <Route path="account-settings" element={<AccountSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}