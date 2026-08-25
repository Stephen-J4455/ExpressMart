// ── ai-assistant edge function ───────────────────────────────────────────────
// OpenRouter-backed agent loop for the in-app AI assistant.
//
//   POST { message, history?: [{ role, text }] }
//   → { success, reply, toolCalls, products }
//
// • Model is read LIVE from express_settings.key = 'ai_model' (managed from
//   the Admin app → Settings), so switching models needs no redeploy.
// • OPENROUTER_API_KEY comes from the function's environment secrets:
//       supabase secrets set OPENROUTER_API_KEY=sk-or-...
// • Catalog tools (search_products / filter_catalog) execute server-side
//   against express_products and feed results back to the model so it can
//   reason over them and write a natural reply.
// • Client tools (add_to_cart / navigate_to_page / point_to_element) are
//   returned as `toolCalls` for the app to execute locally (cart, navigation
//   and screen grounding are client-side capabilities).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_AGENT_ITERATIONS = 3;
const MAX_HISTORY_MESSAGES = 10;

// Tool schemas (OpenAI function-calling format — OpenRouter is compatible).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the ExpressMart product catalog by free-text query. Returns product cards the app renders for the user.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search query." },
          limit: { type: "integer", description: "Max products to return (1-8, default 5)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filter_catalog",
      description:
        "Filter the catalog with structured constraints (price, category, rating, sorting). Use when the user mentions budgets, categories or sorting instead of a plain query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional text combined with the filters." },
          category: { type: "string", description: "Category name, e.g. 'Electronics'." },
          maxPrice: { type: "number", description: "Maximum price in GHS." },
          minPrice: { type: "number", description: "Minimum price in GHS." },
          minRating: { type: "number", description: "Minimum rating (0-5)." },
          sort: {
            type: "string",
            enum: ["price_asc", "price_desc", "rating", "popular", "newest"],
            description: "Result sort order.",
          },
          limit: { type: "integer", description: "Max products (1-8, default 5)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "Add a known product to the user's cart. Runs on the device — only call for a product id you received from search/filter results, and only when the user explicitly asked.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product id." },
          quantity: { type: "integer", description: "Quantity (default 1)." },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_page",
      description:
        "Navigate the app to one of its screens. Use for 'take me to X' requests.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: [
              "home", "feed", "chats", "cart", "account", "profile", "checkout",
              "orders", "wishlist", "notifications", "addresses", "payments",
              "settings", "security", "search", "categories", "stores", "help",
            ],
            description: "Destination page key.",
          },
        },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "point_to_element",
      description:
        "Highlight a UI element on the user's screen with an animated pointer. Use for 'where is X' questions about the interface.",
      parameters: {
        type: "object",
        properties: {
          element: {
            type: "string",
            enum: [
              "checkout.promoCode", "checkout.payButton", "checkout.orderSummary",
              "cart.checkoutButton", "ai.inputBar",
            ],
            description: "Grounding element key.",
          },
        },
        required: ["element"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the ExpressMart in-app shopping assistant — friendly, concise and action-oriented.

Capabilities:
• search_products / filter_catalog — search the live catalog; results are rendered as product cards the user can add to their cart.
• add_to_cart — add a specific product id to the cart (device-side).
• navigate_to_page — open any app screen (device-side).
• point_to_element — highlight a UI element on the current screen (device-side).

Style: keep replies short (1-3 sentences), warm and helpful. Use GH₵ for currency. When you show products, briefly say what you searched for. If a tool result is empty, say so honestly and suggest broader terms. Never invent products or prices.`;

const serveCors = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/** Read the configured model id from express_settings (admin-managed). */
const resolveModel = async (writeClient) => {
  try {
    const { data } = await writeClient
      .from("express_settings")
      .select("value")
      .eq("key", "ai_model")
      .maybeSingle();
    const model = typeof data?.value === "string" ? data.value.trim() : "";
    return model || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
};

/** Server-side catalog tools — query express_products directly. */
const runCatalogTool = async (writeClient, args) => {
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  let query = writeClient
    .from("express_products")
    .select(
      "id,title,price,discount,thumbnail,category,rating,total_ratings,sold_count",
    )
    .eq("status", "active")
    .limit(limit);

  if (args?.query) {
    const safe = String(args.query).replace(/[%,()]/g, " ").trim();
    if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
  }
  if (args?.category) query = query.ilike("category", `%${String(args.category).trim()}%`);
  if (Number.isFinite(Number(args?.maxPrice)))
    query = query.lte("price", Number(args.maxPrice));
  if (Number.isFinite(Number(args?.minPrice)))
    query = query.gte("price", Number(args.minPrice));
  if (Number.isFinite(Number(args?.minRating)))
    query = query.gte("rating", Number(args.minRating));

  switch (args?.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "rating":
      query = query.order("rating", { ascending: false });
      break;
    case "popular":
      query = query.order("sold_count", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const products = (data || []).map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price || 0),
    discount: Number(p.discount || 0),
    thumbnail: p.thumbnail || null,
    category: p.category || null,
    rating: Number(p.rating || 0),
    total_ratings: p.total_ratings ?? 0,
  }));

  return {
    products,
    summary:
      products.length === 0
        ? "No matching products found."
        : `${products.length} product(s): ${products
            .map(
              (p) =>
                `${p.title} — GH₵${p.price}${p.discount > 0 ? ` (${p.discount}% off)` : ""}`,
            )
            .join("; ")}`,
  };
};

const callOpenRouter = (apiKey, model, chatMessages, extra = {}) =>
  fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://expressmart.app",
      "X-Title": "ExpressMart Assistant",
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      max_tokens: 700,
      temperature: 0.4,
      ...extra,
    }),
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase env not configured");
    }
    if (!apiKey) {
      return serveCors({
        success: false,
        error:
          "OPENROUTER_API_KEY is not configured. Set it with: supabase secrets set OPENROUTER_API_KEY=sk-or-...",
      });
    }

    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message) throw new Error("message is required");

    const writeClient = createClient(supabaseUrl, serviceRoleKey);
    const model = await resolveModel(writeClient);

    // Conversation so far (trimmed + role-normalised).
    const history = (Array.isArray(body?.history) ? body.history : [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.text || "").slice(0, 2000),
      }))
      .filter((m) => m.content);

    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message },
    ];

    // ── Agent loop: model → tools → model … (max 3 iterations) ──
    const products = [];
    const clientToolCalls = [];

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
      const res = await callOpenRouter(apiKey, model, chatMessages, {
        tools: TOOLS,
        tool_choice: "auto",
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `OpenRouter error (${res.status}): ${errText.slice(0, 300)}`,
        );
      }
      const data = await res.json();
      const choice = data?.choices?.[0]?.message;
      if (!choice) throw new Error("Empty response from OpenRouter");

      const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];

      if (toolCalls.length === 0) {
        // Final text reply — turn complete.
        return serveCors({
          success: true,
          reply: (choice.content || "").trim() || "Here's what I found!",
          toolCalls: clientToolCalls,
          products,
          model,
        });
      }

      // Execute / hand off each tool call, then feed results back.
      chatMessages.push(choice);
      for (const call of toolCalls) {
        const name = call?.function?.name;
        let args = {};
        try {
          args = JSON.parse(call?.function?.arguments || "{}");
        } catch {
          args = {};
        }

        if (name === "search_products" || name === "filter_catalog") {
          try {
            const result = await runCatalogTool(writeClient, args);
            products.push(...result.products);
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result.summary,
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Catalog search failed: ${e?.message || e}`,
            });
          }
          continue;
        }

        // Client-side tools — the app executes them after this response.
        clientToolCalls.push({ name, args });
        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Handed to the client app for execution: ${name}.`,
        });
      }
    }

    // Iteration budget exhausted — ask for a wrap-up without tools.
    const res = await callOpenRouter(apiKey, model, [
      ...chatMessages,
      {
        role: "user",
        content:
          "Wrap up now: reply with a short final message based on what you found. Do not call any tools.",
      },
    ]);
    const data = res.ok ? await res.json() : null;
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "I put together some results for you — take a look!";

    return serveCors({
      success: true,
      reply,
      toolCalls: clientToolCalls,
      products,
      model,
    });
  } catch (error) {
    console.error("[ai-assistant] request.error", error);
    return serveCors({ success: false, error: error?.message || String(error) });
  }
});