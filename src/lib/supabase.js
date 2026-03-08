import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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
          // Use AsyncStorage only on native — on web let supabase default to
          // localStorage so the session is actually persisted and returned by
          // getSession(), preventing the 401 "Missing authorization header".
          ...(Platform.OS !== "web" && {
            storage: AsyncStorage,
          }),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
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

  // ── Path 1: use supabase.functions.invoke (handles auth automatically) ──
  if (supabase.functions && typeof supabase.functions.invoke === "function") {
    try {
      console.log("🔁 Using supabase.functions.invoke for:", functionName);
      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
      });

      if (error) {
        // Propagate only real errors; let network/timeout errors fall through
        // to the manual fetch path below.
        const msg = typeof error === "string" ? error : (error?.message ?? "");
        if (
          !msg.toLowerCase().includes("timeout") &&
          !msg.toLowerCase().includes("network") &&
          !msg.toLowerCase().includes("abort") &&
          !msg.toLowerCase().includes("fetch")
        ) {
          console.error("supabase.functions.invoke returned error:", error);
          throw error;
        }
        console.warn(
          "supabase.functions.invoke transient error, falling back:",
          error,
        );
      } else {
        console.log("✅ supabase.functions.invoke succeeded");
        return data;
      }
    } catch (invokeErr) {
      console.warn(
        "supabase.functions.invoke threw, falling back to fetch:",
        invokeErr,
      );
    }
  }

  // ── Path 2: manual fetch fallback ────────────────────────────────────────
  // Use getSession() — the supabase-js client handles token refresh internally
  // without a network round-trip. Calling refreshSession() is unnecessary and
  // causes timeouts on slow connections (especially for multi-seller orders).
  console.log("🔄 Getting current session for manual fetch...");
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    console.error("❌ No valid session:", { sessionError });
    throw new Error("Authentication session expired. Please log in again.");
  }

  console.log(
    "✅ Session token obtained (first 20 chars):",
    session.access_token.substring(0, 20) + "...",
  );

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  console.log("🌐 Making request to:", url);

  // 45-second timeout — multi-seller orders involve several sequential
  // Paystack API calls + one order record per seller.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
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
    clearTimeout(timeoutId);
    if (fetchError.name === "AbortError") {
      console.error("❌ Edge function fetch timed out after 45s");
      throw new Error(
        "Payment request timed out. Please check your order status before retrying.",
      );
    }
    console.error("❌ Fetch error:", fetchError);
    throw fetchError;
  }
};
