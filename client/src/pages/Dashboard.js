import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, isOverdue } from '../utils/helpers';

export default function Dashboard() {
  const { user, isManager } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋</div>
          <div className="page-subtitle">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>
      <div className="page-body">
        {isManager ? <ManagerDash data={data} /> : <DevDash data={data} />}
      </div>
    </>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function ManagerDash({ data }) {
  if (!data) return null;
  const totalTasks = data.tasks_by_stage?.reduce((s, r) => s + parseInt(r.count), 0) || 0;
  const doneTasks = data.tasks_by_stage?.find(r => r.stage === 'Done')?.count || 0;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{data.projects?.length || 0}</div>
          <div className="stat-label">Active Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalTasks}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{parseInt(doneTasks)}</div>
          <div className="stat-label">Completed Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{data.overdue_tasks?.length || 0}</div>
          <div className="stat-label">Overdue Tasks</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Projects */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Projects</h3>
            <Link to="/projects" className="btn btn-ghost btn-sm">View All</Link>
          </div>
          {data.projects?.length === 0 ? <Empty text="No projects yet" /> :
            data.projects?.map(p => {
              const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
              return (
                <Link to={`/projects/${p.id}`} key={p.id} style={{ display: 'block', textDecoration: 'none', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text)' }}>{p.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{pct}%</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{p.done_tasks}/{p.total_tasks} tasks done</div>
                </Link>
              );
            })}
        </div>

        {/* Team Workload */}
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Team Workload</h3>
          {data.workload?.length === 0 ? <Empty text="No members yet" /> :
            data.workload?.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="user-avatar" style={{ width: '28px', height: '28px', fontSize: '11px' }}>{w.name[0]}</div>
                  <span style={{ fontSize: '13px' }}>{w.name}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent)' }}>{w.task_count} tasks</span>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Overdue */}
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--danger)' }}>⚠ Overdue Tasks</h3>
          {data.overdue_tasks?.length === 0 ? <Empty text="All clear!" icon="✅" /> :
            data.overdue_tasks?.map(t => (
              <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <div style={{ color: 'var(--text)' }}>{t.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px' }}>
                  {t.project_name} · Due {formatDate(t.due_date)} · {t.assignee_name || 'Unassigned'}
                </div>
              </div>
            ))}
        </div>

        {/* Rework leaders */}
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>🔁 Rework Tracker</h3>
          {data.cluster_rework?.length === 0 ? <Empty text="No rework cycles yet" icon="🎯" /> :
            data.cluster_rework?.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px' }}>{c.name}</span>
                <span className="rework-counter"><span className="rework-count">↺ {c.rework_count}</span></span>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function DevDash({ data }) {
  if (!data) return null;
  const byStage = {};
  data.my_tasks?.forEach(t => { byStage[t.stage] = (byStage[t.stage] || 0) + 1; });

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{data.my_tasks?.length || 0}</div><div className="stat-label">My Active Tasks</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--warning)' }}>{byStage['In Progress'] || 0}</div><div className="stat-label">In Progress</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--accent-2)' }}>{byStage['In Review'] || 0}</div><div className="stat-label">In Review</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: 'var(--danger)' }}>{data.overdue_tasks?.length || 0}</div><div className="stat-label">Overdue</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>My Tasks</h3>
          {data.my_tasks?.length === 0 ? <Empty text="No tasks assigned" icon="🎉" /> :
            data.my_tasks?.map(t => (
              <Link to={`/projects/${t.project_id}/tasks/${t.id}`} key={t.id} style={{ display: 'block', textDecoration: 'none', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{t.title}</span>
                  <StageBadge stage={t.stage} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '3px' }}>
                  {t.project_name}{t.due_date ? ` · Due ${formatDate(t.due_date)}` : ''}
                </div>
              </Link>
            ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Recent Comments</h3>
          {data.recent_comments?.length === 0 ? <Empty text="No recent activity" /> :
            data.recent_comments?.map(c => (
              <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{c.author_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-2)', margin: '2px 0' }}>{c.content}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>on {c.task_title}</div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function Empty({ text, icon = '📭' }) {
  return <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3)', fontSize: '13px' }}>{icon} {text}</div>;
}

export function StageBadge({ stage }) {
  const key = stage?.toLowerCase().replace(/\s/g, '');
  return <span className={`badge badge-${key}`}>{stage}</span>;
}
