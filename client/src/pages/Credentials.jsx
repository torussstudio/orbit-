import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import Select from '../components/ui/Select';

export default function Credentials({ project: propProject }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingCluster, setEditingCluster] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [clusterForm, setClusterForm] = useState({ name: '', visibility: 'private' });
  const [entryForm, setEntryForm] = useState({ label: '', value: '' });
  const [savingCluster, setSavingCluster] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false });

  const load = () => api.get(`/credentials/project/${projectId}`).then(r => setClusters(r.data)).finally(() => setLoading(false));
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const saveCluster = async () => {
    setSavingCluster(true);
    try {
      if (editingCluster) await api.put(`/credentials/clusters/${editingCluster.id}`, clusterForm);
      else await api.post('/credentials/clusters', { ...clusterForm, project_id: projectId });
      setShowClusterModal(false); setEditingCluster(null); load();
    } finally {
      setSavingCluster(false);
    }
  };

  const deleteCluster = (id) => {
    setConfirmModal({
      show: true,
      title: 'Delete Cluster',
      message: 'Delete this credential cluster and all its entries?',
      isDangerous: true,
      action: async () => {
        await api.delete(`/credentials/clusters/${id}`);
        load();
      },
      loading: false
    });
  };

  const saveEntry = async () => {
    setSavingEntry(true);
    try {
      await api.post('/credentials/entries', { ...entryForm, cluster_id: selectedClusterId });
      setShowEntryModal(false); setEntryForm({ label: '', value: '' }); load();
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = (id) => {
    setConfirmModal({
      show: true,
      title: 'Delete Credential',
      message: 'Delete this credential?',
      isDangerous: true,
      action: async () => {
        await api.delete(`/credentials/entries/${id}`);
        load();
      },
      loading: false
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmModal.action) return;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      await confirmModal.action();
    } finally {
      setConfirmModal({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false });
    }
  };

  const toggleReveal = (id) => setRevealed(r => ({ ...r, [id]: !r[id] }));

  if (loading) return <div style={{ padding: '24px' }}><div className="spinner" /></div>;

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
          {isManager ? 'All credential clusters (private + public)' : 'Public credential clusters only'}
        </div>
        {isManager && <button className="btn btn-primary btn-sm" onClick={() => { setEditingCluster(null); setClusterForm({ name: '', visibility: 'private' }); setShowClusterModal(true); }}>+ New Cluster</button>}
      </div>

      {clusters.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔐</div><h3>No credentials yet</h3></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {clusters.map(cluster => (
            <div className="card" key={cluster.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600 }}>{cluster.name}</span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: cluster.visibility === 'private' ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)', color: cluster.visibility === 'private' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    {cluster.visibility === 'private' ? '🔒 Private' : '👁 Public'}
                  </span>
                </div>
                {isManager && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedClusterId(cluster.id); setEntryForm({ label: '', value: '' }); setShowEntryModal(true); }}>+ Add Entry</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditingCluster(cluster); setClusterForm({ name: cluster.name, visibility: cluster.visibility }); setShowClusterModal(true); }}>Edit</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteCluster(cluster.id)}>Delete</button>
                  </div>
                )}
              </div>

              {!cluster.entries || cluster.entries.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>No entries yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={{ textAlign: 'left', fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.5px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Label</th><th style={{ textAlign: 'left', fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.5px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Value</th>{isManager && <th style={{ borderBottom: '1px solid var(--border)' }} />}</tr></thead>
                  <tbody>
                    {cluster.entries.map(entry => (
                      <tr key={entry.id}>
                        <td style={{ padding: '10px 0', fontSize: '13px', color: 'var(--text-2)', borderBottom: '1px solid var(--border)', width: '30%' }}>{entry.label}</td>
                        <td style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <span className={`cred-value ${!revealed[entry.id] ? 'masked' : ''}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                            {!revealed[entry.id] ? '••••••••••••' : entry.value}
                          </span>
                          {isManager && (
                            <button onClick={() => toggleReveal(entry.id)} style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>
                              {revealed[entry.id] ? 'Hide' : 'Reveal'}
                            </button>
                          )}
                        </td>
                        {isManager && (
                          <td style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '2px 8px', fontSize: '11px' }} onClick={() => deleteEntry(entry.id)}>Remove</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {showClusterModal && (
        <Modal title={editingCluster ? 'Edit Cluster' : 'New Credential Cluster'} onClose={() => setShowClusterModal(false)}>
          <div className="form-group">
            <label className="form-label">Cluster Name</label>
            <input className="form-input" value={clusterForm.name} onChange={e => setClusterForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Production Server, CMS Login" />
          </div>
          <div className="form-group">
            <label className="form-label">Visibility</label>
            <Select value={clusterForm.visibility} onChange={val => setClusterForm(f => ({ ...f, visibility: val }))}>
              <option value="private">🔒 Private — Manager only</option>
              <option value="public">👁 Public — Visible to members (values masked)</option>
            </Select>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowClusterModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveCluster} disabled={savingCluster}>
              {savingCluster ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {showEntryModal && (
        <Modal title="Add Credential" onClose={() => setShowEntryModal(false)}>
          <div className="form-group">
            <label className="form-label">Label</label>
            <input className="form-input" value={entryForm.label} onChange={e => setEntryForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Database Password, API Key" />
          </div>
          <div className="form-group">
            <label className="form-label">Value</label>
            <input className="form-input" type="password" value={entryForm.value} onChange={e => setEntryForm(f => ({ ...f, value: e.target.value }))} placeholder="Enter the credential value" />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowEntryModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEntry} disabled={savingEntry}>
              {savingEntry ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmModal 
        isOpen={confirmModal.show}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.isDangerous ? 'Delete' : 'Confirm'}
        isDangerous={confirmModal.isDangerous}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmModal({ show: false, title: '', message: '', action: null, loading: false, isDangerous: false })}
        loading={confirmModal.loading}
      />
    </div>
  );
}
