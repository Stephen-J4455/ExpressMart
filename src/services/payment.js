import { supabase, supabaseUrl, callEdgeFunction } from "../lib/supabase";

/**
 * Verify payment and create order via Supabase Edge Function
 * Simple implementation matching Chawp's pattern
 */
export async function verifyPaymentAndCreateOrder(reference, orderData) {
  try {
    console.log("🚀 Starting payment verification:", { reference, orderData });

    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error("❌ Session error:", sessionError);
      throw new Error("Authentication required");
    }

    console.log("✅ Session obtained");

    // Use callEdgeFunction (prefers supabase.functions.invoke) to verify payment
    console.log("📡 Invoking edge function: payment (verify)");
    const data = await callEdgeFunction("payment", {
      action: "verify-payment",
      reference,
      orderData,
    });

    console.log("📥 Edge function response:", data);

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
 * Get Paystack public key
 */
export function getPaystackPublicKey() {
  return "pk_test_7d6bef2c11764ac43547031baf2c197607286987";
}
