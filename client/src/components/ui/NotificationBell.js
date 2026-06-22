/**
 * NotificationBell.js
 * ─────────────────────────────────────────────────────────────────
 * Notification bell icon + dropdown for the Orbit navbar.
 *
 * Responsibilities:
 *   1. On mount (after login): register the Service Worker, request
 *      push permission, subscribe to Web Push, and save the
 *      subscription to the server.
 *   2. Poll in-app notifications every 30 s (bell dropdown).
 *   3. Render the unread badge count, list, mark-read/all-read.
 *   4. Listen for PUSH_SUBSCRIPTION_CHANGED messages from the SW
 *      and re-save the new subscription automatically.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// ── VAPID key decoder ─────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

// ── Push subscription save ────────────────────────────────────────
async function savePushSubscription(subscription) {
  const subJson = subscription.toJSON();
  await api.post('/notifications/push-subscribe', subJson);
}

export default function NotificationBell() {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [pushStatus,    setPushStatus]    = useState('idle'); // idle | pending | granted | denied | unsupported

  const swRegRef       = useRef(null);   // holds the ServiceWorkerRegistration
  const subscribedRef  = useRef(false);  // prevents double-subscription in React StrictMode
  const dropdownRef    = useRef(null);

  // ── Load notifications ──────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/notifications');
      const notifs = Array.isArray(data) ? data : [];
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.read).length);
    } catch (err) {
      console.error('[NotificationBell] Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Register SW + subscribe to push ────────────────────────────
  const setupPush = useCallback(async () => {
    if (subscribedRef.current) return; // already done this session

    // Guard: browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }

    // Guard: already denied
    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }

    try {
      // 1. Register the service worker
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      swRegRef.current = reg;

      // Wait for the SW to be ready (handles pending installs)
      await navigator.serviceWorker.ready;

      // 2. Request browser permission
      setPushStatus('pending');
      const permission = await Notification.requestPermission();
      setPushStatus(permission);

      if (permission !== 'granted') return;

      // 3. Fetch VAPID public key from server
      const { data: vapidData } = await api.get('/notifications/vapid-public-key');
      if (!vapidData?.publicKey) {
        console.warn('[NotificationBell] Server returned no VAPID public key; push disabled.');
        return;
      }

      // 4. Get or create a push subscription
      // Always unsubscribe first so we get a fresh key tied to this login session.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey),
      });

      // 5. Save to server
      await savePushSubscription(subscription);
      subscribedRef.current = true;

      console.log('[NotificationBell] ✅ Push subscribed for', user?.name);
    } catch (err) {
      console.error('[NotificationBell] Push setup failed:', err);
    }
  }, [user]);

  // ── Handle SW → app "subscription changed" message ─────────────
  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        try {
          await savePushSubscription(event.data.subscription);
          console.log('[NotificationBell] 🔄 Push subscription refreshed automatically');
        } catch (err) {
          console.error('[NotificationBell] Failed to refresh push subscription:', err);
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, []);

  // ── Main effect: load + poll + subscribe (runs when user logs in) ─
  useEffect(() => {
    if (!user) return;

    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);

    // Small delay: let the page finish rendering before the permission prompt
    const timer = setTimeout(() => setupPush(), 1500);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [user, loadNotifications, setupPush]);

  // ── Close dropdown on outside click ────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────
  const handleMarkAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      loadNotifications();
    } catch (err) {
      console.error('[NotificationBell] Mark as read failed:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      loadNotifications();
    } catch (err) {
      console.error('[NotificationBell] Mark all read failed:', err);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      loadNotifications();
    } catch (err) {
      console.error('[NotificationBell] Delete failed:', err);
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

      {/* Bell button */}
      <button
        onClick={() => {
          setShowDropdown((v) => !v);
          if (!showDropdown) loadNotifications(); // refresh on open
        }}
        title="Notifications"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--text-2)' }}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: 'var(--danger)', color: 'white',
            borderRadius: '50%', width: '20px', height: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '40px', right: '0px',
          width: '320px', maxHeight: '440px',
          background: 'var(--bg-2)', borderRadius: '12px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          zIndex: 1000, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--accent)', fontSize: '11px', fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Push status hint (only shown when not yet granted) */}
          {pushStatus === 'denied' && (
            <div style={{
              padding: '8px 16px', fontSize: '12px',
              color: 'var(--text-3)', background: 'rgba(239,68,68,0.05)',
              borderBottom: '1px solid var(--border)',
            }}>
              🔕 Push notifications are blocked in your browser settings.
            </div>
          )}

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: n.read ? 'transparent' : 'rgba(99,102,241,0.05)',
                    cursor: n.read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => !n.read && handleMarkAsRead(n.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      {/* Unread dot */}
                      {!n.read && (
                        <span style={{
                          display: 'inline-block', width: '6px', height: '6px',
                          background: 'var(--accent)', borderRadius: '50%',
                          marginRight: '6px', marginBottom: '2px', verticalAlign: 'middle',
                        }} />
                      )}
                      <span style={{
                        fontSize: '13px',
                        fontWeight: n.read ? 400 : 600,
                        color: 'var(--text)',
                      }}>
                        {n.message}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                        {new Date(n.created_at).toLocaleDateString()}{' '}
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(n.id, e)}
                      title="Delete"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-3)', fontSize: '14px', padding: '0 2px',
                        lineHeight: 1, opacity: 0.6,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{
              padding: '8px 16px', borderTop: '1px solid var(--border)',
              fontSize: '11px', color: 'var(--text-3)', textAlign: 'center',
            }}>
              Showing last {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
