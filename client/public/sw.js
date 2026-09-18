// Orbit Service Worker — handles Web Push and deep-link on click

self.addEventListener('push', (event) => {
  let data = {
    title: 'Orbit',
    body: 'You have a new notification',
    icon: '/orbit-icon-192.png',
    badge: '/orbit-icon-192.png',
    data: {},
  };

  try {
    data = JSON.parse(event.data.text());
  } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon  || '/orbit-icon-192.png',
      badge: data.badge || '/orbit-icon-192.png',
      data:  data.data  || {},
      actions: [
        { action: 'open',    title: 'Open Orbit' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // Deep-link to the URL carried in the notification payload
  const requestedUrl = event.notification.data?.url || '/';
  let url = '/';
  try {
    const parsedUrl = new URL(requestedUrl, self.location.origin);
    if (parsedUrl.origin === self.location.origin) {
      url = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    }
  } catch (_) {}

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If Orbit is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Auto-refresh push subscription if the browser rotates it
self.addEventListener('pushsubscriptionchange', (event) => {
  const newSubscription = event.newSubscription;
  if (!newSubscription) return;
  event.waitUntil(self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({
      type: 'PUSH_SUBSCRIPTION_CHANGED',
      subscription: newSubscription.toJSON(),
    }));
  }));
});