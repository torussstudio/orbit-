import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth, RequireManager } from './routes/guards';
import Layout from './components/layout/Layout';
import { lazy, Suspense } from 'react';
import { ToastProvider } from './context/ToastContext';
import Loader from './components/ui/Loader';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Tasks = lazy(() => import('./pages/Tasks'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const TaskView = lazy(() => import('./pages/TaskView'));
const Clusters = lazy(() => import('./pages/Clusters'));
const ClusterDetail = lazy(() => import('./pages/ClusterDetail'));
const Credentials = lazy(() => import('./pages/Credentials'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Members = lazy(() => import('./pages/Members'));
const Calendar = lazy(() => import('./pages/Calendar'));
const InReview = lazy(() => import('./pages/InReview'));
const AccountSettings = lazy(() => import('./pages/AccountSettings'));

const SuspenseFallback = () => (
  <Loader label="Loading page" size="lg" variant="page" />
);

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Suspense fallback={<SuspenseFallback />}><Login /></Suspense>} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Suspense fallback={<SuspenseFallback />}><Dashboard /></Suspense>} />
            <Route path="projects" element={<Suspense fallback={<SuspenseFallback />}><Projects /></Suspense>} />
            <Route path="projects/:id" element={<Suspense fallback={<SuspenseFallback />}><ProjectDetail /></Suspense>} />
            <Route path="projects/:id/tasks" element={<Suspense fallback={<SuspenseFallback />}><Tasks /></Suspense>} />
            <Route path="projects/:id/tasks/:taskId" element={<Suspense fallback={<SuspenseFallback />}><TaskDetail /></Suspense>} />
            <Route path="projects/:id/clusters" element={<Suspense fallback={<SuspenseFallback />}><Clusters /></Suspense>} />
            <Route path="projects/:id/clusters/:clusterId" element={<Suspense fallback={<SuspenseFallback />}><ClusterDetail /></Suspense>} />
            <Route path="projects/:id/credentials" element={<Suspense fallback={<SuspenseFallback />}><Credentials /></Suspense>} />
            <Route path="projects/:id/knowledge" element={<Suspense fallback={<SuspenseFallback />}><Knowledge /></Suspense>} />
            <Route path="tasks-view" element={<Suspense fallback={<SuspenseFallback />}><TaskView /></Suspense>} />
            <Route path="members" element={<RequireManager><Suspense fallback={<SuspenseFallback />}><Members /></Suspense></RequireManager>} />
            <Route path="calendar" element={<Suspense fallback={<SuspenseFallback />}><Calendar /></Suspense>} />
            <Route path="in-review" element={<RequireManager><Suspense fallback={<SuspenseFallback />}><InReview /></Suspense></RequireManager>} />
            <Route path="account-settings" element={<Suspense fallback={<SuspenseFallback />}><AccountSettings /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
