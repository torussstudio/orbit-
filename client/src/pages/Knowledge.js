import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import Modal from '../components/ui/Modal';

export default function Knowledge({ project: propProject }) {
  const params = useParams();
  const projectId = propProject?.id || params.id;
  const { isManager } = useAuth();
  const [data, setData] = useState({ folders: [], files: [], notes: [] });
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: '', content: '' });
  const [editingNote, setEditingNote] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => api.get(`/knowledge/project/${projectId}`).then(r => setData(r.data)).finally(() => setLoading(false));
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const createFolder = async () => {
    await api.post('/knowledge/folders', { project_id: projectId, name: folderName });
    setShowFolderModal(false); setFolderName(''); load();
  };

  const deleteFolder = async id => {
    if (window.confirm('Delete folder and all its contents?')) { await api.delete(`/knowledge/folders/${id}`); load(); }
  };

  const handleUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('project_id', projectId);
    if (selectedFolder) fd.append('folder_id', selectedFolder);
    try { await api.post('/knowledge/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); load(); }
    catch (err) { alert('Upload failed: ' + (err.response?.data?.error || err.message)); }
    finally { setUploading(false); fileRef.current.value = ''; }
  };

  const deleteFile = async id => {
    if (window.confirm('Delete file?')) { await api.delete(`/knowledge/files/${id}`); load(); }
  };

  const saveNote = async () => {
    if (editingNote) await api.put(`/knowledge/notes/${editingNote.id}`, noteForm);
    else await api.post('/knowledge/notes', { ...noteForm, project_id: projectId, folder_id: selectedFolder || null });
    setShowNoteModal(false); setNoteForm({ title: '', content: '' }); setEditingNote(null); load();
  };

  const deleteNote = async id => {
    if (window.confirm('Delete note?')) { await api.delete(`/knowledge/notes/${id}`); load(); }
  };

  const filteredFiles = data.files.filter(f => selectedFolder ? f.folder_id === selectedFolder : !f.folder_id);
  const filteredNotes = data.notes.filter(n => selectedFolder ? n.folder_id === selectedFolder : !n.folder_id);

  if (loading) return <div style={{ padding: '24px' }}><div className="spinner" /></div>;

  return (
    <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px', alignItems: 'start' }}>
      {/* Folder sidebar */}
      <div className="card" style={{ padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Folders</span>
          {isManager && <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }} onClick={() => setShowFolderModal(true)}>+</button>}
        </div>
        <div className={`folder-item ${!selectedFolder ? 'active' : ''}`} onClick={() => setSelectedFolder(null)}>
          📁 All Files
        </div>
        {data.folders.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className={`folder-item ${selectedFolder === f.id ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setSelectedFolder(f.id)}>
              📂 {f.name}
            </div>
            {isManager && <button style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '12px', padding: '4px' }} onClick={() => deleteFolder(f.id)}>✕</button>}
          </div>
        ))}
      </div>

      {/* Content area */}
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.csv,.zip" />
          <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : '⬆ Upload File'}
          </button>
          {isManager && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingNote(null); setNoteForm({ title: '', content: '' }); setShowNoteModal(true); }}>
              📝 New Note
            </button>
          )}
        </div>

        {/* Notes */}
        {filteredNotes.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Notes</h3>
            <div className="card-grid">
              {filteredNotes.map(n => (
                <div className="card" key={n.id} style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{n.title}</span>
                    {isManager && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => { setEditingNote(n); setNoteForm({ title: n.title, content: n.content || '' }); setShowNoteModal(true); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => deleteNote(n.id)}>Del</button>
                      </div>
                    )}
                  </div>
                  {n.content && <p style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'pre-wrap', maxHeight: '80px', overflow: 'hidden' }}>{n.content}</p>}
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' }}>by {n.created_by_name} · {formatDate(n.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        <h3 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Files</h3>
        {filteredFiles.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}><div className="empty-state-icon">📄</div><h3>No files yet</h3></div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Uploaded by</th><th>Date</th><th /></tr></thead>
              <tbody>
                {filteredFiles.map(f => (
                  <tr key={f.id}>
                    <td><a href={f.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>📎 {f.name}</a></td>
                    <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{f.mime_type?.split('/')[1] || '—'}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{f.file_size ? `${Math.round(f.file_size / 1024)} KB` : '—'}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: '12px' }}>{f.uploaded_by_name}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{formatDate(f.created_at)}</td>
                    <td>{isManager && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: '11px' }} onClick={() => deleteFile(f.id)}>Del</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFolderModal && (
        <Modal title="New Folder" onClose={() => setShowFolderModal(false)}>
          <div className="form-group">
            <label className="form-label">Folder Name</label>
            <input className="form-input" value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="e.g. Design Assets, API Docs" autoFocus />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowFolderModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createFolder}>Create</button>
          </div>
        </Modal>
      )}

      {showNoteModal && (
        <Modal title={editingNote ? 'Edit Note' : 'New Note'} onClose={() => setShowNoteModal(false)}>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={noteForm.title} onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))} placeholder="Note title" />
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea className="form-textarea" rows={8} value={noteForm.content} onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))} placeholder="Write your note here..." />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowNoteModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveNote}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
