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

    const body = await req.json();
    const action = body?.action ?? null;
    console.log("payment function invoked", {
      action,
      reference: body?.reference ?? null,
      amount: body?.amount ?? null,
    });

    // Initialize payment (create Paystack transaction with subaccount splits)
    if (action === "initialize-payment") {
      const { amount, reference, orderData } = body || {};
      if (!amount || !reference)
        throw new Error("amount and reference are required");

      // Build a supabase client to inspect cart & sellers
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: {
            headers: { Authorization: req.headers.get("Authorization") ?? "" },
          },
        },
      );

      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Authentication required");

      // Find cart and items
      const { data: cart } = await supabaseClient
        .from("express_carts")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!cart) throw new Error("Cart not found");

      const { data: cartItems } = await supabaseClient
        .from("express_cart_items")
        .select(`*, product:express_products(*)`)
        .eq("cart_id", cart.id);

      if (!cartItems || cartItems.length === 0)
        throw new Error("Cart is empty");

      // Fetch global service_fee_percentage from express_settings
      let serviceFeePercentage = 0;
      try {
        const { data: settingsData } = await supabaseClient
          .from("express_settings")
          .select("value")
          .eq("key", "service_fee_percentage")
          .maybeSingle();
        if (settingsData?.value) {
          serviceFeePercentage = parseFloat(settingsData.value) || 0;
        }
      } catch (settingsErr) {
        console.warn("Failed to fetch service_fee_percentage:", settingsErr);
      }
      console.log(
        "📊 Service fee percentage from settings:",
        serviceFeePercentage,
      );

      // Group by seller and compute totals (including per-product shipping fees)
      const groups: Record<
        string,
        { subtotal: number; shippingFee: number; serviceFee: number }
      > = {};
      let subtotal = 0;
      let totalShippingFee = 0;
      cartItems.forEach((item: any) => {
        const sid = item.product?.seller_id ?? null;
        const unit = item.price ?? item.product?.price ?? 0;
        const itemShipping =
          parseFloat(item.product?.shipping_fee || 0) * item.quantity;
        if (!groups[sid])
          groups[sid] = { subtotal: 0, shippingFee: 0, serviceFee: 0 };
        groups[sid].subtotal += unit * item.quantity;
        groups[sid].shippingFee += itemShipping;
        subtotal += unit * item.quantity;
        totalShippingFee += itemShipping;
      });

      // Compute per-seller service fee (% of that seller's product subtotal)
      // Service fee is deducted from the seller's subaccount share — NOT added to customer total
      let totalServiceFee = 0;
      Object.values(groups).forEach((g) => {
        g.serviceFee =
          serviceFeePercentage > 0
            ? Math.round(((g.subtotal * serviceFeePercentage) / 100) * 100) /
              100
            : 0;
        totalServiceFee += g.serviceFee;
      });

      // Customer pays: product subtotal + shipping ONLY (service fee is internal)
      const customerTotal = subtotal + totalShippingFee;

      console.log("💰 Fee breakdown:", {
        subtotal,
        totalShippingFee,
        totalServiceFee,
        serviceFeePercentage,
        customerPays: customerTotal,
        note: "Service fee deducted from seller shares, not added to customer total",
      });

      const sellerIds = Object.keys(groups);

      // Fetch all sellers in parallel (one DB round-trip instead of N sequential)
      let paystackSubaccounts: any[] = [];
      const subaccounts: any[] = [];
      const missingSubaccountSellers: string[] = [];

      const validSellerIds = sellerIds.filter((s) => s && s !== "null");
      const sellerResults = await Promise.all(
        validSellerIds.map((sid) =>
          supabaseClient
            .from("express_sellers")
            .select("id,name,email,payment_account,commission_rate")
            .eq("id", sid)
            .maybeSingle()
            .then(({ data }) => ({ sid, seller: data })),
        ),
      );

      // Sellers that already have a payment_account can be used immediately.
      // Sellers missing a subaccount still need a sequential create_subaccount call.
      const needsSubaccount: { sid: string; seller: any }[] = [];
      for (const { sid, seller } of sellerResults) {
        if (!seller) continue;
        if (seller.payment_account) {
          subaccounts.push({
            seller_id: sid,
            account: seller.payment_account,
            subtotal: groups[sid].subtotal,
            shippingFee: groups[sid].shippingFee,
            serviceFee: groups[sid].serviceFee,
          });
        } else {
          needsSubaccount.push({ sid, seller });
        }
      }

      // Create missing subaccounts (still sequential to avoid race conditions)
      for (const { sid, seller } of needsSubaccount) {
        try {
          const createResp = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/create_subaccount`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: req.headers.get("Authorization") ?? "",
              },
              body: JSON.stringify({
                seller_id: seller.id,
                name: seller.name,
                email: seller.email,
                percentage_charge: 0,
              }),
            },
          );
          const created = await createResp.json();
          if (createResp.ok && created.success && created.data?.subaccount) {
            const acct =
              created.data.subaccount.subaccount_code ??
              created.data.subaccount.id ??
              null;
            if (acct) {
              subaccounts.push({
                seller_id: sid,
                account: acct,
                subtotal: groups[sid].subtotal,
                shippingFee: groups[sid].shippingFee,
                serviceFee: groups[sid].serviceFee,
              });
              continue;
            }
          }

          // If we get here, creation didn't produce a usable subaccount
          console.warn(
            "create_subaccount did not return subaccount for seller",
            sid,
            created || createResp.status,
          );
          missingSubaccountSellers.push(String(sid));
        } catch (e) {
          console.warn("create_subaccount call failed for seller", sid, e);
          missingSubaccountSellers.push(String(sid));
        }
      }

      // If any seller lacks a subaccount at this point, fail early so admin can fix configuration.
      if (missingSubaccountSellers.length > 0) {
        throw new Error(
          `Missing Paystack subaccounts for sellers: ${missingSubaccountSellers.join(", ")}. Ensure seller subaccounts exist or create them before initializing payment.`,
        );
      }

      // Customer-facing total (in pesewas): subtotal + shipping ONLY
      // The service fee is deducted from seller subaccount shares — it stays with the platform
      const totalAmount = Math.round(customerTotal * 100);

      if (subaccounts.length > 0 && subtotal > 0) {
        // Each seller's subaccount share = their product subtotal - their service fee + their shipping fees
        //   seller receives:  product revenue - platform service fee + shipping
        //   platform receives: all service fees → Paystack deducts its processing fee from this
        paystackSubaccounts = subaccounts.map((s) => {
          const sellerNetPesewas = Math.round(
            (s.subtotal - s.serviceFee + s.shippingFee) * 100,
          );
          // Ensure share is not negative (safety clamp)
          const share = Math.max(0, sellerNetPesewas);
          return { subaccount: s.account, share };
        });
        const totalSellerShares = paystackSubaccounts.reduce(
          (sum: number, s: any) => sum + s.share,
          0,
        );
        const platformKeeps = totalAmount - totalSellerShares;
        console.log("🔢 Paystack subaccounts computed:", {
          paystackSubaccounts,
          totalSellerShares,
          platformKeeps,
          totalServiceFee,
          bearer: "account",
          note: "Platform keeps service fees. Paystack processing fees come from platform share.",
        });
      }

      // Prepare base payload for Paystack initialize
      const initPayload: any = {
        email: user.email,
        amount: totalAmount,
        currency: "GHS",
        reference,
        metadata: { breakdown: groups },
      };

      // ─── Multi-vendor split via the correct Paystack API ───────────────────
      // POST /transaction/initialize does NOT accept a `subaccounts` array.
      // The correct flow depends on seller count:
      //
      //   Single seller  → pass `subaccount`, `transaction_charge`, `bearer`
      //                     directly on the initialize payload.
      //
      //   Multi-seller   → first create a split group via POST /split
      //                     (returns a split_code), then pass `split_code`
      //                     on the initialize payload.
      // ───────────────────────────────────────────────────────────────────────
      if (paystackSubaccounts.length === 1) {
        // Single-seller path.
        //
        // SERVICE FEE ROUTING:
        // - Customer pays: seller_subtotal + seller_shipping (no service fee added)
        // - Paystack total = that amount in pesewas
        // - transaction_charge = service_fee_pesewas  ← platform retains this
        // - Subaccount receives: total - transaction_charge
        //     = (subtotal + shipping) - service_fee
        //     = the seller's net amount
        // - bearer: "account" → Paystack processing fee is deducted from main account's share
        //     (i.e. from the service fee the platform keeps)
        const sellerNetShare = paystackSubaccounts[0].share; // pesewas: subtotal - serviceFee + shipping
        // transaction_charge = what the MAIN account keeps (the service fee).
        // Clamp to [0, totalAmount - 1] so Paystack never rejects a negative merchant share.
        const platformServiceFee = Math.min(
          Math.max(0, totalAmount - sellerNetShare),
          totalAmount - 1,
        );
        initPayload.subaccount = paystackSubaccounts[0].subaccount;
        initPayload.transaction_charge = platformServiceFee;
        // bearer: "account" — main account absorbs Paystack's processing fee from the service fee.
        // This is safe now because transaction_charge is clamped ≥ 0.
        initPayload.bearer = "account";
        console.log("💳 Single-seller subaccount split:", {
          subaccount: initPayload.subaccount,
          totalAmountPesewas: totalAmount,
          sellerReceivesPesewas: sellerNetShare,
          platformServiceFeePesewas: platformServiceFee,
          bearer: initPayload.bearer,
          note: "Customer pays subtotal+shipping only. Platform keeps service fee. Paystack fee absorbed from service fee.",
        });
      } else if (paystackSubaccounts.length > 1) {
        // Multi-seller path — create a dynamic split group first
        const splitPayload = {
          name: `Split-${reference}`,
          type: "flat",
          currency: "GHS",
          subaccounts: paystackSubaccounts, // [{ subaccount, share }, ...]
          // "all-proportional": Paystack distributes its processing fee proportionally
          // across all subaccounts. No bearer_subaccount required. Platform share is
          // never reduced, so "Merchant share cannot be lower than zero" cannot occur.
          bearer_type: "all-proportional",
        };

        console.log("🔀 Creating Paystack split group:", splitPayload);

        const splitRes = await fetch("https://api.paystack.co/split", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(splitPayload),
        });
        const splitData = await splitRes.json();
        console.log("📨 Paystack split create response:", splitData);

        if (!splitRes.ok || splitData.status !== true) {
          throw new Error(
            splitData.message || "Failed to create Paystack split group",
          );
        }

        const splitCode = splitData.data?.split_code;
        if (!splitCode) {
          throw new Error(
            "Paystack split group created but returned no split_code",
          );
        }

        initPayload.split_code = splitCode;
        console.log("✅ Split group created:", splitCode);
      }

      // Diagnostic: log the final initialize payload (without secret)
      try {
        console.log("🔧 Paystack initialize payload:", {
          email: initPayload.email,
          amount: initPayload.amount,
          reference: initPayload.reference,
          subaccount: initPayload.subaccount,
          transaction_charge: initPayload.transaction_charge,
          split_code: initPayload.split_code,
          bearer: initPayload.bearer,
          metadata: initPayload.metadata,
        });
      } catch (e) {
        console.warn("Failed to log initPayload diagnostic:", e);
      }

      // Call Paystack initialize
      const paystackBody = JSON.stringify(initPayload);
      try {
        console.log("🚀 Sending initialize to Paystack (status will follow)");
      } catch (e) {
        /* ignore logging errors */
      }

      const initRes = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            "Content-Type": "application/json",
          },
          body: paystackBody,
        },
      );

      // Log response status and content-type for diagnostics
      try {
        console.log("📡 Paystack initialize HTTP status:", initRes.status);
        console.log(
          "📡 Paystack initialize content-type:",
          initRes.headers.get("content-type"),
        );
      } catch (e) {
        console.warn("Failed to log Paystack response meta:", e);
      }

      const initData = await initRes.json();
      // Log Paystack response for debugging split acceptance
      try {
        console.log("📨 Paystack initialize response:", initData);
      } catch (e) {
        console.warn("Failed to log Paystack initialize response:", e);
      }
      if (!initRes.ok || initData.status !== true) {
        console.error("Paystack initialize failed:", initData);
        throw new Error(initData.message || "Paystack initialize failed");
      }

      return new Response(
        JSON.stringify({ success: true, data: initData.data }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Default: verify payment flow
    const { reference, orderData } = body || {};

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

    // Initialize a service-role client for privileged writes (avoid RLS issues)
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let supabaseService: any = null;
    if (serviceRoleKey) {
      supabaseService = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        serviceRoleKey,
      );
    } else {
      console.warn(
        "⚠️ SUPABASE_SERVICE_ROLE_KEY not configured — privileged writes may fail due to RLS",
      );
    }

    const writeClient = supabaseService ?? supabaseClient;

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

    // Hydrate any cart items missing the joined `product` by querying `express_products`.
    const missingProductIds = cartItems
      .filter((i: any) => !i.product && i.product_id)
      .map((i: any) => i.product_id);

    if (missingProductIds.length > 0) {
      try {
        const { data: products, error: productsError } = await supabaseClient
          .from("express_products")
          .select("id,seller_id,price,title,thumbnail,thumbnails,shipping_fee")
          .in("id", missingProductIds);

        if (productsError) {
          console.error("❌ Error fetching missing products:", productsError);
        } else if (products && products.length > 0) {
          const prodMap: Record<string, any> = {};
          products.forEach((p: any) => (prodMap[p.id] = p));
          cartItems.forEach((item: any) => {
            if (!item.product && item.product_id && prodMap[item.product_id]) {
              item.product = prodMap[item.product_id];
              console.log(
                `✅ Hydrated cart item ${item.id} with product ${item.product_id}`,
              );
            }
          });
        }
      } catch (hydrateErr) {
        console.error("❌ Failed to hydrate missing products:", hydrateErr);
      }
    }

    // Calculate subtotal — prefer cart item price (accounts for discounts/flash sales)
    let subtotal = 0;
    let totalShippingFee = 0;
    cartItems.forEach((item: any) => {
      const unitPrice = item.price ?? item.product?.price ?? 0;
      const itemShipping =
        parseFloat(item.product?.shipping_fee || 0) * item.quantity;
      if (!item.product) {
        console.warn(
          `Cart item ${item.id} missing joined product — falling back to item.price=${item.price}`,
        );
      }
      subtotal += item.quantity * unitPrice;
      totalShippingFee += itemShipping;
    });

    // Fetch global service_fee_percentage from express_settings for order records
    let serviceFeePercentage = 0;
    try {
      const { data: settingsData } = await writeClient
        .from("express_settings")
        .select("value")
        .eq("key", "service_fee_percentage")
        .maybeSingle();
      if (settingsData?.value) {
        serviceFeePercentage = parseFloat(settingsData.value) || 0;
      }
    } catch (settingsErr) {
      console.warn("Failed to fetch service_fee_percentage:", settingsErr);
    }

    // Calculate service fee as percentage of product subtotal
    const calculatedServiceFee =
      serviceFeePercentage > 0
        ? Math.round(((subtotal * serviceFeePercentage) / 100) * 100) / 100
        : 0;

    // Accept shipping fee from client or compute from products (use larger value for safety)
    const shippingAddress = orderData?.shippingAddress ?? null;
    const clientShippingFee = orderData?.shippingFee ?? 0;
    const overallShippingFee =
      Math.max(clientShippingFee, totalShippingFee) || 0;

    // Customer-facing total: subtotal + shipping ONLY
    // Service fee is deducted from seller subaccount shares — it does NOT appear in the customer total
    const total = subtotal + overallShippingFee;

    // Get seller_id from first item (try joined product, then cart item fallback)
    let sellerId =
      cartItems[0].product?.seller_id ?? cartItems[0].seller_id ?? null;
    if (!sellerId) {
      console.warn(
        "⚠️ Seller ID not found for first cart item — proceeding with null seller_id.",
      );
      sellerId = null;
    }

    console.log("💰 Order totals (verify):", {
      subtotal,
      overallShippingFee,
      totalServiceFee: calculatedServiceFee,
      serviceFeePercentage,
      customerPays: total,
      sellerId,
      note: "Service fee deducted from seller shares, not in customer total",
    });

    // Split cart by seller and create one order per seller.
    const groups: Record<
      string,
      { items: any[]; subtotal: number; shippingFee: number }
    > = {};
    cartItems.forEach((item: any) => {
      const sid = item.product?.seller_id ?? null;
      const unitPrice = item.price ?? item.product?.price ?? 0;
      const itemShipping =
        parseFloat(item.product?.shipping_fee || 0) * item.quantity;
      if (!groups[sid])
        groups[sid] = { items: [], subtotal: 0, shippingFee: 0 };
      groups[sid].items.push(item);
      groups[sid].subtotal += unitPrice * item.quantity;
      groups[sid].shippingFee += itemShipping;
    });

    const sellerIds = Object.keys(groups);

    const createdOrders: any[] = [];

    for (const sid of sellerIds) {
      const group = groups[sid];
      // Seller's shipping fee is computed from their products' shipping_fee
      const groupShippingFee = Math.round(group.shippingFee * 100) / 100;

      // Service fee for this seller = percentage of their product subtotal
      const groupServiceFee =
        serviceFeePercentage > 0
          ? Math.round(((group.subtotal * serviceFeePercentage) / 100) * 100) /
            100
          : 0;

      // Total for this seller's order (what customer paid for their items) = subtotal + shipping
      // Service fee is internal — tracked in the record but NOT part of the customer-facing total
      const groupTotal =
        Math.round((group.subtotal + groupShippingFee) * 100) / 100;

      // Try to use seller name as vendor when available
      let vendorName = "ExpressMart";
      if (sid && sid !== "null") {
        try {
          const { data: sellerInfo, error: sellerInfoError } = await writeClient
            .from("express_sellers")
            .select("name")
            .eq("id", sid)
            .maybeSingle();
          if (!sellerInfoError && sellerInfo?.name)
            vendorName = sellerInfo.name;
        } catch (siErr) {
          console.error(
            "❌ Failed to fetch seller info for vendor field:",
            siErr,
          );
        }
      }

      // ── Fee breakdown for this seller's order ─────────────────────────────
      // seller_amount: what the seller's subaccount actually receives:
      //   product_subtotal - service_fee + shipping_fees
      //   (service fee is deducted from seller's share by Paystack; platform keeps it)
      const sellerAmount =
        Math.round(
          (group.subtotal - groupServiceFee + groupShippingFee) * 100,
        ) / 100;
      // platform_commission / platform_amount: the service fee the platform retains
      // Paystack processing fees are absorbed from this amount (bearer: account)
      const platformCommission = groupServiceFee;
      const platformAmount = groupServiceFee;
      // Proportionally allocate the Paystack processing fee to this seller's order
      const customerTotalGHS = subtotal + overallShippingFee; // what customer actually paid
      const paystackFeePesewas = paystackData.data.fees ?? 0;
      const allocationRatio =
        customerTotalGHS > 0
          ? groupTotal / customerTotalGHS
          : 1 / sellerIds.length;
      const sellerPaystackFeePesewas = Math.round(
        paystackFeePesewas * allocationRatio,
      );
      console.log("💰 Payment fee breakdown for seller", sid, {
        subtotal: group.subtotal,
        shippingFee: groupShippingFee,
        serviceFeePercentage,
        serviceFee: groupServiceFee,
        sellerAmount,
        platformAmount,
        paystackFeePesewas: sellerPaystackFeePesewas,
        note: "Seller receives subtotal-serviceFee+shipping. Platform keeps service fee. Paystack fees from service fee.",
      });

      const orderPayload = {
        user_id: user.id,
        seller_id: sid === "null" ? null : sid,
        vendor: vendorName,
        status: "processing",
        subtotal: group.subtotal,
        shipping_fee: groupShippingFee,
        service_fee: groupServiceFee,
        service_fee_pct: serviceFeePercentage,
        notes: orderData?.notes ?? null,
        paystack_reference: paystackData.data.reference ?? null,
        total: groupTotal,
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

      const { data: order, error: orderError } = await writeClient
        .from("express_orders")
        .insert(orderPayload)
        .select()
        .single();

      if (orderError) {
        console.error("❌ Order creation error for seller", sid, orderError);
        throw new Error(
          `Order creation failed for seller ${sid}: ${orderError.message}`,
        );
      }

      // Create order items for this seller
      const orderItems = group.items.map((item: any) => {
        const unitPrice = item.price ?? item.product?.price ?? 0;
        const itemShippingFee = parseFloat(item.product?.shipping_fee || 0);
        return {
          order_id: order.id,
          product_id: item.product?.id ?? item.product_id,
          seller_id: sid === "null" ? null : sid,
          title: item.product?.title ?? item.title ?? "Unknown product",
          thumbnail:
            item.product?.thumbnail ||
            item.product?.thumbnails?.[0] ||
            item.thumbnail,
          quantity: item.quantity,
          price: unitPrice,
          shipping_fee: itemShippingFee,
          total: Math.round(item.quantity * unitPrice * 100) / 100,
          size: item.size,
          color: item.color,
        };
      });

      const { error: orderItemsError } = await writeClient
        .from("express_order_items")
        .insert(orderItems);

      if (orderItemsError) {
        console.error("❌ Order items error for seller", sid, orderItemsError);
        // Rollback order
        await supabaseClient.from("express_orders").delete().eq("id", order.id);
        throw new Error(
          `Order items creation failed for seller ${sid}: ${orderItemsError.message}`,
        );
      }

      // Create express_payments record for this order (allocated amount)
      try {
        // Use a per-seller unique reference to avoid duplicate-key constraint
        // e.g. original Paystack reference + order id
        const perSellerReference = `${paystackData.data.reference}_${order.id}`;

        const paymentPayload: any = {
          order_id: order.id,
          user_id: user.id,
          amount: groupTotal,
          currency: paystackData.data.currency ?? "GHS",
          provider: "paystack",
          // store a per-seller unique reference so multiple express_payments
          // (one per seller) can coexist for a single Paystack reference
          reference: perSellerReference,
          authorization_code:
            paystackData.data.authorization?.authorization_code ??
            paystackData.data.authorization_code ??
            null,
          channel: paystackData.data.channel ?? null,
          status: paystackData.data.status === "success" ? "success" : "failed",
          gateway_response: paystackData.data.gateway_response ?? null,
          // ── Fee tracking fields ──────────────────────────────────────────
          // Paystack processing fee allocated to this order (minor units / pesewas)
          // Paystack fees are absorbed from the platform's service fee share
          paystack_fee_pesewas: sellerPaystackFeePesewas,
          // Paystack fees_split breakdown (only present for subaccount splits)
          paystack_fee_split: paystackData.data.fees_split ?? null,
          // Service fee (% of product subtotal) — goes to MAIN Paystack account
          service_fee_amount: groupServiceFee,
          // Platform commission = service fee percentage of product subtotal
          platform_commission: platformCommission,
          // Net amount the seller receives (product subtotal + shipping fees)
          seller_amount: sellerAmount,
          // Total amount retained by ExpressMart main Paystack account (service fee)
          // Paystack processing fees are deducted from this amount
          platform_amount: platformAmount,
          // ────────────────────────────────────────────────────────────────
          metadata: {
            original: paystackData.data,
            seller_id: sid,
            order_id: order.id,
            fee_breakdown: {
              service_fee_percentage: serviceFeePercentage,
              total_paystack_fee_pesewas: paystackFeePesewas,
              allocated_fee_pesewas: sellerPaystackFeePesewas,
              shipping_fee_ghs: groupShippingFee,
              service_fee_ghs: groupServiceFee,
              platform_commission_ghs: platformCommission,
              seller_amount_ghs: sellerAmount,
              platform_amount_ghs: platformAmount,
              note: "Seller receives subtotal-serviceFee+shipping. Platform keeps service fee. Paystack fees from service fee.",
            },
          },
          paid_at: paystackData.data.paid_at ?? new Date().toISOString(),
        };

        const { data: paymentRecord, error: paymentError } = await writeClient
          .from("express_payments")
          .insert(paymentPayload)
          .select()
          .single();

        if (paymentError) {
          console.error(
            "❌ express_payments insert error for seller",
            sid,
            paymentError,
          );
        } else {
          console.log(
            "✅ express_payments record created for seller",
            sid,
            paymentRecord.reference,
          );
        }
      } catch (payErr) {
        console.error(
          "❌ Error inserting payment record for seller",
          sid,
          payErr,
        );
      }

      // Update order with raw payment data
      try {
        const { error: updateOrderError } = await writeClient
          .from("express_orders")
          .update({ payment_data: paystackData.data })
          .eq("id", order.id);

        if (updateOrderError) {
          console.error(
            "❌ Failed to update order.payment_data for seller",
            sid,
            updateOrderError,
          );
        } else {
          console.log("✅ Updated order with payment_data for seller", sid);
        }
      } catch (updErr) {
        console.error(
          "❌ Error updating order.payment_data for seller",
          sid,
          updErr,
        );
      }

      createdOrders.push(order);
    }

    // Clear cart
    await writeClient
      .from("express_cart_items")
      .delete()
      .eq("cart_id", cart.id);

    console.log("✅ Cart cleared");

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          orders: createdOrders,
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
