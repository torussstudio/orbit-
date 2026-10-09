
/* =========================================================
   Orbit Service Worker
   Web Push + Notification Click Handling
   ========================================================= */

/*
 * Change this text whenever this file should be installed again in
 * members' browsers. A browser installs a new service worker when any
 * byte of sw.js differs, and this worker takes over at once
 * (skipWaiting + clients.claim below).
 *
 * It does not cache pages or scripts, so it has no say in which version
 * of the app a member gets: index.html is served "no-cache" and brings
 * the new build on the next page load.
 */
const SW_VERSION = "2026-10-09-sessions";

self.addEventListener("install", (event) => {
  console.log(`[SW] Installing ${SW_VERSION}...`);
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
  console.log("[SW] 🔔 Push event received.");

  event.waitUntil(
    (async () => {
      let data = {};

      try {
        if (event.data) {
          data = event.data.json();
          console.log("[SW] Push payload:", data);
        }
      } catch (error) {
        console.warn(
          "[SW] Failed to parse push payload:",
          error
        );

        try {
          data = {
            body: event.data?.text() || "",
          };
        } catch {
          data = {};
        }
      }

      const title =
        data?.title ||
        "Orbit";

      const body =
        data?.body ||
        data?.message ||
        "You have a new notification.";

      /*
       * Use the same icon path that the backend sends.
       */
      const icon =
        data?.icon ||
        "/orbit-icon-192.png";

      const badge =
        data?.badge ||
        "/orbit-icon-192.png";

      const notificationData =
        data?.data &&
        typeof data.data === "object"
          ? data.data
          : {};

      const options = {
        body,
        icon,
        badge,

        data: notificationData,

        /*
         * Unique notification tag.
         * If backend provides notificationId,
         * notifications can be grouped/replaced correctly.
         */
        tag:
          notificationData?.notificationId
            ? `orbit-${notificationData.notificationId}`
            : `orbit-${Date.now()}`,

        /*
         * Show a new notification even if
         * another Orbit notification already exists.
         */
        renotify: true,

        /*
         * Keep browser notification behavior
         * normal. Windows/Brave controls display duration.
         */
        requireInteraction: false,
      };

      console.log(
        "[SW] Showing notification:",
        {
          title,
          body,
          icon,
          badge,
          data: notificationData,
        }
      );

      try {
        await self.registration.showNotification(
          title,
          options
        );

        console.log(
          "[SW] ✅ Notification displayed successfully."
        );
      } catch (error) {
        console.error(
          "[SW] ❌ showNotification() failed:",
          {
            name: error?.name,
            message: error?.message,
          },
          error
        );
      }
    })()
  );
});

/* =========================================================
   NOTIFICATION CLICK
   ========================================================= */

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    // Only ever open pages of this app.
    let url = "/";

    try {
      const target = new URL(
        event.notification?.data?.url || "/",
        self.location.origin,
      );

      if (target.origin === self.location.origin) {
        url = target.href;
      }
    } catch {
      url = "/";
    }

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