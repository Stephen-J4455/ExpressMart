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

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Check if we're on a password reset URL - if so, don't auto-login
    // Let PasswordResetScreen handle the reset flow
    const isResetPasswordUrl = () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        return window.location.pathname.includes("reset-password") ||
               window.location.hash.includes("type=recovery") ||
               window.location.search.includes("type=recovery");
      }
      return false;
    };

    // Get initial session with timeout to prevent hanging
    const getSessionWithTimeout = async () => {
      try {
        // Skip auto-login if on reset-password URL to prevent premature login
        if (isResetPasswordUrl()) {
          console.log("AuthContext: Detected reset-password URL, skipping auto-login");
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Session fetch timeout")), 10000)
        );
        const sessionPromise = supabase.auth.getSession();
        
        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise,
        ]);
        
        if (error) throw error;
        
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        }
      } catch (error) {
        console.error("Error fetching initial session:", error.message);
        // Clear any stale session data
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    getSessionWithTimeout();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.id);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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
        appStateRef.current = nextAppState;
        await syncPresence(nextAppState);
      },
    );

    return () => {
      subscription.remove();
      stopPresence(user?.id);
    };
  }, [user?.id, startPresence, stopPresence]);

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

  // reset page is deployed on GitHub Pages. the password-reset.html file
  // lives in the root of the main branch of the `express-password-reset`
  // repository.
  const RESET_PAGE =
    Platform.OS === "web"
      ? new URL("/reset-password", window.location.origin).toString()
      : Linking.createURL("reset-password");

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
