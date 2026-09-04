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
// Bumped from 3 → 5: "agent has eyes" tasks (read_screen → point) need
// more headroom than simple search/navigate flows.
const MAX_AGENT_ITERATIONS = 5;
const MAX_HISTORY_MESSAGES = 10;

// Tool schemas (OpenAI function-calling format — OpenRouter is compatible).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the tagit product catalog by free-text query. Returns product cards the app renders for the user. Search is ranked TAGS-FIRST: products whose `tags` array contains any of the query's significant words (e.g. 'wireless', 'flash-sale', 'organic') are returned first, then title matches, then category matches. Multi-word queries (e.g. 'wireless earbuds') match if ANY token hits a tag, title or category.",
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
        "Filter the catalog with structured constraints (price, category, rating, sorting). Use when the user mentions budgets, categories or sorting instead of a plain query. When `query` is supplied, the same tag-first ranking as search_products applies.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional text combined with the filters — tag-first ranking applies." },
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
        "Point at ANYTHING in the app with an animated pointer. Two modes: (1) pass a known key to spotlight an exact registered control — known keys: checkout.promoCode, checkout.payButton, checkout.orderSummary, cart.checkoutButton, tagAI.inputBar; (2) for ANYTHING else pass a free-form short name in 'element' plus 'label'/'description' and the app highlights that area of the current screen. If what the user asks about lives on another page, call navigate_to_page first, then point.",
      parameters: {
        type: "object",
        properties: {
          element: {
            type: "string",
            description:
              "A known grounding key (see above) OR any short identifier for the thing being pointed at (e.g. 'search bar', 'profile avatar').",
          },
          label: {
            type: "string",
            description:
              "Short human-friendly title shown in the pointer bubble (2-5 words). Use for free-form targets.",
          },
          description: {
            type: "string",
            description:
              "One sentence describing what this element does or where to find it.",
          },
          shape: {
            type: "string",
            enum: ["rect", "circle", "arrow", "bracket"],
            description: "Pointer shape (default rect).",
          },
          direction: {
            type: "string",
            enum: ["up", "down", "left", "right", "auto"],
            description: "Pointer direction (default auto).",
          },
          size: {
            type: "string",
            enum: ["sm", "md", "lg"],
            description: "Pointer size (default md).",
          },
          coords: {
            type: "object",
            description: "Optional absolute window coordinates {x, y, w, h} for free-form targets.",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
            },
          },
        },
        // `element` is required by OpenAI's function-calling validator. The
        // model can pass any short string here when the real targeting comes
        // from `item_id` or `coords` — the client executor checks item_id
        // first and treats `element` as a fallback label.
        required: ["element"],
      },
    },
  },
  // ── Product / store detail tools (server-executed, read-only) ──────────
  // The previous setup only had search/filter — the model couldn't drill
  // into a specific product's full description, specs, the store it came
  // from, or browse that store's other products. These four tools fill
  // that gap.
  {
    type: "function",
    function: {
      name: "get_product_details",
      description:
        "Fetch a single product by id with FULL details: the complete description, the entire specifications map (every key→value pair the seller filled in), sizes, colors, weight, shipping fee, variants, tags, and the seller's profile (name, verified flag, rating, reviews, location, fulfillment speed). Use this whenever the user asks anything that depends on a product's contents — 'what are the specs', 'what's the battery life', 'what's it made of', 'how heavy is it', 'is it waterproof', 'what colors does it come in', 'tell me the dimensions', 'what's the return policy', 'is it in stock'. The tool summary the model receives contains the full description (up to 600 chars) and every specification as a key/value block, so the model can answer any follow-up question without another tool call.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The product id." },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_details",
      description:
        "Fetch a single store (seller) by id with FULL details (name, avatar, cover image, bio, store description, location, rating, total ratings, badges, social links, verification status, fulfillment speed, default shipping fee). Use when the user asks about the store behind a product, or wants to know if a store is verified.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "The seller / store id." },
        },
        required: ["seller_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_products",
      description:
        "List a store's products. Use after get_store_details to browse what a store sells. Same filter/sort/pagination as filter_catalog but scoped to one seller_id.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "The seller / store id." },
          sort: {
            type: "string",
            enum: ["price_asc", "price_desc", "rating", "popular", "newest"],
          },
          maxPrice: { type: "number" },
          minPrice: { type: "number" },
          minRating: { type: "number" },
          page: { type: "integer", description: "1-based page (default 1)." },
          limit: { type: "integer", description: "Max products to return (1-8, default 5)." },
        },
        required: ["seller_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_stores",
      description:
        "Search the store directory by name, category, or location. Returns up to N stores with summary info (id, name, avatar, rating, total ratings, badges, location, is_verified, store_description). Use when the user asks 'are there any stores selling X' or 'find me a verified seller' or 'stores near me'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text query (matches name, description, store_description)." },
          location: { type: "string", description: "Filter by city / region (e.g. 'Accra')." },
          minRating: { type: "number", description: "Minimum store rating (0-5)." },
          verifiedOnly: { type: "boolean", description: "Only show verified sellers." },
          limit: { type: "integer", description: "Max stores to return (1-8, default 5)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_store",
      description:
        "Open a seller's storefront page. The store must already be known to the user (e.g. surfaced from search_stores, get_store_details, or a product card). Pair with a tool result that contains a seller_id / store_id.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "The store / seller id to open." },
        },
        required: ["seller_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_product",
      description:
        "Open a specific product detail page. The product must already be known (e.g. surfaced from search_products or get_product_details).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The product id to open." },
        },
        required: ["product_id"],
      },
    },
  },
  // ── New "agent has eyes" tools (handed off to the client app) ───────────
  {
    type: "function",
    function: {
      name: "read_screen",
      description:
        "Return a snapshot of items currently registered against the active screen (id, text, role, rect). Use to discover what's visible before pointing, scrolling, or picking a product.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            enum: ["viewport", "all"],
            description: "viewport = only items currently measured on screen (default). all = every registered item.",
          },
          max_items: { type: "integer", description: "Cap on items returned (default 30)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_on_screen",
      description:
        "Find items matching a free-text query on the active screen. Returns enriched items with rects so you can call point_to_element against a specific match.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          role: { type: "string" },
          max_items: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description:
        "Scroll the active (or named) scroll surface in a direction. Use when the target is below the fold or off to the side.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down", "left", "right"] },
          amount: { type: "string", description: "'page' | 'half' | number of px" },
          surface: { type: "string" },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll_to",
      description:
        "Scroll a named item into view. The item must be registered in the screen index (use read_screen to discover ids).",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          position: { type: "string", enum: ["top", "bottom", "visible"] },
          surface: { type: "string" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wait_for",
      description:
        "Poll the screen index until an item matches a predicate. Useful after a navigate or scroll when the new content takes a moment to mount.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          role: { type: "string" },
          timeout_ms: { type: "integer" },
          poll_ms: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_app_state",
      description:
        "Return the current app state: active route, signed-in user id, cart count, etc. Cheap context check before acting.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_reviews",
      description:
        "Fetch approved reviews for a product, with rating distribution. Use when the user asks 'what do people say about this?' or 'is this product any good?'.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          sort: { type: "string", enum: ["newest", "helpful", "rating_high", "rating_low"] },
          min_rating: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_reviews",
      description:
        "Aggregate reviews across all of a store's products.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
          min_rating: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
        },
        required: ["seller_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_screens",
      description: "List every navigable screen in the app. Filter by role or query.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["customer", "seller", "both"] },
          query: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_screen_info",
      description: "Get the components, tap targets, and tools of a specific screen.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tap_element",
      description:
        "Tap a registered element (e.g. 'productDetail.addToCart', 'store.follow', 'checkout.payButton'). The screen must have a useTapTarget handler for that id.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          screen: { type: "string" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "go_back",
      description: "Pop the current screen off the navigation stack.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tap_targets",
      description: "List every currently-registered tap target on the active screen.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "dismiss_overlay",
      description: "Dismiss the AI pointer overlay (or any open modal the agent opened).",
      parameters: { type: "object", properties: {} },
    },
  },
];

const SYSTEM_PROMPT = `You are the tagit in-app shopping assistant — friendly, concise and action-oriented.

Capabilities:
• search_products / filter_catalog — search the live catalog. Results are rendered as interactive product cards directly below your message, so DO NOT list the products item-by-item in your reply — just add a short, natural intro (e.g. "Here's what I found for wireless earbuds:"). Set \`include_details: true\` if the user wants description, specs, sizes, colors, tags, weight, shipping fee, and full seller info inline. IMPORTANT: search is ranked TAGS-FIRST — products whose \`tags\` array contains the query token (e.g. "wireless", "flash-sale", "organic") appear before products whose \`title\` matches. When in doubt, write the query as a single descriptive phrase and trust the ranker to surface the best matches. Server-side auto-flip: if the user's question contains any spec-related keyword (specs, dimensions, weight, battery, material, color, size, ingredients, "what's in the box", warranty, return policy, etc.), the server returns full details (description + specifications) automatically — so you usually don't need to set the flag yourself.
• get_product_details — fetch a SINGLE product by id with its full description, specifications (key/value map), sizes, colors, tags, weight, shipping fee, variants, and the full seller info. Use this whenever the user asks "tell me more about this", "what are the specs", "what's the return policy", "is it in stock", etc. Output: \`{ product: { ..., seller_id: { id, name, avatar, rating, total_ratings, badges, store_description, is_verified, location, slug, social_* } }, summary: "..." }\`.
• get_store_details — fetch a SINGLE store by seller_id with the full profile (name, slug, avatar, cover image, store description, bio, location, rating, total ratings, badges, all social links, is_verified, fulfillment_speed, default_shipping_fee, account_verified). Use this when the user asks "who sells this?", "is the store legit?", "where is this store based?", "how fast do they ship?".
• get_store_products — list a store's products (paginated, filterable, sortable). Use after get_store_details to browse what a specific store sells.
• search_stores — search the store directory by name / description / location / min-rating / verified-only. Use when the user asks "are there any stores selling X", "find a verified seller", "stores in Accra", "which store has the best rating".
• navigate_to_store — open a seller's storefront page (device-side). Pair with a seller_id from get_store_details, search_stores, or a product's seller_id field.
• navigate_to_product — open a specific product detail page (device-side). Pair with a product_id.
• add_to_cart — add a known product id to the cart (device-side).
• navigate_to_page — open any app screen (device-side).
• point_to_element — visually point at ANYTHING in the app (device-side). Three modes: (1) pass a known key (checkout.promoCode, checkout.payButton, checkout.orderSummary, cart.checkoutButton, tagAI.inputBar) to spotlight the exact control; (2) pass an \`item_id\` discovered via read_screen to point at an indexed item; (3) for anything else, pass a free-form 'element' name plus a short 'label' and one-sentence 'description'. Optional: \`shape\` (rect|circle|arrow|bracket), \`direction\` (up|down|left|right|auto), \`size\` (sm|md|lg), \`coords\` ({x, y, w, h}) for absolute free-form pointing.
• read_screen / find_on_screen / scroll / scroll_to / wait_for / get_app_state / dismiss_overlay — as before.
• get_product_reviews / get_store_reviews — fetch approved reviews + 5/4/3/2/1 star distribution. Use for "what do people say?", "is this product any good?", "show me the bad reviews", "what's this store's rating like?".
• list_screens / get_screen_info — discover every navigable screen (and the seller admin) and its tap targets before issuing tap_element calls.
• tap_element — programmatically tap a registered UI element (e.g. "productDetail.addToCart", "store.follow", "checkout.payButton"). Pass an optional \`screen\` name to navigate first.
• go_back / list_tap_targets — pop the stack / list live tap targets.

Reasoning tips:
• The user often wants to know about a product they just saw. After a search_products result, prefer to call get_product_details with the product's id when the user asks "tell me about this" or "what are the specs".
• The user often wants to know about a STORE. Use get_store_details whenever they ask "who sells this?" or "is this store legit?". Use search_stores when they ask for stores.
• You can chain tools across turns. For example: search_products → get_product_details → get_store_details → navigate_to_store. Don't be afraid to use 3-5 tools in a turn if the user wants depth.
• If point_to_element fails with "not found", call read_screen, then try again with the right item_id or shape.
• Don't loop — if a tool returns "not_found" or "unsupported" twice in a row, give up gracefully and tell the user.

Style: keep replies short (1-3 sentences for casual chat, up to a short paragraph for product/store info that the user explicitly asked about). Use GH₵ for currency. If a tool result is empty, say so honestly and suggest broader terms. Never invent products or prices.`;

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

/** Server-side catalog tools — query express_products directly.
 *
 * `include_details: true` adds description, specifications, sizes, colors,
 * tags, weight, shipping_fee, and full seller info to every result — useful
 * when the model needs to answer questions about the products without a
 * second tool call. Default is off to keep search responses lightweight.
 *
 * TAGS ARE THE HIGHEST FORM OF RELEVANCE: when a free-text `query` is
 * supplied, we cast a wide net (matches against `tags`, `title`, and
 * `category` for every significant token) and re-rank in JS so products
 * whose `tags` array contains a query token are returned first.
 */
const CATALOG_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "have", "i", "in", "is", "it", "its", "of", "on", "or",
  "that", "the", "this", "to", "was", "we", "were", "with", "you",
  "your", "me", "my", "our", "some", "any", "do", "does", "can",
  "could", "would", "should", "want", "need", "like", "look", "looking",
  "find", "search", "show", "buy", "get", "recommend", "suggest",
  "browse", "please", "cheap", "best", "top", "good", "great",
]);

const tokenizeCatalogQuery = (rawQuery: unknown): { phrase: string; tokens: string[] } => {
  const phrase = String(rawQuery ?? "").trim();
  if (!phrase) return { phrase: "", tokens: [] };
  const tokens = Array.from(
    new Set(
      phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w && w.length >= 2 && !CATALOG_STOPWORDS.has(w)),
    ),
  );
  return { phrase, tokens };
};

/**
 * Server-side mirror of the client-side ranker in tagAIAssistantService.js.
 * Same scoring weights so the LLM and the local fallback return identical
 * results in identical order.
 */
const scoreProductForCatalogQuery = (
  product: any,
  phrase: string,
  tokens: string[],
): number => {
  if (!product) return 0;
  const title = String(product.title || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  const tags: string[] = Array.isArray(product.tags)
    ? product.tags.map((t: unknown) => String(t || "").toLowerCase()).filter(Boolean)
    : [];

  const matchedTags = new Set<string>();
  for (const tok of tokens) {
    for (const tag of tags) {
      if (tag === tok || tag.includes(tok) || tok.includes(tag)) {
        matchedTags.add(tag);
      }
    }
  }
  let score = matchedTags.size * 10;
  if (
    tokens.length > 0 &&
    tokens.every((t) =>
      tags.some((tag) => tag === t || tag.includes(t) || t.includes(tag)),
    )
  ) {
    score += 5;
  }
  if (phrase && title.includes(phrase.toLowerCase())) score += 8;
  for (const tok of tokens) {
    if (title.includes(tok)) score += 3;
  }
  for (const tok of tokens) {
    if (category.includes(tok)) score += 2;
  }
  if (score === 0) score = 0.1;
  return score;
};

/**
 * Shape a product's specifications map into a human-readable multi-line
 * block. Accepts both array-of-objects (the seller admin's shape) and a
 * plain key→string map (the catalog's shape) and normalizes both.
 */
const formatSpecifications = (specs: unknown): string => {
  if (!specs) return "";
  if (Array.isArray(specs)) {
    return specs
      .map((row: any) => {
        const key = String(row?.key ?? row?.name ?? "").trim();
        const value = String(row?.value ?? "").trim();
        if (!key || !value) return "";
        return `${key}: ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof specs === "object") {
    return Object.entries(specs as Record<string, unknown>)
      .map(([k, v]) => {
        const value =
          typeof v === "string" || typeof v === "number"
            ? String(v)
            : v
              ? JSON.stringify(v)
              : "";
        if (!k.trim() || !value) return "";
        return `${k}: ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

/**
 * Build a rich, model-readable summary of a product. Includes the FULL
 * description (truncated only at 600 chars), the full specifications as
 * a key/value block, sizes/colors/weight, the category, tags, and the
 * seller info the model needs to answer any question about the product.
 *
 * This replaces the old 200-char teaser so the model can actually read
 * the product's contents without making a second tool call.
 */
const buildRichProductSummary = (product: any): string => {
  if (!product) return "";
  const seller = product.seller_id || {};
  const lines: string[] = [];

  // ── Identity & pricing ────────────────────────────────────────────
  const price = Number(product.price || 0);
  const compareAt =
    product.compare_at_price != null
      ? Number(product.compare_at_price)
      : null;
  const discount = Number(product.discount || 0);
  lines.push(
    `Title: ${product.title}` +
      (product.category ? ` (category: ${product.category})` : "") +
      (Array.isArray(product.tags) && product.tags.length
        ? ` — tags: ${product.tags.join(", ")}`
        : ""),
  );
  let priceLine = `Price: GH₵${price.toFixed(2)}`;
  if (compareAt && compareAt > price) {
    priceLine += ` (was GH₵${compareAt.toFixed(2)}`;
    if (discount > 0) priceLine += `, ${discount}% off`;
    priceLine += ")";
  } else if (discount > 0) {
    priceLine += ` (${discount}% off)`;
  }
  lines.push(priceLine);

  // ── Stock & shipping ──────────────────────────────────────────────
  const stockBits: string[] = [];
  if (product.track_inventory) {
    if (Number(product.quantity) > 0) {
      stockBits.push(`In stock (${product.quantity} available)`);
    } else if (product.allow_backorder) {
      stockBits.push("Backorder allowed");
    } else {
      stockBits.push("Out of stock");
    }
  }
  const shippingFee = Number(product.shipping_fee || 0);
  if (shippingFee > 0) {
    stockBits.push(`Shipping: GH₵${shippingFee.toFixed(2)}`);
  } else if (seller.default_shipping_fee != null) {
    const dsf = Number(seller.default_shipping_fee);
    if (dsf > 0) stockBits.push(`Shipping: GH₵${dsf.toFixed(2)} (store default)`);
    else stockBits.push("Free shipping");
  } else {
    stockBits.push("Shipping: see store");
  }
  if (stockBits.length) lines.push(stockBits.join(" — "));

  // ── Variants ──────────────────────────────────────────────────────
  if (Array.isArray(product.sizes) && product.sizes.length) {
    lines.push(`Available sizes: ${product.sizes.join(", ")}`);
  }
  if (Array.isArray(product.colors) && product.colors.length) {
    lines.push(`Available colors: ${product.colors.join(", ")}`);
  }
  if (product.weight != null && product.weight !== "") {
    const w = Number(product.weight);
    if (Number.isFinite(w)) {
      lines.push(`Weight: ${w} ${product.weight_unit || "kg"}`);
    }
  }

  // ── Description (the full text, only truncated at 600 chars) ──────
  const description = String(product.description || "").trim();
  if (description) {
    const truncated =
      description.length > 600
        ? `${description.slice(0, 600)}…`
        : description;
    lines.push(`\nDescription:\n${truncated}`);
  }

  // ── Specifications (key/value, every spec on file) ────────────────
  const specs = formatSpecifications(product.specifications);
  if (specs) {
    lines.push(`\nSpecifications:\n${specs}`);
  }

  // ── Seller ────────────────────────────────────────────────────────
  if (seller?.name) {
    const sellerBits: string[] = [`Seller: ${seller.name}`];
    if (seller.is_verified) sellerBits.push("verified");
    if (seller.account_verified) sellerBits.push("account-verified");
    if (seller.rating != null) {
      sellerBits.push(
        `rating ${Number(seller.rating).toFixed(1)}★ (${seller.total_ratings || 0} reviews)`,
      );
    }
    if (seller.location) sellerBits.push(`based in ${seller.location}`);
    if (seller.fulfillment_speed)
      sellerBits.push(`fulfills in ${seller.fulfillment_speed}`);
    lines.push(sellerBits.join(" — "));
  }

  return lines.filter(Boolean).join("\n");
};

/**
 * Auto-detect whether a free-text query is asking about product
 * CONTENTS (specs, description, dimensions, weight, materials,
 * battery, ingredients, compatibility, etc.) so we can flip
 * `include_details: true` on the catalog call. The LLM can then
 * answer from the response payload alone, without a second
 * `get_product_details` round trip.
 */
const queryNeedsFullDetails = (text: unknown): boolean => {
  if (!text) return false;
  const t = String(text).toLowerCase();
  const patterns: RegExp[] = [
    /\b(specs?|specifications?)\b/,
    /\b(description|describes?|details? about)\b/,
    /\b(dimensions?|how (big|small|heavy|light|tall|wide|long))\b/,
    /\b(weight|mass|grams?|kg|kilograms?|pounds?|lbs|oz|weighs?|weigh)\b/,
    /\b(material|fabric|leather|plastic|metal|wood|glass|silicone|aluminum|aluminium|steel|cotton|polyester|waterproof|water-?resistant|ipx\d|ceramic|carbon)\b/,
    /\b(battery|charge|charging|capacity|mah|wh)\b/,
    /\b(screen|display|resolution|pixels?|inch|"|inches|cm)\b/,
    /\b(processor|cpu|gpu|ram|memory|storage|ssd|hdd)\b/,
    /\b(camera|megapixel|mp|aperture|f\/[0-9])\b/,
    /\b(connectivity|bluetooth|wifi|wi-fi|usb|hdmi|type-?c|jack|port)\b/,
    /\b(compatibility|compatible with|works with)\b/,
    /\b(ingredients?|nutrition|allergens?)\b/,
    /\b(scent|fragrance|flavor|taste|smell)\b/,
    /\b(what colors?|colors? available)\b/,
    /\b(what sizes?|size chart|sizes? available)\b/,
    /\b(what'?s (in|inside) the (box|package))\b/,
    /\b(tell me (more|about))\b/,
    /\b(more (info|information|details))\b/,
    /\b(what is it|what are they|what is the)\b/,
    /\b(features?|highlights?)\b/,
    /\b(warranty|guarantee)\b/,
    /\b(return(s|ing)? policy|shipping policy)\b/,
  ];
  return patterns.some((re) => re.test(t));
};

const runCatalogTool = async (writeClient, args) => {
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  const includeDetails = Boolean(args?.include_details);
  // When details are requested, fetch the full product row + richer seller.
  const productSelect = includeDetails
    ? `id,title,price,discount,thumbnail,thumbnails,category,rating,total_ratings,sold_count,description,specifications,sizes,colors,tags,weight,weight_unit,shipping_fee,compare_at_price,sku,vendor,seller_id(id,name,avatar,rating,total_ratings,badges,store_description,is_verified,location,slug)`
    : `id,title,price,discount,thumbnail,thumbnails,category,tags,rating,total_ratings,sold_count,seller_id(id,name,avatar,rating,total_ratings,badges,is_verified,slug)`;

  const { phrase, tokens } = tokenizeCatalogQuery(args?.query);
  const hasTextQuery = phrase.length > 0;

  // Fetch a wider window when we're going to re-rank. Capped at 50 rows to
  // keep the call bounded; the local ranker slices back down to `limit`.
  const fetchLimit = hasTextQuery ? Math.min(limit * 3, 50) : limit;

  let query = writeClient
    .from("express_products")
    .select(productSelect)
    .eq("status", "active")
    .limit(fetchLimit);

  // ── Tags-first search ────────────────────────────────────────────────
  // OR-match across three dimensions for every significant token: the
  // `tags` array (highest priority, listed FIRST in the OR chain), the
  // `title`, and the `category`. PostgREST's `or` is a SQL OR across the
  // listed expressions, so listing tags first keeps the planner happy
  // and lets us do the final ranking in JS.
  if (hasTextQuery) {
    const orClauses: string[] = [];
    for (const tok of tokens) {
      const safe = String(tok).replace(/[%(),]/g, " ").trim();
      if (!safe) continue;
      // `cs` is the array-contains operator on a text[] column — matches
      // when the array contains this exact token.
      orClauses.push(`tags.cs.{${safe}}`);
      orClauses.push(`title.ilike.%${safe}%`);
      orClauses.push(`category.ilike.%${safe}%`);
    }
    if (orClauses.length) query = query.or(orClauses.join(","));
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

  let rows = data || [];
  if (hasTextQuery) {
    // Re-rank: tag overlap first, then phrase title hits, then per-token
    // title hits, then per-token category hits. The DB sort is the
    // tie-breaker (stable sort preserves it).
    const scored = rows
      .map((p: any, idx: number) => ({
        p,
        idx,
        score: scoreProductForCatalogQuery(p, phrase, tokens),
      }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx))
      .map((x) => x.p);
    rows = scored.slice(0, limit);
  } else {
    rows = rows.slice(0, limit);
  }

  const products = rows.map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price || 0),
    discount: Number(p.discount || 0),
    thumbnail: p.thumbnail || null,
    thumbnails: p.thumbnails || null,
    category: p.category || null,
    rating: Number(p.rating || 0),
    total_ratings: p.total_ratings ?? 0,
    sold_count: p.sold_count ?? 0,
    // Embedded seller (id/name/avatar) — same shape the local planner's
    // queryCatalog returns, so the product cards render identically.
    seller_id: p.seller_id || null,
    // Optional rich fields when include_details is on.
    ...(includeDetails
      ? {
          description: p.description || null,
          specifications: p.specifications || null,
          sizes: Array.isArray(p.sizes) ? p.sizes : [],
          colors: Array.isArray(p.colors) ? p.colors : [],
          tags: Array.isArray(p.tags) ? p.tags : [],
          weight: p.weight != null ? Number(p.weight) : null,
          weight_unit: p.weight_unit || "kg",
          shipping_fee: Number(p.shipping_fee || 0),
          compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
          sku: p.sku || null,
          vendor: p.vendor || null,
        }
      : {}),
  }));

  return {
    products,
    summary:
      products.length === 0
        ? "No matching products found."
        : includeDetails
          ? // When full details are requested (or auto-detected from the
            // query), include the description, full specifications, sizes,
            // colors, weight, and seller info inline so the model can
            // answer any question without a follow-up tool call.
            `${products.length} product(s) with full details:\n\n` +
            products
              .map((p, i) => `[${i + 1}] ${buildRichProductSummary(p)}`)
              .join("\n\n---\n\n")
          : // Lightweight summary: just enough for the model to compose a
            // short intro. Product cards are rendered by the chat UI with
            // the full info, so the model doesn't need to repeat it.
            `${products.length} product(s): ${products
              .map(
                (p) =>
                  `${p.title} — GH₵${p.price}${p.discount > 0 ? ` (${p.discount}% off)` : ""}` +
                  (p.seller_id?.name ? ` — sold by ${p.seller_id.name}` : ""),
              )
              .join("; ")}`,
  };
};

/* ── get_product_details ──────────────────────────────────────────────── */
const runGetProductDetails = async (writeClient, args) => {
  const productId = String(args?.product_id || "").trim();
  if (!productId) {
    return { ok: false, status: "error", message: "product_id is required." };
  }
  const { data, error } = await writeClient
    .from("express_products")
    .select(
      `id,title,slug,sku,vendor,description,price,compare_at_price,discount,quantity,track_inventory,allow_backorder,weight,weight_unit,shipping_fee,sizes,colors,variants,specifications,tags,category,category_id,rating,total_ratings,sold_count,view_count,is_featured,is_preorder,thumbnail,thumbnails,seller_id(id,name,slug,avatar,cover_image,rating,total_ratings,badges,store_description,description,location,is_verified,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,fulfillment_speed,default_shipping_fee,account_verified)`,
    )
    .eq("id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { ok: false, status: "error", message: error.message };
  if (!data) {
    return {
      ok: false,
      status: "not_found",
      message: `No active product with id ${productId}.`,
    };
  }
  // Use the rich, model-readable summary that includes the FULL description
  // (up to 600 chars), every specification as a key/value block, sizes,
  // colors, weight, and the seller profile — so the model can answer any
  // question about the product (specs, dimensions, materials, battery,
  // etc.) without a follow-up tool call.
  const summary = buildRichProductSummary(data);
  return { ok: true, status: "done", product: data, summary };
};

/* ── get_store_details ────────────────────────────────────────────────── */
const runGetStoreDetails = async (writeClient, args) => {
  const sellerId = String(args?.seller_id || "").trim();
  if (!sellerId) {
    return { ok: false, status: "error", message: "seller_id is required." };
  }
  const { data, error } = await writeClient
    .from("express_sellers")
    .select(
      `id,name,slug,email,phone,avatar,cover_image,description,store_description,location,address,rating,total_ratings,fulfillment_speed,is_verified,is_active,created_at,badges,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,default_shipping_fee,account_verified`,
    )
    .eq("id", sellerId)
    .maybeSingle();
  if (error) return { ok: false, status: "error", message: error.message };
  if (!data) {
    return {
      ok: false,
      status: "not_found",
      message: `No store with id ${sellerId}.`,
    };
  }
  const summary =
    `${data.name}` +
    (data.is_verified ? " (verified)" : "") +
    ` — rating ${Number(data.rating || 0).toFixed(1)}★ (${data.total_ratings || 0} reviews)` +
    (data.location ? ` — based in ${data.location}` : "") +
    (data.store_description
      ? `. ${String(data.store_description).slice(0, 200)}${String(data.store_description).length > 200 ? "…" : ""}`
      : ".");
  return { ok: true, status: "done", store: data, summary };
};

/* ── get_store_products ───────────────────────────────────────────────── */
const runGetStoreProducts = async (writeClient, args) => {
  const sellerId = String(args?.seller_id || "").trim();
  if (!sellerId) {
    return { ok: false, status: "error", message: "seller_id is required." };
  }
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  const page = Math.max(1, parseInt(args?.page, 10) || 1);
  const offset = (page - 1) * limit;

  let query = writeClient
    .from("express_products")
    .select(
      "id,title,price,discount,thumbnail,thumbnails,category,rating,total_ratings,sold_count",
    )
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .range(offset, offset + limit - 1);

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
  if (error) return { ok: false, status: "error", message: error.message };

  const products = (data || []).map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price || 0),
    discount: Number(p.discount || 0),
    thumbnail: p.thumbnail || null,
    thumbnails: p.thumbnails || null,
    category: p.category || null,
    rating: Number(p.rating || 0),
    total_ratings: p.total_ratings ?? 0,
    sold_count: p.sold_count ?? 0,
    seller_id: sellerId,
  }));

  return {
    ok: true,
    status: "done",
    seller_id: sellerId,
    page,
    count: products.length,
    products,
    summary:
      products.length === 0
        ? `No active products found for store ${sellerId} on page ${page}.`
        : `${products.length} product(s) from this store (page ${page}): ${products
            .map(
              (p) =>
                `${p.title} — GH₵${p.price}${p.discount > 0 ? ` (${p.discount}% off)` : ""}`,
            )
            .join("; ")}`,
  };
};

/* ── search_stores ────────────────────────────────────────────────────── */
const runSearchStores = async (writeClient, args) => {
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  let query = writeClient
    .from("express_sellers")
    .select(
      "id,name,slug,avatar,store_description,rating,total_ratings,badges,location,is_verified,is_active",
    )
    .eq("is_active", true)
    .order("rating", { ascending: false })
    .limit(limit);

  if (args?.query) {
    const safe = String(args.query).replace(/[%,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `name.ilike.%${safe}%,store_description.ilike.%${safe}%,description.ilike.%${safe}%`,
      );
    }
  }
  if (args?.location) {
    query = query.ilike("location", `%${String(args.location).trim()}%`);
  }
  if (Number.isFinite(Number(args?.minRating))) {
    query = query.gte("rating", Number(args.minRating));
  }
  if (args?.verifiedOnly === true) {
    query = query.eq("is_verified", true);
  }

  const { data, error } = await query;
  if (error) return { ok: false, status: "error", message: error.message };

  const stores = (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug || null,
    avatar: s.avatar || null,
    store_description: s.store_description || null,
    rating: Number(s.rating || 0),
    total_ratings: s.total_ratings ?? 0,
    badges: Array.isArray(s.badges) ? s.badges : [],
    location: s.location || null,
    is_verified: Boolean(s.is_verified),
  }));

  return {
    ok: true,
    status: "done",
    count: stores.length,
    stores,
    summary:
      stores.length === 0
        ? "No matching stores found."
        : `${stores.length} store(s): ${stores
            .map(
              (s) =>
                `${s.name}${s.is_verified ? " (verified)" : ""} — ${Number(s.rating || 0).toFixed(1)}★ (${s.total_ratings || 0} reviews)` +
                (s.location ? ` — ${s.location}` : ""),
            )
            .join("; ")}`,
  };
};

/* ── get_product_reviews ─────────────────────────────────────────────── */
const runGetProductReviews = async (writeClient, args) => {
  const productId = String(args?.product_id || "").trim();
  if (!productId) {
    return { ok: false, status: "error", message: "product_id is required." };
  }
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  const page = Math.max(1, parseInt(args?.page, 10) || 1);
  const offset = (page - 1) * limit;
  const sort = String(args?.sort || "newest").toLowerCase();
  const minRating = Number.isFinite(Number(args?.min_rating))
    ? Number(args.min_rating)
    : null;

  let q = writeClient
    .from("express_reviews")
    .select(
      "id, product_id, user_id, rating, comment, created_at, images, helpful_count, is_verified_purchase, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
    )
    .eq("product_id", productId)
    .eq("is_approved", true)
    .range(offset, offset + limit - 1);
  if (minRating != null) q = q.gte("rating", minRating);
  switch (sort) {
    case "helpful":
      q = q.order("helpful_count", { ascending: false });
      break;
    case "rating_high":
      q = q.order("rating", { ascending: false });
      break;
    case "rating_low":
      q = q.order("rating", { ascending: true });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }
  const { data, error } = await q;
  if (error)
    return { ok: false, status: "error", message: error.message };
  const reviews = data || [];

  // Aggregate.
  const { data: agg } = await writeClient
    .from("express_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("is_approved", true);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  (agg || []).forEach((r) => {
    const star = Math.round(Number(r.rating) || 0);
    if (star >= 1 && star <= 5) distribution[star] += 1;
    sum += Number(r.rating) || 0;
  });
  const total = (agg || []).length;
  const average = total > 0 ? sum / total : 0;
  return {
    ok: true,
    status: "done",
    reviews,
    total,
    average: Number(average.toFixed(2)),
    distribution,
    summary:
      total === 0
        ? `No approved reviews yet for this product.`
        : `${total} review(s), average ${average.toFixed(1)}★ — 5★ ${distribution[5]}, 4★ ${distribution[4]}, 3★ ${distribution[3]}, 2★ ${distribution[2]}, 1★ ${distribution[1]}.`,
  };
};

/* ── get_store_reviews ───────────────────────────────────────────────── */
const runGetStoreReviews = async (writeClient, args) => {
  const sellerId = String(args?.seller_id || "").trim();
  if (!sellerId) {
    return { ok: false, status: "error", message: "seller_id is required." };
  }
  const limit = Math.min(8, Math.max(1, parseInt(args?.limit, 10) || 5));
  const page = Math.max(1, parseInt(args?.page, 10) || 1);
  const offset = (page - 1) * limit;
  const minRating = Number.isFinite(Number(args?.min_rating))
    ? Number(args.min_rating)
    : null;

  const { data: products, error: prodErr } = await writeClient
    .from("express_products")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("status", "active");
  if (prodErr)
    return { ok: false, status: "error", message: prodErr.message };
  const productIds = (products || []).map((p) => p.id);
  if (productIds.length === 0) {
    return {
      ok: true,
      status: "done",
      reviews: [],
      total: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      summary: "This store has no active products to review.",
    };
  }

  let q = writeClient
    .from("express_reviews")
    .select(
      "id, product_id, user_id, rating, comment, created_at, helpful_count, is_verified_purchase, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
    )
    .in("product_id", productIds)
    .eq("is_approved", true)
    .range(offset, offset + limit - 1);
  if (minRating != null) q = q.gte("rating", minRating);
  q = q.order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error)
    return { ok: false, status: "error", message: error.message };

  // Aggregate
  const { data: agg } = await writeClient
    .from("express_reviews")
    .select("rating")
    .in("product_id", productIds)
    .eq("is_approved", true);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  (agg || []).forEach((r) => {
    const star = Math.round(Number(r.rating) || 0);
    if (star >= 1 && star <= 5) distribution[star] += 1;
    sum += Number(r.rating) || 0;
  });
  const total = (agg || []).length;
  const average = total > 0 ? sum / total : 0;
  return {
    ok: true,
    status: "done",
    reviews: data || [],
    total,
    average: Number(average.toFixed(2)),
    distribution,
    summary:
      total === 0
        ? `No approved reviews yet for this store.`
        : `${total} review(s) across ${productIds.length} product(s), average ${average.toFixed(1)}★ — 5★ ${distribution[5]}, 4★ ${distribution[4]}, 3★ ${distribution[3]}, 2★ ${distribution[2]}, 1★ ${distribution[1]}.`,
  };
};

const callOpenRouter = (apiKey, model, chatMessages, extra = {}) =>
  fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://expressmart.app",
      "X-Title": "tagit Assistant",
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

    // Auto-flip `include_details: true` for the current turn when the
    // user's message asks about product CONTENTS (specs, description,
    // dimensions, weight, materials, battery, etc.). The auto-detect
    // helper lives next to runCatalogTool so the LLM doesn't have to
    // remember to set the flag — most model calls forget, leaving the
    // model unable to answer "what's the battery life?" with the
    // search response alone.
    const autoIncludeDetails = queryNeedsFullDetails(message);

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

        // Server-executable tools. The model can chain any of them across
        // iterations; their results are fed back as `tool` messages.
        if (name === "search_products" || name === "filter_catalog") {
          try {
            // Honor the model's explicit include_details flag, or our
            // server-side auto-detect (so a query like "what's the
            // battery life of these earbuds?" gets the full description
            // and specs back in a single turn, not a teaser).
            const effectiveArgs = autoIncludeDetails
              ? { ...args, include_details: true }
              : args;
            const result = await runCatalogTool(writeClient, effectiveArgs);
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
        if (name === "get_product_details") {
          try {
            const result = await runGetProductDetails(writeClient, args);
            // Surface a single rich product card to the chat when found.
            if (result?.ok && result.product) {
              products.push({
                id: result.product.id,
                title: result.product.title,
                price: Number(result.product.price || 0),
                discount: Number(result.product.discount || 0),
                thumbnail: result.product.thumbnail || null,
                thumbnails: result.product.thumbnails || null,
                category: result.product.category || null,
                rating: Number(result.product.rating || 0),
                total_ratings: result.product.total_ratings ?? 0,
                sold_count: result.product.sold_count ?? 0,
                seller_id: result.product.seller_id || null,
              });
            }
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no result)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `get_product_details failed: ${e?.message || e}`,
            });
          }
          continue;
        }
        if (name === "get_store_details") {
          try {
            const result = await runGetStoreDetails(writeClient, args);
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no result)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `get_store_details failed: ${e?.message || e}`,
            });
          }
          continue;
        }
        if (name === "get_store_products") {
          try {
            const result = await runGetStoreProducts(writeClient, args);
            if (Array.isArray(result?.products)) {
              products.push(...result.products);
            }
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no result)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `get_store_products failed: ${e?.message || e}`,
            });
          }
          continue;
        }
        if (name === "search_stores") {
          try {
            const result = await runSearchStores(writeClient, args);
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no result)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `search_stores failed: ${e?.message || e}`,
            });
          }
          continue;
        }
        if (name === "get_product_reviews") {
          try {
            const result = await runGetProductReviews(writeClient, args);
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no reviews)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `get_product_reviews failed: ${e?.message || e}`,
            });
          }
          continue;
        }
        if (name === "get_store_reviews") {
          try {
            const result = await runGetStoreReviews(writeClient, args);
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result?.summary || result?.message || "(no reviews)",
            });
          } catch (e) {
            chatMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `get_store_reviews failed: ${e?.message || e}`,
            });
          }
          continue;
        }

        // Client-side tools — the app executes them after this response.
        // (navigate_to_store, navigate_to_product, tap_element, go_back,
        // list_screens, get_screen_info, list_tap_targets,
        // point_to_element, add_to_cart, navigate_to_page, read_screen,
        // find_on_screen, scroll, scroll_to, wait_for, get_app_state,
        // dismiss_overlay.)
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