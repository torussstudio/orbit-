
/* =========================================================
   Orbit Service Worker
   Web Push + Notification Click Handling
   ========================================================= */

self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activated.");

  event.waitUntil(
    self.clients.claim()
  );
});

/* =========================================================
   PUSH EVENT
   ========================================================= */

self.addEventListener("push", (event) => {
  console.log("[SW] Push event received.");

  let data = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (error) {
    console.warn("[SW] Failed to parse push payload:", error);

    try {
      data = {
        body: event.data?.text() || "",
      };
    } catch {
      data = {};
    }
  }

  const title =
    data.title ||
    "Orbit";

  const body =
    data.body ||
    data.message ||
    "You have a new notification.";

  const icon =
    data.icon ||
    "/icons/icon-192.png";

  const badge =
    data.badge ||
    "/icons/icon-192.png";

  const notificationData =
    data.data ||
    {};

  const options = {
    body,
    icon,
    badge,

    data: notificationData,

    tag:
      notificationData?.notificationId
        ? `orbit-${notificationData.notificationId}`
        : "orbit-notification",

    renotify: true,

    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

/* =========================================================
   NOTIFICATION CLICK
   ========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const url =
      event.notification?.data?.url ||
      "/";

    event.waitUntil(
      (async () => {
        const clientList =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        // Try to focus an existing Orbit tab
        for (const client of clientList) {
          if (
            "focus" in client &&
            client.url.includes(location.origin)
          ) {
            await client.focus();

            if (
              url &&
              "navigate" in client
            ) {
              await client.navigate(url);
            }

            return;
          }
        }

        // Otherwise open a new tab
        if (self.clients.openWindow) {
          await self.clients.openWindow(url);
        }
      })()
    );
  }
);

/* =========================================================
   PUSH SUBSCRIPTION CHANGE
   ========================================================= */

self.addEventListener(
  "pushsubscriptionchange",
  (event) => {
    console.log(
      "[SW] Push subscription changed."
    );

    const newSubscription =
      event.newSubscription;

    if (!newSubscription) {
      console.warn(
        "[SW] Subscription was removed and no new subscription exists."
      );

      return;
    }

    event.waitUntil(
      (async () => {
        const subscription =
          newSubscription.toJSON();

        const clients =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        for (const client of clients) {
          client.postMessage({
            type:
              "PUSH_SUBSCRIPTION_CHANGED",

            subscription,
          });
        }
      })()
    );
  }
);