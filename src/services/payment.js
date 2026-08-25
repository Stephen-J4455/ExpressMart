import {
  supabase,
  callEdgeFunction,
} from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PAYSTACK_PUBLIC_KEY_CACHE_KEY = "expressmart.paystack.public_key";
let inMemoryPaystackPublicKey = null;

/**
 * Verify payment and create order via Supabase Edge Function
 * Simple implementation matching Chawp's pattern
 */
export async function verifyPaymentAndCreateOrder(reference, orderData) {
  try {
    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error("❌ Session error:", sessionError);
      throw new Error("Authentication required");
    }

    // Use callEdgeFunction (prefers supabase.functions.invoke) to verify payment
    const data = await callEdgeFunction("payment", {
      action: "verify-payment",
      reference,
      orderData,
    });

    if (!data || !data.success) {
      throw new Error(data?.error || "Payment verification failed");
    }

    return data;
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    throw error;
  }
}

/**
 * Generate a unique payment reference
 */
export function generatePaymentReference(userId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `express_${userId}_${timestamp}_${random}`;
}

/**
 * Get Paystack public key from edge function (cached locally for offline fallback)
 */
export async function getPaystackPublicKey() {
  if (inMemoryPaystackPublicKey) return inMemoryPaystackPublicKey;

  try {
    const data = await callEdgeFunction("payment", {
      action: "get-public-config",
    });
    const remoteKey = data?.data?.paystack_public_key;
    if (!remoteKey) {
      throw new Error("Missing paystack_public_key from payment config");
    }

    inMemoryPaystackPublicKey = remoteKey;
    await AsyncStorage.setItem(PAYSTACK_PUBLIC_KEY_CACHE_KEY, remoteKey);
    return remoteKey;
  } catch (error) {
    const cached = await AsyncStorage.getItem(PAYSTACK_PUBLIC_KEY_CACHE_KEY);
    if (cached) {
      inMemoryPaystackPublicKey = cached;
      return cached;
    }
    throw error;
  }
}

/**
 * Background auto-sync for Paystack verification.
 *
 * If the signed-in seller has a Paystack subaccount and Paystack reports it
 * verified (active === true — the server enforces this strictly), pull that
 * state into express_sellers so the rest of the app sees it without the
 * seller having to open the Payments page and press Sync.
 *
 * Fire-and-forget: never throws, all failures are logged only. The server
 * side (sync_subaccount_status) is the source of truth, so this can safely
 * run repeatedly / on every app load.
 */
export async function syncPaystackVerification() {
  try {
    if (!supabase) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data: seller } = await supabase
      .from("express_sellers")
      .select("id, payment_account, account_verified")
      .eq("user_id", user.id)
      .maybeSingle();

    // Nothing to sync: no store, no subaccount, or DB already verified.
    if (!seller?.payment_account || seller.account_verified) return;

    const resp = await callEdgeFunction("create_subaccount", {
      action: "sync_subaccount_status",
      seller_id: seller.id,
      subaccount_code: seller.payment_account,
    });

    console.log("🔄 Paystack verification background sync:", {
      seller_id: seller.id,
      account_verified: resp?.data?.account_verified,
      paystack_active: resp?.data?.paystack_active,
      updated: resp?.data?.updated,
    });
  } catch (err) {
    console.warn(
      "Paystack verification background sync skipped:",
      err?.message || err,
    );
  }
}
