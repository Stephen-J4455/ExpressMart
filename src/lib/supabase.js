import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://meiljgoztnhnyvtfkzuh.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1laWxqZ296dG5obnl2dGZrenVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTI0OTksImV4cCI6MjA4MDY4ODQ5OX0.X7zve3MSvaoplAHl45BpC57h9G4IY5suhBBteIoEU3I";

// Paystack configuration
export const PAYSTACK_CONFIG = {
  publicKey: "pk_test_7d6bef2c11764ac43547031baf2c197607286987", // Your Paystack public key
};

export { supabaseUrl, supabaseAnonKey };

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      })
    : null;

// Edge function URLs
export const EDGE_FUNCTIONS = {
  payment: `${supabaseUrl}/functions/v1/payment`,
};

console.log("🔧 Supabase URL:", supabaseUrl);
console.log("🔧 Edge Function URL:", `${supabaseUrl}/functions/v1/payment`);

// Helper to call edge functions
export const callEdgeFunction = async (functionName, body) => {
  console.log("🔄 callEdgeFunction called:", { functionName, body });

  if (!supabase) {
    console.error("❌ Supabase not configured");
    throw new Error("Supabase not configured");
  }

  // Refresh session to ensure token is valid
  console.log("🔄 Refreshing session...");
  const {
    data: { session },
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (refreshError) {
    console.error("❌ Session refresh error:", refreshError);
    // If refresh fails, try to get current session
    console.log("🔄 Trying to get current session...");
    const {
      data: { session: currentSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !currentSession?.access_token) {
      console.error("❌ No valid session:", {
        sessionError,
        hasToken: !!currentSession?.access_token,
      });
      throw new Error("Authentication session expired. Please log in again.");
    }

    // Use current session if refresh failed but we have a valid session
    const token = currentSession.access_token;
    console.log(
      "✅ Using current session token (first 20 chars):",
      token.substring(0, 20) + "...",
    );

    const url = `${supabaseUrl}/functions/v1/${functionName}`;
    console.log("🌐 Making request to:", url);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(body),
      });

      console.log("📡 Response status:", response.status);
      const result = await response.json();
      console.log("📦 Response data:", result);

      if (!response.ok) {
        console.error("❌ Edge function error:", response.status, result);
        throw new Error(
          result.error || `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      console.log("✅ Edge function call successful");
      return result;
    } catch (fetchError) {
      console.error("❌ Fetch error:", fetchError);
      throw fetchError;
    }
  }

  const token = session?.access_token;

  if (!token) {
    console.error("❌ No access token available after refresh");
    throw new Error("No authentication token available. Please log in again.");
  }

  console.log(
    "✅ Using refreshed token (first 20 chars):",
    token.substring(0, 20) + "...",
  );

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  console.log("🌐 Making request to:", url);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });

    console.log("📡 Response status:", response.status);
    const result = await response.json();
    console.log("📦 Response data:", result);

    if (!response.ok) {
      console.error("❌ Edge function error:", response.status, result);
      throw new Error(
        result.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    console.log("✅ Edge function call successful");
    return result;
  } catch (fetchError) {
    console.error("❌ Fetch error:", fetchError);
    throw fetchError;
  }
};
