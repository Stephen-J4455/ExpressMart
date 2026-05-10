import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import { callEdgeFunction, supabase } from "../lib/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const appStateRef = useRef(AppState.currentState);
  const presenceChannelRef = useRef(null);
  const mountedRef = useRef(true);
  const authSyncVersionRef = useRef(0);
  const sessionRefreshInFlightRef = useRef(false);
  const skipAuthStateSyncRef = useRef(false);

  const withTimeout = useCallback(async (promise, timeoutMs, timeoutMessage) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const updateLastSeen = useCallback(async (userId) => {
    if (!supabase || !userId) return;

    try {
      await supabase
        .from("express_profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId);
    } catch (error) {
      console.warn("User last-seen update failed:", error);
    }
  }, []);

  const stopPresence = useCallback(
    async (userId, recordLastSeen = true) => {
      if (recordLastSeen) {
        await updateLastSeen(userId);
      }

      if (!presenceChannelRef.current) return;

      try {
        await presenceChannelRef.current.untrack();
      } catch (error) {
        console.warn("User presence untrack failed:", error);
      }

      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    },
    [updateLastSeen],
  );

  const startPresence = useCallback(
    async (userId) => {
      if (!supabase || !userId) return;

      const currentTopic = `presence:user:${userId}`;
      if (presenceChannelRef.current?.topic === currentTopic) return;

      await stopPresence(userId, false);

      const channel = supabase.channel(currentTopic, {
        config: { presence: { key: String(userId) } },
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track({
              actor_id: userId,
              actor_type: "user",
              app_state: "active",
              online_at: new Date().toISOString(),
            });
          } catch (error) {
            console.error("User presence track failed:", error);
          }
        }
      });

      presenceChannelRef.current = channel;
    },
    [stopPresence],
  );

  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null;

    try {
      const { data, error } = await supabase
        .from("express_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error(
          "Error fetching profile:",
          error.message || JSON.stringify(error),
        );
        return null;
      }
      return data;
    } catch (error) {
      console.error(
        "Profile fetch error:",
        error?.message || JSON.stringify(error),
      );
      return null;
    }
  }, []);

  const applySessionState = useCallback(
    async (nextSession, { fetchUserProfile = true } = {}) => {
      const version = ++authSyncVersionRef.current;

      if (!mountedRef.current) return;
      setSession(nextSession ?? null);

      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        return;
      }

      if (!fetchUserProfile) return;

      const profileData = await fetchProfile(nextUser.id);
      if (!mountedRef.current || version !== authSyncVersionRef.current) return;
      setProfile(profileData);
    },
    [fetchProfile],
  );

  const syncSessionFromStorage = useCallback(
    async ({ showLoader = false } = {}) => {
      if (!supabase || sessionRefreshInFlightRef.current) return;

      sessionRefreshInFlightRef.current = true;
      if (showLoader && mountedRef.current) {
        setLoading(true);
      }

      try {
        const {
          data: { session: nextSession },
          error,
        } = await withTimeout(
          supabase.auth.getSession(),
          12000,
          "Session fetch timeout",
        );

        if (error) throw error;
        await applySessionState(nextSession);
      } catch (error) {
        console.error("Error syncing session:", error?.message || error);
        await applySessionState(null, { fetchUserProfile: false });
      } finally {
        sessionRefreshInFlightRef.current = false;
        if (showLoader && mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applySessionState, withTimeout],
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    mountedRef.current = true;

    const isRecoveryOrResetUrl = (url) => {
      if (!url) return false;
      const normalized = String(url).toLowerCase();
      return (
        normalized.includes("reset-password") ||
        normalized.includes("type=recovery") ||
        normalized.includes("token_hash=") ||
        normalized.includes("token=")
      );
    };

    // Check if we're on a password reset URL - if so, don't auto-login.
    // Let PasswordResetScreen own the full reset flow.
    const shouldBypassAuthSync = async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        return isRecoveryOrResetUrl(window.location.href);
      }

      const initialUrl = await Linking.getInitialURL();
      return isRecoveryOrResetUrl(initialUrl);
    };

    // Get initial session without locking auth callbacks
    const bootstrapSession = async () => {
      try {
        const bypassAuthSync = await shouldBypassAuthSync();
        skipAuthStateSyncRef.current = bypassAuthSync;

        // Skip auto-login for recovery/reset deep links to prevent premature login
        if (bypassAuthSync) {
          console.log(
            "AuthContext: Detected password-reset recovery URL, skipping auto-login",
          );
          await applySessionState(null, { fetchUserProfile: false });
          setLoading(false);
          return;
        }

        await syncSessionFromStorage({ showLoader: true });
      } catch (error) {
        console.error("Error fetching initial session:", error.message);
        await applySessionState(null, { fetchUserProfile: false });
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    bootstrapSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (skipAuthStateSyncRef.current) {
        console.log(
          "AuthContext: Ignoring auth state change during password reset flow",
          event,
        );
        return;
      }

      console.log("Auth state changed:", event, nextSession?.user?.id);
      // Avoid async Supabase calls directly in callback to prevent auth deadlocks.
      setTimeout(() => {
        if (!mountedRef.current) return;
        void applySessionState(nextSession);
      }, 0);
    });

    return () => {
      mountedRef.current = false;
      try {
        subscription?.unsubscribe?.();
      } catch (error) {
        console.warn("Auth subscription cleanup failed:", error);
      }
    };
  }, [applySessionState, syncSessionFromStorage]);

  useEffect(() => {
    if (!supabase) return;

    const syncPresence = async (nextAppState = appStateRef.current) => {
      if (user?.id && nextAppState === "active") {
        await startPresence(user.id);
        return;
      }

      await stopPresence(user?.id);
    };

    syncPresence();

    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextAppState;

        if (
          (previousState === "background" || previousState === "inactive") &&
          nextAppState === "active"
        ) {
          await syncSessionFromStorage();
        }

        await syncPresence(nextAppState);
      },
    );

    const visibilityListener =
      Platform.OS === "web"
        ? async () => {
            if (document.visibilityState === "visible") {
              await syncSessionFromStorage();
            }
          }
        : null;

    if (visibilityListener && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", visibilityListener);
    }

    return () => {
      try {
        subscription?.remove?.();
      } catch (error) {
        console.warn("AppState subscription cleanup failed:", error);
      }
      if (visibilityListener && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityListener);
      }
      stopPresence(user?.id);
    };
  }, [user?.id, startPresence, stopPresence, syncSessionFromStorage]);

  const signUp = async (email, password, fullName) => {
    if (!supabase) {
      console.error("Supabase not configured");
      return { error: new Error("Supabase not configured") };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: "customer",
          },
        },
      });

      if (error) throw error;

      // Fallback: Ensure profile is created if trigger fails
      if (data.user) {
        try {
          // Wait a moment for trigger to execute
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Check if profile exists
          const { data: existingProfile } = await supabase
            .from("express_profiles")
            .select("id")
            .eq("id", data.user.id)
            .single();

          // If profile doesn't exist, create it manually
          if (!existingProfile) {
            await supabase.from("express_profiles").insert({
              id: data.user.id,
              email: data.user.email,
              full_name: fullName,
              role: "customer",
            });
          }
        } catch (profileError) {
          console.error("Profile creation fallback error:", profileError);
          // Don't fail signup if profile creation fails
        }
      }

      return { data, error: null };
    } catch (error) {
      console.error("Sign Up Error:", error.message);
      return { data: null, error };
    }
  };

  const signIn = async (email, password) => {
    if (!supabase) {
      console.error("Supabase not configured");
      return { error: new Error("Supabase not configured") };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Sign In Error:", error.message);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    try {
      await stopPresence(user?.id);
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setSession(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const deleteAccount = async (password) => {
    if (!supabase || !user?.id) {
      return { error: new Error("Not authenticated") };
    }
    if (!password) {
      return { error: new Error("Password is required") };
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (signInError) {
        throw new Error("Incorrect password");
      }

      await stopPresence(user.id);
      await callEdgeFunction("delete_account", { app: "customer" });
      setUser(null);
      setProfile(null);
      setSession(null);
      return { error: null };
    } catch (error) {
      console.error("Delete account error:", error);
      return {
        error:
          error instanceof Error
            ? error
            : new Error("Failed to delete account"),
      };
    }
  };

  // Use explicit native scheme so Supabase redirect URLs stay stable in email flows.
  const RESET_PAGE =
    Platform.OS === "web"
      ? new URL("/reset-password", window.location.origin).toString()
      : "expressmart://reset-password";

  const resetPassword = async (email) => {
    if (!supabase) {
      console.error("Supabase not configured");
      return { error: new Error("Supabase not configured") };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // include scheme query so the web page knows which app to deep link back to
        redirectTo: RESET_PAGE,
      });

      if (error) throw error;

      return { error: null };
    } catch (error) {
      console.error("Reset Password Error:", error.message);
      return { error };
    }
  };

  const updateProfile = async (updates) => {
    if (!supabase || !user) return { error: new Error("Not authenticated") };

    try {
      const { data, error } = await supabase
        .from("express_profiles")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { data, error: null };
    } catch (error) {
      console.error("Update Profile Error:", error.message);
      return { data: null, error };
    }
  };

  const updatePassword = async (newPassword) => {
    if (!supabase) return false;

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      await signOut();
      return true;
    } catch (error) {
      console.error("Update Password Error:", error.message);
      return false;
    }
  };

  const updateEmail = async (newEmail, password) => {
    if (!supabase || !user) return false;

    try {
      // First verify the current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      // Update the email
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error("Update Email Error:", error.message);
      return false;
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    isAuthenticated: !!user,
    signUp,
    signIn,
    signOut,
    deleteAccount,
    resetPassword,
    updateProfile,
    updatePassword,
    updateEmail,
    refreshProfile: () => fetchProfile(user?.id).then(setProfile),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
