import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const supabaseUrl = "https://meiljgoztnhnyvtfkzuh.supabase.co";
export const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1laWxqZ296dG5obnl2dGZrenVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTI0OTksImV4cCI6MjA4MDY4ODQ5OX0.X7zve3MSvaoplAHl45BpC57h9G4IY5suhBBteIoEU3I";

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
          // Handle auth recovery and OAuth callbacks explicitly in the app so
          // reset-password links keep their parameters until the reset screen
          // consumes them.
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
  create_seller: `${supabaseUrl}/functions/v1/create_seller`,
};

// Helper to call edge functions
// Active edge function abort controllers — keyed by function name so a
// caller can cancel an in-flight request (e.g. user taps "Stop" on the AI).
export const activeAbortControllers = new Map();

// Helper to call edge functions
export const callEdgeFunction = async (functionName, body, { signal } = {}) => {
  if (!supabase) {
    console.error("❌ Supabase not configured");
    throw new Error("Supabase not configured");
  }

  // Register an abort controller so the caller can cancel this request.
  const controller = new AbortController();
  const effectiveSignal = signal || controller.signal;
  activeAbortControllers.set(functionName, controller);

  try {
    // ── Path 1: use supabase.functions.invoke (handles auth automatically) ──
    if (supabase.functions && typeof supabase.functions.invoke === "function") {
      try {
        const { data, error } = await supabase.functions.invoke(functionName, {
          body,
          signal: effectiveSignal,
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
            let detail = msg || "Edge function returned an error";
            try {
              const response = error?.context;
              if (response && typeof response.clone === "function") {
                const payload = await response.clone().json();
                detail = payload?.error || payload?.message || detail;
              }
            } catch {
              // Keep the SDK message when the error response is not JSON.
            }
            const enrichedError = new Error(
              `${functionName} failed: ${detail}`,
            );
            enrichedError.name = error?.name || "FunctionsHttpError";
            enrichedError.isNonTransientEdgeError = true;
            console.error("supabase.functions.invoke returned error:", detail);
            throw enrichedError;
          }
        } else {
          return data;
        }
      } catch (invokeErr) {
        if (invokeErr?.isNonTransientEdgeError) throw invokeErr;
        console.warn(
          "supabase.functions.invoke threw, falling back to fetch:",
          invokeErr,
        );
      }
    }

    // ── Path 2: manual fetch fallback ────────────────────────────────────────
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Authentication session expired. Please log in again.");
    }

    const url = `${supabaseUrl}/functions/v1/${functionName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify(body),
      signal: effectiveSignal,
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Edge function error:", response.status, result);
      throw new Error(
        result.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    }
    return result;
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      console.error("❌ Edge function request was cancelled");
      throw new Error("Request cancelled");
    }
    throw fetchError;
  } finally {
    activeAbortControllers.delete(functionName);
  }
};

/** Cancel an in-flight edge function request by name. */
export const cancelEdgeFunction = (functionName) => {
  const controller = activeAbortControllers.get(functionName);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(functionName);
    return true;
  }
  return false;
};

/** Cancel all in-flight edge function requests. */
export const cancelAllEdgeFunctions = () => {
  let cancelled = 0;
  for (const [name, controller] of activeAbortControllers.entries()) {
    controller.abort();
    activeAbortControllers.delete(name);
    cancelled += 1;
  }
  return cancelled;
};

