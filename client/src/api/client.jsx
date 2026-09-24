import axios from "axios";

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getStoredRefreshToken,
  setRefreshToken,
  getSessionId,
  clearSession,
} from "./tokenStore";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL || "/api",

  timeout: 30000,

  /*
   * IMPORTANT:
   *
   * Authentication no longer depends on
   * browser-wide HttpOnly cookies.
   */
  withCredentials: false,

  headers: {
    "X-Orbit-Client": "1",
  },
});

/*
 * ============================================================
 * TOAST
 * ============================================================
 */

function emitToast(type, message) {
  if (
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent("orbit:toast", {
        detail: {
          type,
          message,
        },
      }),
    );
  }
}

/*
 * ============================================================
 * MUTATION SUCCESS MESSAGE
 * ============================================================
 */

function mutationMessage(config) {
  const method = String(
    config?.method || "",
  ).toLowerCase();

  const path = String(
    config?.url || "",
  );

  if (
    ![
      "post",
      "put",
      "patch",
      "delete",
    ].includes(method)
  ) {
    return null;
  }

  if (
    /auth\/(login|refresh|logout|logout-all)|notifications/.test(
      path,
    )
  ) {
    return null;
  }

  if (method === "delete") {
    return "Deleted successfully";
  }

  if (method === "post") {
    return "Created successfully";
  }

  return "Updated successfully";
}

/*
 * ============================================================
 * REQUEST INTERCEPTOR
 * ============================================================
 *
 * Access token:
 *   memory only
 *
 * Session ID:
 *   sessionStorage
 *
 * Refresh token:
 *   sessionStorage
 *
 * Refresh token is ONLY sent explicitly to
 * /auth/refresh.
 */

api.interceptors.request.use(
  (config) => {
    const accessToken =
      getAccessToken();

    const sessionId =
      getSessionId();

    config.headers =
      config.headers || {};

    /*
     * Access token
     */
    if (accessToken) {
      config.headers.Authorization =
        `Bearer ${accessToken}`;
    }

    /*
     * Session ID
     *
     * Needed by refresh/logout.
     */
    if (sessionId) {
      config.headers[
        "X-Orbit-Session-Id"
      ] = sessionId;
    }

    /*
     * Required by backend
     * requireClientHeader middleware.
     */
    if (
      String(config.url || "").includes(
        "/auth/refresh",
      ) ||
      String(config.url || "").includes(
        "/auth/logout",
      )
    ) {
      config.headers[
        "X-Orbit-Client"
      ] = "1";
    }

    return config;
  },
  (error) =>
    Promise.reject(error),
);

/*
 * ============================================================
 * REFRESH STATE
 * ============================================================
 *
 * Single-flight refresh per browser tab.
 *
 * Multiple API requests in the same tab
 * receiving 401 simultaneously will share
 * one refresh request.
 *
 * Different tabs have separate JS contexts,
 * therefore separate refreshPromise values.
 * ============================================================
 */

let refreshPromise = null;

let isLoggingOut = false;

/*
 * ============================================================
 * REFRESH ACCESS TOKEN
 * ============================================================
 */

export function refreshAccessToken() {
  if (!refreshPromise) {
    const refreshToken =
      getStoredRefreshToken();

    const sessionId =
      getSessionId();

    if (
      !refreshToken ||
      !sessionId
    ) {
      return Promise.reject(
        new Error(
          "No active Orbit session",
        ),
      );
    }

    refreshPromise = api
      .post(
        "/auth/refresh",
        {
          refreshToken,
        },
        {
          headers: {
            "X-Orbit-Session-Id":
              sessionId,

            "X-Orbit-Client":
              "1",
          },
        },
      )
      .then((response) => {
        const newAccessToken =
          response.data?.accessToken;

        const newRefreshToken =
          response.data?.refreshToken;

        const returnedSessionId =
          response.data?.sessionId;

        if (!newAccessToken) {
          throw new Error(
            "Missing accessToken from refresh response",
          );
        }

        /*
         * Store new access token
         * only in memory.
         */
        setAccessToken(
          newAccessToken,
        );

        /*
         * Refresh token rotation.
         *
         * Backend generates a new
         * refresh token on every refresh.
         */
        if (newRefreshToken) {
          setRefreshToken(
            newRefreshToken,
          );
        }

        /*
         * Session ID should remain
         * unchanged during rotation.
         */
        if (
          returnedSessionId &&
          returnedSessionId !==
            sessionId
        ) {
          throw new Error(
            "Refresh session mismatch",
          );
        }

        if (
          typeof window !==
          "undefined"
        ) {
          window.dispatchEvent(
            new Event(
              "orbit:auth-updated",
            ),
          );
        }

        return newAccessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/*
 * ============================================================
 * WAIT FOR REFRESH
 * ============================================================
 */

export async function waitForRefresh() {
  if (refreshPromise) {
    await refreshPromise;
  }
}

/*
 * ============================================================
 * LOGOUT STATE
 * ============================================================
 */

export function setLogoutInProgress(
  value,
) {
  isLoggingOut =
    Boolean(value);
}

/*
 * ============================================================
 * CLEAR CURRENT TAB AUTH STATE
 * ============================================================
 */

export function clearClientAuthState() {
  clearAccessToken();

  if (
    api.defaults.headers.common
  ) {
    delete api.defaults.headers
      .common.Authorization;

    delete api.defaults.headers
      .common[
        "X-Orbit-Session-Id"
      ];
  }
}

/*
 * ============================================================
 * RESPONSE INTERCEPTOR
 * ============================================================
 */

api.interceptors.response.use(
  (response) => {
    const message =
      mutationMessage(
        response.config,
      );

    if (message) {
      emitToast(
        "success",
        message,
      );

      if (
        typeof window !==
        "undefined"
      ) {
        window.dispatchEvent(
          new Event(
            "orbit:notifications-updated",
          ),
        );
      }
    }

    return response;
  },

  async (error) => {
    const status =
      error.response?.status;

    const originalRequest =
      error.config;

    /*
     * ========================================================
     * 401 → REFRESH
     * ========================================================
     */

    if (
      !isLoggingOut &&
      status === 401 &&
      originalRequest &&
      !originalRequest._orbitRetry
    ) {
      const requestUrl =
        String(
          originalRequest.url || "",
        );

      /*
       * Never refresh these requests.
       */
      const isRefreshRequest =
        requestUrl.includes(
          "/auth/refresh",
        );

      const isLogoutRequest =
        requestUrl.includes(
          "/auth/logout",
        );

      const isLoginRequest =
        requestUrl.includes(
          "/auth/login",
        );

      if (
        !isRefreshRequest &&
        !isLogoutRequest &&
        !isLoginRequest
      ) {
        originalRequest._orbitRetry =
          true;

        try {
          const newToken =
            await refreshAccessToken();

          originalRequest.headers =
            originalRequest.headers ||
            {};

          originalRequest.headers.Authorization =
            `Bearer ${newToken}`;

          const currentSessionId =
            getSessionId();

          if (currentSessionId) {
            originalRequest.headers[
              "X-Orbit-Session-Id"
            ] = currentSessionId;
          }

          return api.request(
            originalRequest,
          );
        } catch (refreshError) {
          const refreshStatus =
            refreshError.response
              ?.status;

          /*
           * Only a real 401 session
           * failure should clear the
           * current tab session.
           */
          if (
            refreshStatus === 401 ||
            refreshError.message ===
              "No active Orbit session"
          ) {
            clearSession();

            clearClientAuthState();

            if (
              typeof window !==
              "undefined"
            ) {
              window.dispatchEvent(
                new Event(
                  "orbit:logout",
                ),
              );

              if (
                !window.location.pathname.includes(
                  "/login",
                )
              ) {
                window.location.href =
                  "/login";
              }
            }
          } else {
            /*
             * Network/server problem.
             *
             * Don't destroy the session.
             */
            console.error(
              "Orbit refresh failed:",
              refreshError.message,
            );
          }

          if (
            mutationMessage(
              originalRequest,
            )
          ) {
            emitToast(
              "error",
              refreshError.response
                ?.data?.error ||
                refreshError.message ||
                "Action failed",
            );
          }

          return Promise.reject(
            refreshError,
          );
        }
      }
    }

    /*
     * ========================================================
     * MUTATION ERROR
     * ========================================================
     */

    if (
      mutationMessage(
        originalRequest,
      )
    ) {
      emitToast(
        "error",
        error.response?.data
          ?.error ||
          error.message ||
          "Action failed",
      );
    }

    /*
     * ========================================================
     * NETWORK ERROR
     * ========================================================
     */

    if (!error.response) {
      error.message =
        "Network error. Please check your connection.";

      return Promise.reject(error);
    }

    /*
     * ========================================================
     * TIMEOUT
     * ========================================================
     */

    if (
      error.code ===
      "ECONNABORTED"
    ) {
      error.message =
        "Request timeout. Please try again.";

      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export default api;