// useUserProfile — fetches the current user's algorithmic profile.
// Best-effort: returns null when the user is anonymous, the profile
// doesn't exist yet, or the query fails. The TagAI assistant uses this
// to surface personalization context (price band, preferred tags, etc.)
// in its replies.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export const useUserProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("express_user_algorithmic_profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("[useUserProfile] profile query failed:", error.message);
        setProfile(null);
      } else {
        setProfile(data || null);
      }
    } catch (e) {
      console.warn("[useUserProfile] failed:", e);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, refetch: fetchProfile };
};
