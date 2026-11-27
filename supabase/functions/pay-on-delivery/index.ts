import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const checkoutErrors = new Set([
  "Invalid checkout reference",
  "Choose a valid delivery address",
  "Your cart is empty",
  "Invalid cart details",
  "Your cart changed. Refresh your cart and try again",
  "Pay on delivery is unavailable for one or more items in your cart",
  "One or more items no longer have enough stock",
  "This promo code is no longer available. Remove it or use another code",
  "This promo code does not apply to your current cart",
  "Pay-on-delivery order not found",
  "Only an unpaid order marked shipped can be completed",
]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);

  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return respond({ success: false, error: "Sign in required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return respond({ success: false, error: "Sign in required" }, 401);

    const client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await request.json().catch(() => null);
    if (body?.action === "confirm-collection") {
      if (!uuid.test(body.orderId || "")) return respond({ success: false, error: "Invalid order" }, 400);
      const { data, error } = await client.rpc("confirm_pay_on_delivery_order", {
        p_seller_user_id: user.id,
        p_order_id: body.orderId,
      });
      if (error) throw error;
      return respond({ success: true, data });
    }

    if (body?.action !== "place-order" || !uuid.test(body.addressId || "") ||
        typeof body.reference !== "string" || !/^cod_[A-Za-z0-9_-]{10,100}$/.test(body.reference) ||
        typeof body.expectedTotal !== "number" || !Number.isFinite(body.expectedTotal) || body.expectedTotal < 0 ||
        (body.couponId != null && !uuid.test(body.couponId)) ||
        !Array.isArray(body.items) || body.items.length > 200 ||
        body.items.some((item: Record<string, unknown> | null) =>
          !item || typeof item.product_id !== "string" || !uuid.test(item.product_id) ||
          typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) ||
          item.quantity < 1 || item.quantity > 2147483647 ||
          (item.size != null && typeof item.size !== "string") ||
          (item.color != null && typeof item.color !== "string"))) {
      return respond({ success: false, error: "Invalid checkout details" }, 400);
    }

    const { data, error } = await client.rpc("place_pay_on_delivery_order", {
      p_user_id: user.id,
      p_address_id: body.addressId,
      p_reference: body.reference,
      p_items: body.items,
      p_expected_total: body.expectedTotal,
      p_coupon_id: body.couponId ?? null,
    });
    if (error) throw error;

    if (!data.idempotent && data.orders?.length) {
      const notify = Promise.allSettled(data.orders.map(async (order: {
        id: string; seller_id: string; order_number: string; total: number;
      }) => {
        const { data: seller } = await client.from("express_sellers")
          .select("name,phone,social_whatsapp").eq("id", order.seller_id).maybeSingle();
        const phone = seller?.phone || seller?.social_whatsapp?.replace(/\D/g, "");
        if (!phone) return;
        const response = await fetch(`${url}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            order_id: order.id, seller_id: order.seller_id, order_number: order.order_number,
            amount: order.total, to_phone: phone, store_name: seller.name,
          }),
        });
        if (!response.ok) console.warn("Seller order notification failed", order.id, response.status);
      }));
      const runtime = (globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
      }).EdgeRuntime;
      if (runtime) runtime.waitUntil(notify);
      else await notify;
    }

    return respond({ success: true, data });
  } catch (error) {
    const message = (error as { message?: string })?.message || "";
    if (checkoutErrors.has(message)) return respond({ success: false, error: message }, 409);
    console.error("Pay on delivery error", error);
    return respond({ success: false, error: "Could not complete pay on delivery. Try again." }, 500);
  }
});
