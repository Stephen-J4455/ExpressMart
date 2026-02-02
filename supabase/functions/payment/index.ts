import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecretKey) {
      throw new Error("Paystack secret key not configured");
    }

    const { reference, orderData } = await req.json();

    if (!reference) {
      throw new Error("Payment reference is required");
    }

    console.log("🎯 Verifying payment:", reference);

    // Verify payment with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      },
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || paystackData.status !== true) {
      throw new Error("Payment verification failed");
    }

    if (paystackData.data.status !== "success") {
      throw new Error(`Payment status is ${paystackData.data.status}`);
    }

    console.log("✅ Payment verified");

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Get user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Authentication required");
    }

    console.log("✅ User authenticated:", user.id);

    // Get user's cart
    const { data: cart, error: cartError } = await supabaseClient
      .from("express_carts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (cartError || !cart) {
      throw new Error("Cart not found");
    }

    console.log("✅ Cart found:", cart.id);

    // Get cart items
    const { data: cartItems, error: itemsError } = await supabaseClient
      .from("express_cart_items")
      .select(
        `
        *,
        product:express_products(*)
      `,
      )
      .eq("cart_id", cart.id);

    if (itemsError || !cartItems || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    console.log("✅ Found", cartItems.length, "cart items");

    // Calculate subtotal
    let subtotal = 0;
    cartItems.forEach((item: any) => {
      subtotal += item.quantity * item.product.price;
    });

    const { shippingAddress, shippingFee } = orderData;
    const total = subtotal + (shippingFee || 0);

    console.log("💰 Order totals:", { subtotal, shippingFee, total });

    // Create order
    const orderPayload = {
      user_id: user.id,
      vendor: "ExpressMart",
      status: "confirmed",
      subtotal,
      shipping_fee: shippingFee || 0,
      total,
      currency: "GHS",
      customer: {
        name: shippingAddress.full_name,
        email: user.email,
        phone: shippingAddress.phone,
      },
      shipping_address: shippingAddress,
      payment_method: "paystack",
      payment_status: "success",
      payment_reference: reference,
      paid_at: new Date().toISOString(),
    };

    const { data: order, error: orderError } = await supabaseClient
      .from("express_orders")
      .insert(orderPayload)
      .select()
      .single();

    if (orderError) {
      console.error("❌ Order creation error:", orderError);
      throw new Error(`Order creation failed: ${orderError.message}`);
    }

    console.log("✅ Order created:", order.order_number);

    // Create order items
    const orderItems = cartItems.map((item: any) => ({
      order_id: order.id,
      product_id: item.product.id,
      title: item.product.title,
      thumbnail: item.product.thumbnail || item.product.images?.[0],
      quantity: item.quantity,
      price: item.product.price,
      total: item.quantity * item.product.price,
      size: item.size,
      color: item.color,
    }));

    const { error: orderItemsError } = await supabaseClient
      .from("express_order_items")
      .insert(orderItems);

    if (orderItemsError) {
      console.error("❌ Order items error:", orderItemsError);
      // Rollback order
      await supabaseClient.from("express_orders").delete().eq("id", order.id);
      throw new Error(
        `Order items creation failed: ${orderItemsError.message}`,
      );
    }

    console.log("✅ Order items created");

    // Clear cart
    await supabaseClient
      .from("express_cart_items")
      .delete()
      .eq("cart_id", cart.id);

    console.log("✅ Cart cleared");

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          order,
          paymentInfo: paystackData.data,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("❌ Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
