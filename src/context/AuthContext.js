import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) return null;

    try {
      const { data, error } = await supabase
        .from("express_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching profile:", error);
        return null;
      }
      return data;
    } catch (error) {
      console.error("Profile fetch error:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event);
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

  const signUp = async (email, password, fullName) => {
    if (!supabase) {
      Alert.alert("Error", "Supabase not configured");
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

      Alert.alert(
        "Success",
        "Account created! Please check your email to verify your account."
      );
      return { data, error: null };
    } catch (error) {
      Alert.alert("Sign Up Error", error.message);
      return { data: null, error };
    }
  };

  const signIn = async (email, password) => {
    if (!supabase) {
      Alert.alert("Error", "Supabase not configured");
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
      Alert.alert("Sign In Error", error.message);
      return { data: null, error };
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setSession(null);
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const resetPassword = async (email) => {
    if (!supabase) {
      Alert.alert("Error", "Supabase not configured");
      return { error: new Error("Supabase not configured") };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "expressmart://reset-password",
      });

      if (error) throw error;

      Alert.alert("Success", "Password reset email sent!");
      return { error: null };
    } catch (error) {
      Alert.alert("Error", error.message);
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
      Alert.alert("Error", error.message);
      return { data: null, error };
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
    resetPassword,
    updateProfile,
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
