import Modal from './Modal';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDangerous = true,
  loading = false
}) {
  if (!isOpen) return null;

  return (
    <Modal title={title} onClose={!loading ? onCancel : () => { }}>
      <div style={{ marginBottom: '24px', fontSize: '14px', color: 'var(--text-2)' }}>
        {message}
      </div>
      <div className="modal-actions">
        <button
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          className={`btn ${isDangerous ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
