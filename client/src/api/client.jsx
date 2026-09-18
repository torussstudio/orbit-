import axios from "axios";

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "./tokenStore";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "/api",

  timeout: 30000,

  /*
   * REQUIRED:
   * browser sends HttpOnly refresh cookie.
   */
  withCredentials: true,

  headers: {
    "X-Orbit-Client": "1",
  },
});

function emitToast(type, message) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("orbit:toast", { detail: { type, message } }));
  }
}

function mutationMessage(config) {
  const method = String(config?.method || "").toLowerCase();
  const path = String(config?.url || "");
  if (!["post", "put", "patch", "delete"].includes(method)) return null;
  if (/auth\/(login|refresh|logout)|notifications/.test(path)) return null;
  if (method === "delete") return "Deleted successfully";
  if (method === "post") return "Created successfully";
  return "Updated successfully";
}

/*
 * Attach access token to protected API requests.
 *
 * Refresh token is NEVER read by JavaScript.
 */
api.interceptors.request.use(
  (config) => {
    const token =
      getAccessToken();

    if (token) {
      config.headers =
        config.headers || {};

      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  },
);

let refreshPromise = null;

let isLoggingOut = false;

/*
 * Single-flight refresh.
 *
 * If 10 requests receive 401 simultaneously,
 * only ONE refresh request is sent.
 */
export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post(
        "/auth/refresh",
        null,
        {
          withCredentials: true,
        },
      )
      .then((response) => {
        const token =
          response.data?.accessToken;

        if (!token) {
          throw new Error(
            "Missing accessToken from refresh response",
          );
        }

        setAccessToken(
          token,
        );

        window.dispatchEvent(
          new Event(
            "orbit:auth-updated",
          ),
        );

        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function waitForRefresh() {
  if (refreshPromise) {
    await refreshPromise;
  }
}

export function setLogoutInProgress(
  value,
) {
  isLoggingOut =
    Boolean(value);
}

export function clearClientAuthState() {
  clearAccessToken();

  delete api.defaults.headers
    .common
    .Authorization;
}

api.interceptors.response.use(
  (response) => {
    const message = mutationMessage(response.config);
    if (message) {
      emitToast("success", message);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("orbit:notifications-updated"));
    }
    return response;
  },

  async (error) => {
    const status =
      error.response?.status;

    const originalRequest =
      error.config;

    if (
      !isLoggingOut &&
      status === 401 &&
      originalRequest &&
      !originalRequest._orbitRetry &&
      !String(
        originalRequest.url || "",
      ).includes(
        "/auth/refresh",
      ) &&
      !String(
        originalRequest.url || "",
      ).includes(
        "/auth/logout",
      ) &&
      !String(
        originalRequest.url || "",
      ).includes(
        "/auth/login",
      )
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

        return api.request(
          originalRequest,
        );
      } catch (refreshError) {
        /*
         * Refresh session is invalid.
         */
        if (
          refreshError.response
            ?.status === 401
        ) {
          clearClientAuthState();

          window.dispatchEvent(
            new Event(
              "orbit:logout",
            ),
          );
        }

        if (mutationMessage(originalRequest)) {
          emitToast("error", refreshError.response?.data?.error || refreshError.message || "Action failed");
        }

        return Promise.reject(
          refreshError,
        );
      }
    }

    if (mutationMessage(originalRequest)) {
      emitToast("error", error.response?.data?.error || error.message || "Action failed");
    }

    if (!error.response) {
      error.message =
        "Network error. Please check your connection.";

      return Promise.reject(
        error,
      );
    }

    if (
      error.code ===
      "ECONNABORTED"
    ) {
      error.message =
        "Request timeout. Please try again.";

      return Promise.reject(
        error,
      );
    }

    return Promise.reject(
      error,
    );
  },
);

export default api;