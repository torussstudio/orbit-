import {
  createContext,
  useContext,
  useState,
  useEffect,
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

  const [accessToken, setAccessTokenState] =
    useState(null);

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

  const clearClientSideAuth =
    () => {
      clearSession();

      clearClientAuthState();

      setAccessTokenState(null);

      setUser(null);

      setError(null);
    };

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
     * On every full page reload:
     *
     * memory access token is gone.
     *
     * Browser still has HttpOnly
     * refresh cookie.
     *
     * Therefore restore session through
     * /auth/refresh.
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
         * refresh response also contains user.
         *
         * refreshAccessToken() currently returns
         * only token, so get current user through /me.
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
         * No refresh cookie / expired session.
         *
         * This is normal when the user has
         * never logged in.
         */
        if (
          err.response?.status ===
          401
        ) {
          clearClientSideAuth();
        } else {
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

  const login = async (
  email,
  password,
) => {
  try {
    const { data } =
      await api.post(
        "/auth/login",
        {
          email,
          password,
        },
      );

    /*
     * Access token is returned by login
     * and stored only in memory.
     */
    if (data.accessToken) {
      setAccessToken(
        data.accessToken,
      );

      setAccessTokenState(
        data.accessToken,
      );
    }

    /*
     * Get complete user profile separately.
     */
    const {
      data: profile,
    } = await api.get(
      "/auth/me",
    );

    setUser(profile);

    setError(null);

    return profile;
  } catch (err) {
    const message =
      err.response?.data
        ?.error ||
      "Login failed";

    setError(message);

    throw err;
  }
};

  const logout = async () => {
    setLogoutInProgress(
      true,
    );

    try {
      /*
       * Wait for any active refresh request.
       */
      try {
        await waitForRefresh();
      } catch (_) {
        // Continue logout.
      }

      /*
       * Backend revokes refresh session
       * and clears HttpOnly cookie.
       */
      await api.post(
        "/auth/logout",
      );
    } catch (err) {
      console.error(
        "Logout request failed:",
        err.message,
      );
    } finally {
      clearClientSideAuth();

      setLogoutInProgress(
        false,
      );

      window.dispatchEvent(
        new Event(
          "orbit:logout",
        ),
      );
    }
  };

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