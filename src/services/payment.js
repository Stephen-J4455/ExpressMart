<<<<<<< HEAD
import {
  supabase,
  callEdgeFunction,
} from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PAYSTACK_PUBLIC_KEY_CACHE_KEY = "expressmart.paystack.public_key";
let inMemoryPaystackPublicKey = null;
=======
import {
  supabase,
  supabaseUrl,
  callEdgeFunction,
  PAYSTACK_CONFIG,
} from "../lib/supabase";
>>>>>>> 1093fc65a75ec7311fb87f0777f113828da0f880

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
<<<<<<< HEAD
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
=======
 * Get Paystack public key
 */
export function getPaystackPublicKey() {
  return PAYSTACK_CONFIG.publicKey;
}
>>>>>>> 1093fc65a75ec7311fb87f0777f113828da0f880
