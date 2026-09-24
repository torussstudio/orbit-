import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api, {
  clearClientAuthState,
  refreshAccessToken,
  setLogoutInProgress,
  waitForRefresh,
} from "../api/client";

import {
  setAccessToken,
  clearSession,
  getAccessToken,
  getStoredRefreshToken,
  getSessionId,
  setRefreshToken,
  setSessionId,
} from "../api/tokenStore";

const AuthContext =
  createContext(null);

export function AuthProvider({
  children,
}) {
  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [
    accessToken,
    setAccessTokenState,
  ] = useState(null);

  /*
   * ==========================================================
   * UPDATE USER
   * ==========================================================
   */

  const updateUser = (
    updatedData,
  ) => {
    setUser((previous) =>
      previous
        ? {
            ...previous,
            ...updatedData,
          }
        : updatedData,
    );
  };

  /*
   * ==========================================================
   * CLEAR CURRENT TAB AUTH
   * ==========================================================
   *
   * IMPORTANT:
   *
   * This clears ONLY this browser tab.
   *
   * It does not touch another tab's
   * sessionStorage.
   */

  const clearClientSideAuth =
    () => {
      clearSession();

      clearClientAuthState();

      setAccessTokenState(null);

      setUser(null);

      setError(null);
    };

  /*
   * ==========================================================
   * INITIAL AUTH RESTORE
   * ==========================================================
   *
   * On page reload:
   *
   * accessToken -> gone because memory
   *
   * sessionStorage:
   *   sessionId
   *   refreshToken
   *       ↓
   * /auth/refresh
   *       ↓
   * new accessToken
   *
   * This works independently in every tab.
   */

  useEffect(() => {
    let mounted = true;

    const onLogout = () => {
      if (!mounted) return;

      clearClientSideAuth();
    };

    const onAuthUpdated = () => {
      if (!mounted) return;

      setAccessTokenState(
        getAccessToken(),
      );
    };

    window.addEventListener(
      "orbit:logout",
      onLogout,
    );

    window.addEventListener(
      "orbit:auth-updated",
      onAuthUpdated,
    );

    /*
     * Check whether THIS TAB has
     * an existing session.
     *
     * If there is no sessionStorage
     * auth state, don't call refresh.
     */
    const storedRefreshToken =
      getStoredRefreshToken();

    const storedSessionId =
      getSessionId();

    if (
      !storedRefreshToken ||
      !storedSessionId
    ) {
      if (mounted) {
        setLoading(false);
      }

      return () => {
        mounted = false;

        window.removeEventListener(
          "orbit:logout",
          onLogout,
        );

        window.removeEventListener(
          "orbit:auth-updated",
          onAuthUpdated,
        );
      };
    }

    /*
     * Restore THIS TAB's session.
     */
    refreshAccessToken()
      .then(async (token) => {
        if (!mounted) return;

        if (token) {
          setAccessToken(
            token,
          );

          setAccessTokenState(
            token,
          );
        }

        /*
         * Access token is restored.
         *
         * Now get the current user's
         * profile.
         */
        try {
          const {
            data,
          } = await api.get(
            "/auth/me",
          );

          if (mounted) {
            setUser(data);

            setError(null);
          }
        } catch (meError) {
          if (
            meError.response
              ?.status === 401
          ) {
            clearClientSideAuth();
          } else if (mounted) {
            setError(
              meError.message,
            );
          }
        }
      })
      .catch((err) => {
        if (!mounted) return;

        /*
         * 401 means this tab's refresh
         * session is no longer valid.
         */
        if (
          err.response?.status ===
            401 ||
          err.message ===
            "No active Orbit session"
        ) {
          clearClientSideAuth();
        } else {
          /*
           * Network/server error.
           *
           * Don't unnecessarily destroy
           * the stored session.
           */
          setError(
            err.message ||
              "Authentication initialization failed",
          );
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;

      window.removeEventListener(
        "orbit:logout",
        onLogout,
      );

      window.removeEventListener(
        "orbit:auth-updated",
        onAuthUpdated,
      );
    };
  }, []);

  /*
   * ==========================================================
   * LOGIN
   * ==========================================================
   */

  const login = async (
    email,
    password,
  ) => {
    try {
      const {
        data,
      } = await api.post(
        "/auth/login",
        {
          email,
          password,
        },
      );

      /*
       * Backend must return:
       *
       * accessToken
       * refreshToken
       * sessionId
       * user
       */

      if (
        !data.accessToken ||
        !data.refreshToken ||
        !data.sessionId
      ) {
        throw new Error(
          "Invalid authentication response",
        );
      }

      /*
       * Store access token ONLY
       * in memory.
       */
      setAccessToken(
        data.accessToken,
      );

      setAccessTokenState(
        data.accessToken,
      );

      /*
       * Store refresh token ONLY
       * in this tab's sessionStorage.
       */
      setRefreshToken(
        data.refreshToken,
      );

      /*
       * Store session ID ONLY
       * in this tab's sessionStorage.
       */
      setSessionId(
        data.sessionId,
      );

      /*
       * Backend already returned the
       * user, so use it immediately.
       */
      if (data.user) {
        setUser(data.user);
      } else {
        /*
         * Fallback for backend responses
         * without user.
         */
        const {
          data: profile,
        } = await api.get(
          "/auth/me",
        );

        setUser(profile);
      }

      setError(null);

      return data.user;
    } catch (err) {
      const message =
        err.response?.data
          ?.error ||
        err.message ||
        "Login failed";

      setError(message);

      throw err;
    }
  };

  /*
   * ==========================================================
   * LOGOUT CURRENT SESSION
   * ==========================================================
   *
   * IMPORTANT:
   *
   * Only the current tab/session is
   * revoked.
   *
   * Other tabs/users are untouched.
   */

  const logout = async () => {
    setLogoutInProgress(
      true,
    );

    try {
      /*
       * Wait for any refresh currently
       * running in this tab.
       */
      try {
        await waitForRefresh();
      } catch (_) {
        // Continue logout.
      }

      const refreshToken =
        getStoredRefreshToken();

      const sessionId =
        getSessionId();

      /*
       * Only send logout request when
       * this tab actually has a session.
       */
      if (
        refreshToken &&
        sessionId
      ) {
        await api.post(
          "/auth/logout",
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
        );
      }
    } catch (err) {
      /*
       * Even if the server request fails,
       * clear the local session for this tab.
       */
      console.error(
        "Logout request failed:",
        err.message,
      );
    } finally {
      clearClientSideAuth();

      setLogoutInProgress(
        false,
      );

      /*
       * This event is LOCAL to this
       * browser tab.
       *
       * It does not use localStorage
       * or BroadcastChannel.
       */
      window.dispatchEvent(
        new Event(
          "orbit:logout",
        ),
      );
    }
  };

  /*
   * ==========================================================
   * CONTEXT
   * ==========================================================
   */

  return (
    <AuthContext.Provider
      value={{
        user,

        updateUser,

        accessToken,

        login,

        logout,

        loading,

        error,

        isManager:
          user?.role ===
          "manager",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth =
  () =>
    useContext(
      AuthContext,
    );