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
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { LoadingSkeleton } from './Loader';

// ── VAPID key decoder ─────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  if (
    typeof base64String !== "string" ||
    !base64String.trim()
  ) {
    throw new Error(
      "Invalid VAPID public key."
    );
  }

  const normalized =
    base64String.trim();

  const padding =
    "=".repeat(
      (4 - (normalized.length % 4)) % 4
    );

  const base64 = (
    normalized + padding
  )
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  let binary;

  try {
    binary = atob(base64);
  } catch {
    throw new Error(
      "Invalid VAPID public key encoding."
    );
  }

  return Uint8Array.from(
    [...binary].map((char) =>
      char.charCodeAt(0)
    )
  );
}

// ── Push subscription save ────────────────────────────────────────
async function savePushSubscription(subscription) {
  const subJson = typeof subscription.toJSON === 'function'
    ? subscription.toJSON()
    : subscription;
  await api.post('/notifications/push-subscribe', subJson);
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [loadError,     setLoadError]     = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [pushStatus,    setPushStatus]    = useState('idle'); // idle | pending | granted | denied | unsupported

  const swRegRef       = useRef(null);   // holds the ServiceWorkerRegistration
  const subscribedRef  = useRef(false);  // prevents double-subscription in React StrictMode
  const setupUserRef   = useRef(null);
  const dropdownRef    = useRef(null);

  // ── Load notifications ──────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
  try {
    setLoading(true);
    setLoadError('');

    const notificationsResponse =
      await api.get('/notifications');

    const notifs = Array.isArray(
      notificationsResponse.data,
    )
      ? notificationsResponse.data
      : [];

    setNotifications(notifs);

    // Count is secondary.
    // Even if unread-count fails, notification list
    // should still work.
    try {
      const countResponse =
        await api.get('/notifications/unread-count');

      const count =
        Number(countResponse.data?.count);

      if (Number.isInteger(count) && count >= 0) {
        setUnreadCount(count);
      } else {
        setUnreadCount(
          notifs.filter(
            (notification) => !notification.read,
          ).length,
        );
      }
    } catch (countError) {
      console.warn(
        '[NotificationBell] Failed to load unread count:',
        countError,
      );

      setUnreadCount(
        notifs.filter(
          (notification) => !notification.read,
        ).length,
      );
    }
  } catch (err) {
    const serverMessage =
      err?.response?.data?.error ||
      err?.response?.data?.message;

    setLoadError(
      serverMessage ||
        'Notifications could not be loaded.',
    );

    console.error(
      '[NotificationBell] Failed to load notifications:',
      err,
    );
  } finally {
    setLoading(false);
  }
}, []);

  // ── Register SW + subscribe to push ────────────────────────────
const setupPush = useCallback(async () => {
  if (
    subscribedRef.current &&
    setupUserRef.current === user?.id
  ) {
    return;
  }

  // ==========================================================
  // 1. BROWSER SUPPORT
  // ==========================================================

  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    console.warn(
      "[NotificationBell] Web Push is not supported by this browser."
    );

    setPushStatus("unsupported");
    return;
  }

  // ==========================================================
  // 2. PERMISSION ALREADY DENIED
  // ==========================================================

  if (Notification.permission === "denied") {
    console.warn(
      "[NotificationBell] Browser notification permission is denied."
    );

    setPushStatus("denied");
    return;
  }

  try {
    // ========================================================
    // 3. REGISTER SERVICE WORKER
    // ========================================================

    console.log(
      "[NotificationBell] Registering /sw.js..."
    );

    const registration =
      await navigator.serviceWorker.register(
        "/sw.js",
        {
          scope: "/",
          updateViaCache: "none",
        }
      );

    swRegRef.current = registration;

    console.log(
      "[NotificationBell] ✅ Service worker registered:",
      registration.scope
    );

    // ========================================================
    // 4. WAIT FOR SERVICE WORKER
    // ========================================================

    const readyRegistration =
      await navigator.serviceWorker.ready;

    swRegRef.current = readyRegistration;

    console.log(
      "[NotificationBell] ✅ Service worker ready"
    );

    // ========================================================
    // 5. REQUEST NOTIFICATION PERMISSION
    // ========================================================

    setPushStatus("pending");

    const permission =
      await Notification.requestPermission();

    setPushStatus(permission);

    console.log(
      "[NotificationBell] Notification permission:",
      permission
    );

    if (permission !== "granted") {
      return;
    }

    // ========================================================
    // 6. GET VAPID PUBLIC KEY
    // ========================================================

    console.log(
      "[NotificationBell] Fetching VAPID public key..."
    );

    const vapidResponse =
      await api.get(
        "/notifications/vapid-public-key"
      );

    const publicKey =
      vapidResponse.data?.publicKey;

    if (
      typeof publicKey !== "string" ||
      !publicKey.trim()
    ) {
      console.warn(
        "[NotificationBell] Server returned no VAPID public key."
      );

      return;
    }

    console.log(
      "[NotificationBell] ✅ VAPID public key received."
    );

    // ========================================================
    // 7. GET EXISTING PUSH SUBSCRIPTION
    // ========================================================

    let subscription =
      await readyRegistration.pushManager.getSubscription();

    if (subscription) {
      console.log(
        "[NotificationBell] ✅ Existing push subscription found."
      );
    }

    // ========================================================
    // 8. CREATE NEW PUSH SUBSCRIPTION
    // ========================================================

    if (!subscription) {
      console.log(
        "[NotificationBell] Creating new push subscription..."
      );

      const applicationServerKey =
        urlBase64ToUint8Array(publicKey);

      console.log(
        "[NotificationBell] VAPID key byte length:",
        applicationServerKey.length
      );

      /*
       * A valid VAPID P-256 public key
       * should decode to 65 bytes.
       */

      if (
        !(applicationServerKey instanceof Uint8Array) ||
        applicationServerKey.length !== 65
      ) {
        throw new Error(
          `Invalid VAPID public key. Expected 65 bytes, received ${applicationServerKey.length}.`
        );
      }

      try {
        subscription =
          await readyRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });

        console.log(
          "[NotificationBell] ✅ PushManager.subscribe() succeeded."
        );
      } catch (subscribeError) {
        console.error(
          "[NotificationBell] ❌ PushManager.subscribe() failed:",
          {
            name: subscribeError?.name,
            message: subscribeError?.message,
            code: subscribeError?.code,
          },
          subscribeError
        );

        throw subscribeError;
      }
    }

    // ========================================================
    // 9. VALIDATE SUBSCRIPTION
    // ========================================================

    if (!subscription) {
      throw new Error(
        "Browser did not return a push subscription."
      );
    }

    console.log(
      "[NotificationBell] ✅ Browser push subscription ready."
    );

    // ========================================================
    // 10. SAVE SUBSCRIPTION TO BACKEND
    // ========================================================

    console.log(
      "[NotificationBell] Saving push subscription to server..."
    );

    await savePushSubscription(subscription);

    console.log(
      "[NotificationBell] ✅ Push subscription saved to server."
    );

    // ========================================================
    // 11. MARK PUSH AS READY
    // ========================================================

    subscribedRef.current = true;
    setupUserRef.current = user?.id;

    setPushStatus("granted");

    console.log(
      "[NotificationBell] ✅ Push subscribed for:",
      user?.name
    );
  } catch (err) {
    console.error(
      "[NotificationBell] ❌ Push setup failed:",
      {
        name: err?.name,
        message: err?.message,
        code: err?.code,
      },
      err
    );

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "denied"
    ) {
      setPushStatus("denied");
    }
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
  if (!user) {
    subscribedRef.current = false;
    setupUserRef.current = null;
    return undefined;
  }

  loadNotifications();

  const interval = setInterval(
    loadNotifications,
    30_000
  );

  return () => {
    clearInterval(interval);
  };
}, [user, loadNotifications]);

  useEffect(() => {
    const refresh = () => loadNotifications();
    window.addEventListener('orbit:notifications-updated', refresh);
    return () => window.removeEventListener('orbit:notifications-updated', refresh);
  }, [loadNotifications]);

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
  const handleMarkAsRead = async (id, navigableUrl) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      setNotifications((current) => current.map((notification) => (
        notification.id === id ? { ...notification, read: true } : notification
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
      await api.patch(`/notifications/${id}/read`);
      if (navigableUrl) navigate(navigableUrl);
    } catch (err) {
      console.error('[NotificationBell] Mark as read failed:', err);
      loadNotifications();
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (actionLoading) return;
    setActionLoading('all');
    try {
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
      setUnreadCount(0);
      await api.patch('/notifications/read-all');
    } catch (err) {
      console.error('[NotificationBell] Mark all read failed:', err);
      loadNotifications();
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (actionLoading) return;
    setActionLoading(id);
    try {
      const deleted = notifications.find((notification) => notification.id === id);
      await api.delete(`/notifications/${id}`);
      setNotifications((current) => current.filter((notification) => notification.id !== id));
      if (deleted && !deleted.read) setUnreadCount((count) => Math.max(0, count - 1));
    } catch (err) {
      console.error('[NotificationBell] Delete failed:', err);
      loadNotifications();
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

      {/* Bell button */}
      <button
  onClick={async () => {
    setShowDropdown((v) => !v);

    if (!showDropdown) {
      loadNotifications();

      if (
        !subscribedRef.current ||
        setupUserRef.current !== user?.id
      ) {
        await setupPush();
      }
    }
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
          width: 'min(320px, calc(100vw - 24px))', maxHeight: '440px',
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
                disabled={actionLoading !== null}
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
                <div className="orbit-notification-skeleton-list" aria-label="Loading notifications">
                  <LoadingSkeleton lines={3} />
              </div>
              ) : loadError ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--danger)', fontSize: '13px' }}>
                  {loadError}
                  <button className="btn btn-ghost btn-sm" onClick={loadNotifications} style={{ display: 'block', margin: '10px auto 0' }}>Retry</button>
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
                  onClick={() => !n.read && handleMarkAsRead(n.id, n.metadata?.url)}
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
                      <div
  style={{
    fontSize: '11px',
    color: 'var(--text-3)',
    marginTop: '4px',
  }}
>
  {new Date(n.created_at).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })}{' '}
  {new Date(n.created_at).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  })}
</div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(n.id, e)}
                      disabled={actionLoading !== null}
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
