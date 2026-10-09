// import axios from "axios";

// import {
//   getAccessToken,
//   setAccessToken,
//   clearAccessToken,
//   getStoredRefreshToken,
//   setRefreshToken,
//   getSessionId,
//   clearSession,
// } from "./tokenStore";

// const api = axios.create({
//   baseURL:
//     import.meta.env.VITE_API_URL || "/api",

//   timeout: 30000,

//   /*
//    * IMPORTANT:
//    *
//    * Authentication no longer depends on
//    * browser-wide HttpOnly cookies.
//    */
//   withCredentials: false,

//   headers: {
//     "X-Orbit-Client": "1",
//   },
// });

// /*
//  * ============================================================
//  * TOAST
//  * ============================================================
//  */

// function emitToast(type, message) {
//   if (
//     typeof window !== "undefined"
//   ) {
//     window.dispatchEvent(
//       new CustomEvent("orbit:toast", {
//         detail: {
//           type,
//           message,
//         },
//       }),
//     );
//   }
// }

// /*
//  * ============================================================
//  * MUTATION SUCCESS MESSAGE
//  * ============================================================
//  */

// function mutationMessage(config) {
//   const method = String(
//     config?.method || "",
//   ).toLowerCase();

//   const path = String(
//     config?.url || "",
//   );

//   if (
//     ![
//       "post",
//       "put",
//       "patch",
//       "delete",
//     ].includes(method)
//   ) {
//     return null;
//   }

//   if (
//     /auth\/(login|refresh|logout|logout-all)|notifications/.test(
//       path,
//     )
//   ) {
//     return null;
//   }

//   if (method === "delete") {
//     return "Deleted successfully";
//   }

//   if (method === "post") {
//     return "Created successfully";
//   }

//   return "Updated successfully";
// }

// /*
//  * ============================================================
//  * REQUEST INTERCEPTOR
//  * ============================================================
//  *
//  * Access token:
//  *   memory only
//  *
//  * Session ID:
//  *   sessionStorage
//  *
//  * Refresh token:
//  *   sessionStorage
//  *
//  * Refresh token is ONLY sent explicitly to
//  * /auth/refresh.
//  */

// api.interceptors.request.use(
//   (config) => {
//     const accessToken =
//       getAccessToken();

//     const sessionId =
//       getSessionId();

//     config.headers =
//       config.headers || {};

//     /*
//      * Access token
//      */
//     if (accessToken) {
//       config.headers.Authorization =
//         `Bearer ${accessToken}`;
//     }

//     /*
//      * Session ID
//      *
//      * Needed by refresh/logout.
//      */
//     if (sessionId) {
//       config.headers[
//         "X-Orbit-Session-Id"
//       ] = sessionId;
//     }

//     /*
//      * Required by backend
//      * requireClientHeader middleware.
//      */
//     if (
//       String(config.url || "").includes(
//         "/auth/refresh",
//       ) ||
//       String(config.url || "").includes(
//         "/auth/logout",
//       )
//     ) {
//       config.headers[
//         "X-Orbit-Client"
//       ] = "1";
//     }

//     return config;
//   },
//   (error) =>
//     Promise.reject(error),
// );

// /*
//  * ============================================================
//  * REFRESH STATE
//  * ============================================================
//  *
//  * Single-flight refresh per browser tab.
//  *
//  * Multiple API requests in the same tab
//  * receiving 401 simultaneously will share
//  * one refresh request.
//  *
//  * Different tabs have separate JS contexts,
//  * therefore separate refreshPromise values.
//  * ============================================================
//  */

// let refreshPromise = null;

// let isLoggingOut = false;

// /*
//  * ============================================================
//  * REFRESH ACCESS TOKEN
//  * ============================================================
//  */

// export function refreshAccessToken() {
//   if (!refreshPromise) {
//     const refreshToken =
//       getStoredRefreshToken();

//     const sessionId =
//       getSessionId();

//     if (
//       !refreshToken ||
//       !sessionId
//     ) {
//       return Promise.reject(
//         new Error(
//           "No active Orbit session",
//         ),
//       );
//     }

//     refreshPromise = api
//       .post(
//         "/auth/refresh",
//         {
//           refreshToken,
//         },
//         {
//           headers: {
//             "X-Orbit-Session-Id":
//               sessionId,

//             "X-Orbit-Client":
//               "1",
//           },
//         },
//       )
//       .then((response) => {
//         const newAccessToken =
//           response.data?.accessToken;

//         const newRefreshToken =
//           response.data?.refreshToken;

//         const returnedSessionId =
//           response.data?.sessionId;

//         if (!newAccessToken) {
//           throw new Error(
//             "Missing accessToken from refresh response",
//           );
//         }

//         /*
//          * Store new access token
//          * only in memory.
//          */
//         setAccessToken(
//           newAccessToken,
//         );

//         /*
//          * Refresh token rotation.
//          *
//          * Backend generates a new
//          * refresh token on every refresh.
//          */
//         if (newRefreshToken) {
//           setRefreshToken(
//             newRefreshToken,
//           );
//         }

//         /*
//          * Session ID should remain
//          * unchanged during rotation.
//          */
//         if (
//           returnedSessionId &&
//           returnedSessionId !==
//             sessionId
//         ) {
//           throw new Error(
//             "Refresh session mismatch",
//           );
//         }

//         if (
//           typeof window !==
//           "undefined"
//         ) {
//           window.dispatchEvent(
//             new Event(
//               "orbit:auth-updated",
//             ),
//           );
//         }

//         return newAccessToken;
//       })
//       .finally(() => {
//         refreshPromise = null;
//       });
//   }

//   return refreshPromise;
// }

// /*
//  * ============================================================
//  * WAIT FOR REFRESH
//  * ============================================================
//  */

// export async function waitForRefresh() {
//   if (refreshPromise) {
//     await refreshPromise;
//   }
// }

// /*
//  * ============================================================
//  * LOGOUT STATE
//  * ============================================================
//  */

// export function setLogoutInProgress(
//   value,
// ) {
//   isLoggingOut =
//     Boolean(value);
// }

// /*
//  * ============================================================
//  * CLEAR CURRENT TAB AUTH STATE
//  * ============================================================
//  */

// export function clearClientAuthState() {
//   clearAccessToken();

//   if (
//     api.defaults.headers.common
//   ) {
//     delete api.defaults.headers
//       .common.Authorization;

//     delete api.defaults.headers
//       .common[
//         "X-Orbit-Session-Id"
//       ];
//   }
// }

// /*
//  * ============================================================
//  * RESPONSE INTERCEPTOR
//  * ============================================================
//  */

// api.interceptors.response.use(
//   (response) => {
//     const message =
//       mutationMessage(
//         response.config,
//       );

//     if (message) {
//       emitToast(
//         "success",
//         message,
//       );

//       if (
//         typeof window !==
//         "undefined"
//       ) {
//         window.dispatchEvent(
//           new Event(
//             "orbit:notifications-updated",
//           ),
//         );
//       }
//     }

//     return response;
//   },

//   async (error) => {
//     const status =
//       error.response?.status;

//     const originalRequest =
//       error.config;

//     /*
//      * ========================================================
//      * 401 → REFRESH
//      * ========================================================
//      */

//     if (
//       !isLoggingOut &&
//       status === 401 &&
//       originalRequest &&
//       !originalRequest._orbitRetry
//     ) {
//       const requestUrl =
//         String(
//           originalRequest.url || "",
//         );

//       /*
//        * Never refresh these requests.
//        */
//       const isRefreshRequest =
//         requestUrl.includes(
//           "/auth/refresh",
//         );

//       const isLogoutRequest =
//         requestUrl.includes(
//           "/auth/logout",
//         );

//       const isLoginRequest =
//         requestUrl.includes(
//           "/auth/login",
//         );

//       if (
//         !isRefreshRequest &&
//         !isLogoutRequest &&
//         !isLoginRequest
//       ) {
//         originalRequest._orbitRetry =
//           true;

//         try {
//           const newToken =
//             await refreshAccessToken();

//           originalRequest.headers =
//             originalRequest.headers ||
//             {};

//           originalRequest.headers.Authorization =
//             `Bearer ${newToken}`;

//           const currentSessionId =
//             getSessionId();

//           if (currentSessionId) {
//             originalRequest.headers[
//               "X-Orbit-Session-Id"
//             ] = currentSessionId;
//           }

//           return api.request(
//             originalRequest,
//           );
//         } catch (refreshError) {
//           const refreshStatus =
//             refreshError.response
//               ?.status;

//           /*
//            * Only a real 401 session
//            * failure should clear the
//            * current tab session.
//            */
//           if (
//             refreshStatus === 401 ||
//             refreshError.message ===
//               "No active Orbit session"
//           ) {
//             clearSession();

//             clearClientAuthState();

//             if (
//               typeof window !==
//               "undefined"
//             ) {
//               window.dispatchEvent(
//                 new Event(
//                   "orbit:logout",
//                 ),
//               );

//               if (
//                 !window.location.pathname.includes(
//                   "/login",
//                 )
//               ) {
//                 window.location.href =
//                   "/login";
//               }
//             }
//           } else {
//             /*
//              * Network/server problem.
//              *
//              * Don't destroy the session.
//              */
//             console.error(
//               "Orbit refresh failed:",
//               refreshError.message,
//             );
//           }

//           if (
//             mutationMessage(
//               originalRequest,
//             )
//           ) {
//             emitToast(
//               "error",
//               refreshError.response
//                 ?.data?.error ||
//                 refreshError.message ||
//                 "Action failed",
//             );
//           }

//           return Promise.reject(
//             refreshError,
//           );
//         }
//       }
//     }

//     /*
//      * ========================================================
//      * MUTATION ERROR
//      * ========================================================
//      */

//     if (
//       mutationMessage(
//         originalRequest,
//       )
//     ) {
//       emitToast(
//         "error",
//         error.response?.data
//           ?.error ||
//           error.message ||
//           "Action failed",
//       );
//     }

//     /*
//      * ========================================================
//      * NETWORK ERROR
//      * ========================================================
//      */

//     if (!error.response) {
//       error.message =
//         "Network error. Please check your connection.";

//       return Promise.reject(error);
//     }

//     /*
//      * ========================================================
//      * TIMEOUT
//      * ========================================================
//      */

//     if (
//       error.code ===
//       "ECONNABORTED"
//     ) {
//       error.message =
//         "Request timeout. Please try again.";

//       return Promise.reject(error);
//     }

//     return Promise.reject(error);
//   },
// );

// /*
//  * ============================================================
//  * SHARED IN-FLIGHT GET
//  * ============================================================
//  *
//  * Two parts of the page often ask for the same list at the same
//  * moment (a sidebar badge and the page it belongs to). While a
//  * GET is still on its way, another GET with the same URL, params
//  * and access token joins it instead of being sent again.
//  *
//  * - Nothing is kept after the response arrives: this is not a
//  *   cache. The next call after that sends a new request.
//  * - Each caller keeps its own AbortSignal. Cancelling one caller
//  *   does not cancel the others; the request itself is cancelled
//  *   only when every caller has left.
//  * - A GET with any other option (custom headers, responseType,
//  *   ...) is sent on its own, as before.
//  * - Any POST / PUT / PATCH / DELETE ends the sharing (when it is
//  *   sent and again when it finishes), so a refetch after a save
//  *   never joins a request that started before the save.
//  * ============================================================
//  */

// const inFlightGets = new Map();

// const plainGet = api.get.bind(api);

// function forgetInFlightGets() {
//   inFlightGets.clear();
// }

// function paramsKey(params) {
//   if (params === undefined || params === null) return "";

//   try {
//     if (
//       typeof URLSearchParams !== "undefined" &&
//       params instanceof URLSearchParams
//     ) {
//       return params.toString();
//     }

//     return JSON.stringify(
//       Object.keys(params)
//         .sort()
//         .map((name) => [name, params[name]]),
//     );
//   } catch {
//     // Not comparable: do not share this request.
//     return null;
//   }
// }

// function canceledError() {
//   return new axios.CanceledError("canceled");
// }

// // Later callers get their own copy of the data, so one caller
// // changing its list can never affect another.
// function copyResponse(response) {
//   if (typeof structuredClone !== "function") return response;

//   try {
//     return {
//       ...response,
//       data: structuredClone(response.data),
//     };
//   } catch {
//     return response;
//   }
// }

// api.get = function sharedGet(url, config) {
//   const { signal, params, ...rest } = config || {};
//   const key = paramsKey(params);

//   if (Object.keys(rest).length > 0 || key === null) {
//     return plainGet(url, config);
//   }

//   if (signal?.aborted) {
//     return Promise.reject(canceledError());
//   }

//   const mapKey = `${getAccessToken() || ""} ${url} ${key}`;

//   let entry = inFlightGets.get(mapKey);
//   const isFirst = !entry;

//   if (!entry) {
//     const controller = new AbortController();

//     entry = { controller, callers: 0, done: false };

//     entry.promise = plainGet(url, {
//       params,
//       signal: controller.signal,
//     });

//     const finished = () => {
//       entry.done = true;

//       if (inFlightGets.get(mapKey) === entry) {
//         inFlightGets.delete(mapKey);
//       }
//     };

//     entry.promise.then(finished, finished);

//     inFlightGets.set(mapKey, entry);
//   }

//   const shared = entry;
//   shared.callers += 1;

//   return new Promise((resolve, reject) => {
//     let settled = false;

//     const onAbort = () => {
//       if (settled) return;
//       settled = true;

//       shared.callers -= 1;

//       // Nobody is waiting any more: cancel the real request.
//       if (shared.callers === 0 && !shared.done) {
//         if (inFlightGets.get(mapKey) === shared) {
//           inFlightGets.delete(mapKey);
//         }

//         shared.controller.abort();
//       }

//       reject(canceledError());
//     };

//     if (signal) {
//       signal.addEventListener("abort", onAbort, { once: true });
//     }

//     const finish = (settle, value) => {
//       if (settled) return;
//       settled = true;

//       if (signal) {
//         signal.removeEventListener("abort", onAbort);
//       }

//       settle(value);
//     };

//     shared.promise.then(
//       (response) =>
//         finish(
//           resolve,
//           isFirst ? response : copyResponse(response),
//         ),
//       (error) => finish(reject, error),
//     );
//   });
// };

// // Saves end the sharing: see the note above.
// function isWrite(config) {
//   return (
//     String(config?.method || "get").toLowerCase() !== "get"
//   );
// }

// api.interceptors.request.use((config) => {
//   if (isWrite(config)) {
//     forgetInFlightGets();
//   }

//   return config;
// });

// api.interceptors.response.use(
//   (response) => {
//     if (isWrite(response.config)) {
//       forgetInFlightGets();
//     }

//     return response;
//   },
//   (error) => {
//     if (isWrite(error.config)) {
//       forgetInFlightGets();
//     }

//     return Promise.reject(error);
//   },
// );

// export default api;


import axios from "axios";

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getStoredRefreshToken,
  setRefreshToken,
  getSessionId,
  clearSession,
  setLogoutNotice,
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

  /*
   * No toast for background saves: auth, notifications,
   * and user preferences (theme switch). The Active sessions
   * card (auth/sessions, auth/logout-others) shows its own
   * messages.
   */
  if (
    /auth\/(login|refresh|logout|logout-all|sessions)|notifications|preferences/.test(
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
      .catch((refreshError) => {
        /*
         * The server ended this session from
         * another device (signed out there, or
         * the password was changed there).
         *
         * Remember why, so the login screen can
         * say so. Normal expiry has no code and
         * leaves no notice. The error itself is
         * passed on unchanged: every caller
         * handles the 401 as before.
         */
        if (
          refreshError.response?.status ===
            401 &&
          refreshError.response?.data
            ?.code === "SESSION_REVOKED"
        ) {
          setLogoutNotice("revoked");
        }

        throw refreshError;
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

      /*
       * /auth/logout-others keeps this tab
       * signed in, so it is a normal request:
       * an expired access token is refreshed
       * and the call is tried again.
       */
      const isLogoutRequest =
        requestUrl.includes(
          "/auth/logout",
        ) &&
        !requestUrl.includes(
          "/auth/logout-others",
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

/*
 * ============================================================
 * SHARED IN-FLIGHT GET
 * ============================================================
 *
 * Two parts of the page often ask for the same list at the same
 * moment (a sidebar badge and the page it belongs to). While a
 * GET is still on its way, another GET with the same URL, params
 * and access token joins it instead of being sent again.
 *
 * - Nothing is kept after the response arrives: this is not a
 *   cache. The next call after that sends a new request.
 * - Each caller keeps its own AbortSignal. Cancelling one caller
 *   does not cancel the others; the request itself is cancelled
 *   only when every caller has left.
 * - A GET with any other option (custom headers, responseType,
 *   ...) is sent on its own, as before.
 * - Any POST / PUT / PATCH / DELETE ends the sharing (when it is
 *   sent and again when it finishes), so a refetch after a save
 *   never joins a request that started before the save.
 * ============================================================
 */

const inFlightGets = new Map();

const plainGet = api.get.bind(api);

function forgetInFlightGets() {
  inFlightGets.clear();
}

function paramsKey(params) {
  if (params === undefined || params === null) return "";

  try {
    if (
      typeof URLSearchParams !== "undefined" &&
      params instanceof URLSearchParams
    ) {
      return params.toString();
    }

    return JSON.stringify(
      Object.keys(params)
        .sort()
        .map((name) => [name, params[name]]),
    );
  } catch {
    // Not comparable: do not share this request.
    return null;
  }
}

function canceledError() {
  return new axios.CanceledError("canceled");
}

// Later callers get their own copy of the data, so one caller
// changing its list can never affect another.
function copyResponse(response) {
  if (typeof structuredClone !== "function") return response;

  try {
    return {
      ...response,
      data: structuredClone(response.data),
    };
  } catch {
    return response;
  }
}

api.get = function sharedGet(url, config) {
  const { signal, params, ...rest } = config || {};
  const key = paramsKey(params);

  if (Object.keys(rest).length > 0 || key === null) {
    return plainGet(url, config);
  }

  if (signal?.aborted) {
    return Promise.reject(canceledError());
  }

  const mapKey = `${getAccessToken() || ""} ${url} ${key}`;

  let entry = inFlightGets.get(mapKey);
  const isFirst = !entry;

  if (!entry) {
    const controller = new AbortController();

    entry = { controller, callers: 0, done: false };

    entry.promise = plainGet(url, {
      params,
      signal: controller.signal,
    });

    const finished = () => {
      entry.done = true;

      if (inFlightGets.get(mapKey) === entry) {
        inFlightGets.delete(mapKey);
      }
    };

    entry.promise.then(finished, finished);

    inFlightGets.set(mapKey, entry);
  }

  const shared = entry;
  shared.callers += 1;

  return new Promise((resolve, reject) => {
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;

      shared.callers -= 1;

      // Nobody is waiting any more: cancel the real request.
      if (shared.callers === 0 && !shared.done) {
        if (inFlightGets.get(mapKey) === shared) {
          inFlightGets.delete(mapKey);
        }

        shared.controller.abort();
      }

      reject(canceledError());
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const finish = (settle, value) => {
      if (settled) return;
      settled = true;

      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }

      settle(value);
    };

    shared.promise.then(
      (response) =>
        finish(
          resolve,
          isFirst ? response : copyResponse(response),
        ),
      (error) => finish(reject, error),
    );
  });
};

// Saves end the sharing: see the note above.
function isWrite(config) {
  return (
    String(config?.method || "get").toLowerCase() !== "get"
  );
}

api.interceptors.request.use((config) => {
  if (isWrite(config)) {
    forgetInFlightGets();
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (isWrite(response.config)) {
      forgetInFlightGets();
    }

    return response;
  },
  (error) => {
    if (isWrite(error.config)) {
      forgetInFlightGets();
    }

    return Promise.reject(error);
  },
);

export default api;