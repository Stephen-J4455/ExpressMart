// ── ExpressMart AI Assistant service ─────────────────────────────────────────
// Implements the "agent loop" for the in-app AI assistant:
//
//   user message → planTurn() → tool calls → executeToolCall() → results
//
// Tool schemas are expressed in the OpenAI function-calling format so they can
// be posted verbatim to an LLM endpoint (Supabase Edge Function / OpenAI /
// Anthropic). When no LLM endpoint is configured, a local rule-based planner
// (planLocalTurn) produces the exact same tool-call shape, so the whole
// generative-UI pipeline — product cards, navigation, screen grounding — works
// fully offline and can be swapped to a real LLM by replacing planTurn().

import { supabase, callEdgeFunction } from "../lib/supabase";

// ── Navigable pages registry ─────────────────────────────────────────────────
// "Main" is the bottom-tab navigator; nested tabs are reached via params.

export const PAGE_ROUTES = {
  home: { route: "Main", params: { screen: "Home" }, label: "Home" },
  feed: { route: "Main", params: { screen: "Feed" }, label: "Feed" },
  chats: { route: "Main", params: { screen: "Chats" }, label: "Chats" },
  cart: { route: "Main", params: { screen: "Cart" }, label: "Cart" },
  account: { route: "Main", params: { screen: "Account" }, label: "your Account" },
  profile: { route: "Main", params: { screen: "Account" }, label: "your profile" },
  checkout: { route: "Checkout", params: {}, label: "Checkout" },
  orders: { route: "Orders", params: {}, label: "your Orders" },
  wishlist: { route: "Wishlist", params: {}, label: "your Wishlist" },
  notifications: { route: "Notifications", params: {}, label: "Notifications" },
  addresses: { route: "Addresses", params: {}, label: "your Addresses" },
  payments: { route: "Payments", params: {}, label: "Payments" },
  settings: { route: "Settings", params: {}, label: "Settings" },
  security: { route: "Security", params: {}, label: "Security" },
  search: { route: "Search", params: {}, label: "Search" },
  categories: { route: "Categories", params: {}, label: "Categories" },
  stores: { route: "Stores", params: {}, label: "Stores" },
  help: { route: "HelpSupport", params: {}, label: "Help & Support" },
};

// ── Grounding element registry ───────────────────────────────────────────────
// Keys map to refs registered by screens via useGrounding(key).

export const GROUNDING_ELEMENTS = {
  "checkout.promoCode": {
    label: "Promo code box",
    screen: "checkout",
    hint: "Enter a coupon code here and tap Apply before paying.",
    keywords: ["coupon", "promo code", "promocode", "discount code", "voucher"],
  },
  "checkout.payButton": {
    label: "Pay Now button",
    screen: "checkout",
    hint: "Tap this to pay for your order securely via Paystack.",
    keywords: [
      "checkout button",
      "pay button",
      "pay now",
      "place order",
      "payment button",
    ],
  },
  "checkout.orderSummary": {
    label: "Order Summary",
    screen: "checkout",
    hint: "This is a breakdown of the items, fees and total for your order.",
    keywords: ["order summary", "order total", "order breakdown", "receipt"],
  },
  "cart.checkoutButton": {
    label: "Proceed to Checkout button",
    screen: "cart",
    hint: "Tap this to move your cart into checkout.",
    keywords: ["cart checkout", "proceed to checkout", "cart button"],
  },
  "ai.inputBar": {
    label: "AI chat input",
    screen: null,
    hint: "Type anything here — I can search products, navigate and point at the UI.",
    keywords: ["chat box", "message box", "chat input", "type here"],
  },
};

// ── Tool schemas (OpenAI function-calling format) ────────────────────────────

export const ASSISTANT_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the ExpressMart product catalog by a free-text query. Returns a structured array of products that the chat UI renders as interactive product cards.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query, e.g. 'wireless headphones'.",
          },
          limit: {
            type: "integer",
            description: "Max number of products to return (1-8).",
          },
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
        "Filter the product catalog with structured constraints. Use when the user mentions price caps, ratings, categories, tags or sorting instead of a plain query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional text to combine with the filters." },
          category: { type: "string", description: "Category name, e.g. 'Electronics'." },
          maxPrice: { type: "number", description: "Maximum effective price." },
          minPrice: { type: "number", description: "Minimum effective price." },
          minRating: { type: "number", description: "Minimum rating (0-5)." },
          tag: { type: "string", description: "A single tag to require, e.g. 'flash-sale'." },
          sort: {
            type: "string",
            enum: ["price_asc", "price_desc", "rating", "popular", "newest"],
            description: "Sort order for results.",
          },
          limit: { type: "integer", description: "Max number of products (1-8)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description:
        "Add a product to the user's global cart. Only call this when the user explicitly asks to add a specific, already-known product to the cart.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "The product id." },
          quantity: { type: "integer", description: "Quantity to add (default 1)." },
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
        "Navigate the user to a screen inside the ExpressMart app. Use for requests like 'take me to my checkout' or 'show my profile'.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: Object.keys(PAGE_ROUTES),
            description: "The destination page key.",
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
        "Ground a UI element on screen: renders an animated pointer / pulsing highlight over the element. Use for 'where is X' or 'point to X' questions about the interface.",
      parameters: {
        type: "object",
        properties: {
          element: {
            type: "string",
            enum: Object.keys(GROUNDING_ELEMENTS),
            description: "The registered UI element key.",
          },
        },
        required: ["element"],
      },
    },
  },
];

// ── Tool executors ───────────────────────────────────────────────────────────

const clampLimit = (limit) => Math.min(Math.max(Number(limit) || 4, 1), 8);

const PRODUCT_SELECT =
  "id,title,price,discount,compare_at_price,rating,total_ratings,thumbnail,thumbnails,category,tags,quantity,status,seller_id(id,name,avatar,rating,total_ratings)";

/**
 * search_products / filter_catalog implementation against Supabase.
 * Mirrors the query strategy used by SearchResultsScreen (direct DB search).
 */
export const queryCatalog = async (args = {}) => {
  const {
    query,
    category,
    maxPrice,
    minPrice,
    minRating,
    tag,
    sort = "popular",
    limit = 4,
  } = args;

  if (!supabase) {
    return { products: [], note: "The catalog is unavailable right now." };
  }

  let dbQuery = supabase
    .from("express_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true);

  if (query) dbQuery = dbQuery.ilike("title", `%${query}%`);
  if (category) dbQuery = dbQuery.ilike("category", `%${category}%`);
  if (tag) dbQuery = dbQuery.contains("tags", [tag]);
  if (minRating) dbQuery = dbQuery.gte("rating", Number(minRating));
  if (minPrice != null) dbQuery = dbQuery.gte("price", Number(minPrice));
  if (maxPrice != null) dbQuery = dbQuery.lte("price", Number(maxPrice));

  const orderMap = {
    price_asc: { col: "price", asc: true },
    price_desc: { col: "price", asc: false },
    rating: { col: "rating", asc: false },
    newest: { col: "created_at", asc: false },
    popular: { col: "sold_count", asc: false },
  };
  const order = orderMap[sort] || orderMap.popular;
  dbQuery = dbQuery.order(order.col, { ascending: order.asc });

  const { data, error } = await dbQuery.range(0, clampLimit(limit) - 1);
  if (error) {
    console.warn("[AIAssistant] catalog query failed:", error.message);
    return { products: [], note: "I couldn't reach the catalog just now." };
  }
  return { products: data || [], note: null };
};

/**
 * navigate_to_page executor. `navigateTo(route, params)` is supplied by the
 * caller (the assistant screen) and bound to the app's navigation prop.
 */
export const executeNavigate = (pageKey, navigateTo) => {
  const page = PAGE_ROUTES[pageKey];
  if (!page) {
    return { ok: false, message: `I don't know the "${pageKey}" page yet.` };
  }
  try {
    navigateTo(page.route, page.params);
    return { ok: true, message: `Taking you to ${page.label}.`, page };
  } catch (e) {
    console.warn("[AIAssistant] navigate failed:", e);
    return { ok: false, message: "I couldn't open that screen." };
  }
};

/**
 * point_to_element executor — resolves the element metadata; the actual
 * overlay rendering is driven by AIAssistantContext (groundingTarget).
 */
export const executePointTo = (elementKey) => {
  const element = GROUNDING_ELEMENTS[elementKey];
  if (!element) {
    return { ok: false, message: `I can't find a "${elementKey}" element.` };
  }
  return { ok: true, message: element.hint, element: elementKey, meta: element };
};

// ── Local intent planner (LLM fallback) ──────────────────────────────────────
// Produces { reply, toolCalls: [{ name, args }] } — the same contract a real
// LLM would return. Replace planTurn with a remote call to upgrade.

const NAV_VERBS =
  /\b(take me|go to|navigate|open|show me|show my|bring me|jump to|direct me|view my)\b/i;
const GROUND_VERBS =
  /\b(where is|where's|point to|point at|locate|highlight|show me on (the )?screen|find on (the )?screen|which one is)\b/i;
const PRODUCT_VERBS =
  /\b(find|search|look(ing)? for|show|buy|shop|get|recommend|suggest|browse|i want|i need|do you have|looking)\b/i;

const PRICE_RE =
  /(?:under|below|less than|cheaper than|max(?:imum)? of?|up to)\s*(?:gh[₵c]?\.?\s*)?(\d+(?:\.\d+)?)/i;
const MIN_PRICE_RE =
  /(?:above|over|more than|at least|from)\s*(?:gh[₵c]?\.?\s*)?(\d+(?:\.\d+)?)/i;
const RATING_RE = /(\d(?:\.\d)?)\s*(?:\+|stars?\b|star rating|and up)/i;
const LIMIT_RE = /\b(\d{1,2})\s+(?:items|products|options|results)\b/i;

const stripPricePhrases = (text) =>
  text
    .replace(PRICE_RE, " ")
    .replace(MIN_PRICE_RE, " ")
    .replace(RATING_RE, " ")
    .replace(
      /\b(under|below|less than|cheaper than|max(?:imum)? of?|up to|above|over|more than|at least|from)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

const matchPageKey = (text) => {
  const t = text.toLowerCase();
  // Most specific first.
  if (/\bcheck\s?-?out\b/.test(t)) return "checkout";
  if (/\bpay(ment)?s?\b/.test(t) && !/\bmethod\b/.test(t)) return "payments";
  if (/\bmy (order|orders)\b|\border (history|status)\b|\btrack\b/.test(t))
    return "orders";
  if (/\bwish ?list\b|\bsaved (items|products)\b|\bfavourites\b|\bfavorites\b/.test(t))
    return "wishlist";
  if (/\bnotif(ication|ications|s)\b/.test(t)) return "notifications";
  if (/\baddress(es)?\b/.test(t)) return "addresses";
  if (/\bprofile\b|\baccount\b/.test(t)) return "account";
  if (/\bcart\b|\bbasket\b/.test(t)) return "cart";
  if (/\bhome\b/.test(t)) return "home";
  if (/\bfeed\b|\breels?\b|\bvideos?\b/.test(t)) return "feed";
  if (/\bchats?\b|\bmessages?\b/.test(t)) return "chats";
  if (/\bsettings?\b|\bpreferences\b/.test(t)) return "settings";
  if (/\bsecur(ity|e)\b/.test(t)) return "security";
  if (/\bcategor(y|ies)\b/.test(t)) return "categories";
  if (/\bstores?\b/.test(t)) return "stores";
  if (/\bhelp\b|\bsupport\b/.test(t)) return "help";
  if (/\bsearch\b/.test(t)) return "search";
  return null;
};

const matchElementKey = (text) => {
  const t = text.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [key, meta] of Object.entries(GROUNDING_ELEMENTS)) {
    for (const kw of meta.keywords) {
      if (t.includes(kw) && kw.length > bestScore) {
        best = key;
        bestScore = kw.length;
      }
    }
  }
  return best;
};

const extractQuery = (text) => {
  let q = stripPricePhrases(text);
  // Remove intent scaffolding words so the DB gets clean search terms.
  q = q
    .replace(
      /\b(find|search( for)?|look(ing)? for|show me|buy|shop( for)?|get me|get|recommend|suggest|browse|i (want|need|would like)|do you have|any|please|can you|for me|some|me)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return q;
};

const parseFilters = (text) => {
  const filters = {};
  const maxP = text.match(PRICE_RE);
  if (maxP) filters.maxPrice = parseFloat(maxP[1]);
  const minP = text.match(MIN_PRICE_RE);
  if (minP) filters.minPrice = parseFloat(minP[1]);
  const rating = text.match(RATING_RE);
  if (rating) filters.minRating = parseFloat(rating[1]);
  if (/\bcheapest\b|\blowest price\b/i.test(text)) filters.sort = "price_asc";
  else if (/\bmost expensive\b|\bhighest price\b/i.test(text))
    filters.sort = "price_desc";
  else if (/\bbest rated\b|\btop rated\b|\bhighest rated\b/i.test(text))
    filters.sort = "rating";
  else if (/\bnew(est)? arrivals\b|\bnewest\b/i.test(text)) filters.sort = "newest";
  else if (/\bpopular\b|\btrending\b|\bbest.?sell/i.test(text)) filters.sort = "popular";
  const limit = text.match(LIMIT_RE);
  if (limit) filters.limit = parseInt(limit[1], 10);
  return filters;
};

const GREETING_RE =
  /^(hi|hello|hey|yo|good (morning|afternoon|evening)|how far|sup|what'?s up)\b[\s!.,]*$/i;
const HELP_RE =
  /\b(what can you do|help me|how do (you|i) work|capabilities|who are you)\b/i;
const DEALS_RE = /\b(deals?|discounts?|on sale|sale items?|offers?|cheap things)\b/i;

/**
 * Local rule-based planner. Returns the same shape as an LLM tool-call turn:
 * { reply, toolCalls: [{ name, args }] }.
 */
export const planLocalTurn = (text) => {
  const t = (text || "").trim();
  const lower = t.toLowerCase();

  // 1. Greetings
  if (GREETING_RE.test(lower)) {
    return {
      reply:
        "Hey! 👋 I'm your ExpressMart assistant. I can find products, add them to your cart, take you to any screen, and point at things on the current page. What are we shopping for?",
      toolCalls: [],
    };
  }

  // 2. Capability questions
  if (HELP_RE.test(lower)) {
    return {
      reply:
        "Here's what I can do:\n• 🛍️ Search the catalog — “find wireless earbuds under 200”\n• 🛒 Add to cart — tap “Add” on any card I show you\n• 🧭 Navigate — “take me to my checkout”\n• 🎯 Point at the UI — “where is my coupon code box?”",
      toolCalls: [],
    };
  }

  // 3. Grounding ("where is my coupon code box?")
  const elementKey = matchElementKey(lower);
  if (elementKey && (GROUND_VERBS.test(lower) || lower.length < 32)) {
    const meta = GROUNDING_ELEMENTS[elementKey];
    const toolCalls = [];
    // If the element lives on another screen, navigate there first so the
    // pointer has something to lock onto.
    if (meta.screen) {
      toolCalls.push({ name: "navigate_to_page", args: { page: meta.screen } });
    }
    toolCalls.push({ name: "point_to_element", args: { element: elementKey } });
    return {
      reply: `${meta.label} — ${meta.hint} Highlighting it for you now. ✨`,
      toolCalls,
    };
  }

  // 4. Navigation ("take me to my checkout")
  if (NAV_VERBS.test(lower)) {
    const pageKey = matchPageKey(lower);
    if (pageKey) {
      const page = PAGE_ROUTES[pageKey];
      return {
        reply: `On it — opening ${page.label} for you. 🧭`,
        toolCalls: [{ name: "navigate_to_page", args: { page: pageKey } }],
      };
    }
    // No page keyword — fall through to the other intents (e.g.
    // "show me today's deals" is a product intent, not navigation).
  }

  // 5. Deals shortcut → filter catalog by popularity under GH₵50
  if (DEALS_RE.test(lower)) {
    return {
      reply: "Here are some great deals I found for you. 🏷️",
      toolCalls: [
        { name: "filter_catalog", args: { sort: "popular", maxPrice: 50, limit: 4 } },
      ],
    };
  }

  // 6. Product search / filter ("find headphones under 200")
  if (PRODUCT_VERBS.test(lower) || PRICE_RE.test(lower)) {
    const filters = parseFilters(t);
    const query = extractQuery(t);
    const hasFilters = Object.keys(filters).length > 0;
    if (query || hasFilters) {
      const toolName = hasFilters ? "filter_catalog" : "search_products";
      const args = hasFilters
        ? { query: query || undefined, ...filters }
        : { query };
      return {
        reply: query
          ? `Here's what I found for “${query}”. Tap “Add” on any card to drop it straight into your cart. 🛍️`
          : "Here's what matched your filters. 🛍️",
        toolCalls: [{ name: toolName, args }],
      };
    }
  }

  // 7. Fallback
  return {
    reply:
      "I can take you to: Home, Feed, Chats, Cart, Account, Checkout, Orders, Wishlist, Notifications, Addresses, Payments, Settings, Categories, Stores or Help — or just tell me what to shop for, like “find wireless earbuds under 200”. 🛍️",
    toolCalls: [],
  };
};

/**
 * planTurn — the agent planner. Posts the message + recent history to the
 * `ai-assistant` edge function, which runs an OpenRouter tool-calling loop
 * (model configured live from the Admin app via express_settings.ai_model):
 *
 *   • search_products / filter_catalog run server-side against the catalog
 *   • add_to_cart / navigate_to_page / point_to_element come back as
 *     `toolCalls` and are executed on-device by executeToolCall()
 *
 * Falls back to the offline rule-based planner when the function is not
 * deployed, OpenRouter is not configured, or the request fails — so the
 * assistant never hard-fails.
 */
export const planTurn = async (text, history = []) => {
  try {
    const data = await callEdgeFunction("ai-assistant", {
      message: text,
      history: (Array.isArray(history) ? history : [])
        .slice(-8)
        .map((m) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          text: m?.text || "",
        })),
    });

    if (data?.success && typeof data.reply === "string") {
      return { reply: data.reply, toolCalls: data.toolCalls || [] };
    }
    throw new Error(data?.error || "AI service unavailable");
  } catch (e) {
    console.warn(
      "[AIAssistant] remote planner unavailable, using local rules:",
      e?.message || e,
    );
    return planLocalTurn(text);
  }
};

// ── Tool dispatch ────────────────────────────────────────────────────────────
// ctx: { navigateTo(route, params), pointTo(elementKey), addProductToCart(product, qty) }

export const executeToolCall = async (call, ctx) => {
  const { name, args = {} } = call;
  try {
    switch (name) {
      case "search_products":
      case "filter_catalog": {
        const { products, note } = await queryCatalog(args);
        return {
          name,
          status: "done",
          label:
            name === "search_products" ? "Searched catalog" : "Filtered catalog",
          products,
          note,
        };
      }
      case "add_to_cart": {
        const product = ctx.resolveProduct?.(args.product_id);
        if (!product) {
          return {
            name,
            status: "error",
            label: "Add to cart",
            message: "I couldn't find that product to add.",
          };
        }
        await ctx.addProductToCart(product, args.quantity || 1);
        return {
          name,
          status: "done",
          label: "Added to cart",
          message: `Added “${product.title}” to your cart.`,
        };
      }
      case "navigate_to_page": {
        const result = executeNavigate(args.page, ctx.navigateTo);
        return {
          name,
          status: result.ok ? "done" : "error",
          label: `Navigate → ${PAGE_ROUTES[args.page]?.label || args.page}`,
          message: result.message,
        };
      }
      case "point_to_element": {
        const result = executePointTo(args.element);
        if (result.ok) ctx.pointTo(args.element);
        return {
          name,
          status: result.ok ? "done" : "error",
          label: `Pointing at ${result.meta?.label || args.element}`,
          message: result.message,
        };
      }
      default:
        return { name, status: "error", label: name, message: "Unknown tool." };
    }
  } catch (e) {
    console.warn(`[AIAssistant] tool ${name} failed:`, e);
    return { name, status: "error", label: name, message: "That action failed." };
  }
};
