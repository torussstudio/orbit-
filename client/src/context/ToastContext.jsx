import { createContext, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [slowRequests, setSlowRequests] = useState(0);
  const [assistantSlow, setAssistantSlow] = useState(false);
  const [networkError, setNetworkError] = useState('');

  useEffect(() => {
    const handleToast = (event) => {
      const { type = 'success', message } = event.detail || {};
      if (!message) return;
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((current) => [...current.slice(-3), { id, type, message }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3600);
    };
    window.addEventListener('orbit:toast', handleToast);
    return () => window.removeEventListener('orbit:toast', handleToast);
  }, []);

  useEffect(() => {
    let errorTimer = null;
    const handleOffline = () => {
      setOnline(false);
      setNetworkError('');
      window.clearTimeout(errorTimer);
    };
    const handleOnline = () => setOnline(true);
    const handleSlow = (event) => setSlowRequests(Number(event.detail?.count) || 0);
    const handleAssistantSlow = (event) => setAssistantSlow(Boolean(event.detail?.active));
    const handleNetworkError = (event) => {
      if (navigator.onLine === false) return;
      setNetworkError(event.detail?.message || 'Could not reach Orbit. Check your network and try again.');
      window.clearTimeout(errorTimer);
      errorTimer = window.setTimeout(() => setNetworkError(''), 8000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('orbit:network-slow', handleSlow);
    window.addEventListener('orbit:assistant-network-slow', handleAssistantSlow);
    window.addEventListener('orbit:network-error', handleNetworkError);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('orbit:network-slow', handleSlow);
      window.removeEventListener('orbit:assistant-network-slow', handleAssistantSlow);
      window.removeEventListener('orbit:network-error', handleNetworkError);
      window.clearTimeout(errorTimer);
    };
  }, []);

  const networkMessage = !online
    ? 'No internet connection. Check your network; Orbit changes may not save until you reconnect.'
    : slowRequests > 0 || assistantSlow
      ? 'Network is slow. Orbit is still waiting for a response.'
      : networkError;
  const networkTone = !online || networkError ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';

  return (
    <ToastContext.Provider value={null}>
      {children}
      {networkMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-2 z-[4000] flex justify-center px-3" aria-live="assertive">
          <div role="alert" className={`w-full max-w-2xl rounded-xl border px-4 py-2.5 text-center text-sm font-medium shadow-lg backdrop-blur ${networkTone}`}>
            {networkMessage}
          </div>
        </div>
      )}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-mark" aria-hidden="true">{toast.type === 'error' ? '!' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
