// ── ExpressMart TagAI service ─────────────────────────────────────────
// Implements the "agent loop" for the in-app TagAI:
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
import { AGENT_TOOLS, AGENT_TOOL_NAMES } from "../tools/agentTools";

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
  wishlist: { route: "Collections", params: {}, label: "your Collections" },
  collections: { route: "Collections", params: {}, label: "your Collections" },
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
  "tagAI.inputBar": {
    label: "TagAI chat input",
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
        "Search the ExpressMart product catalog by a free-text query. Returns a structured array of products that the chat UI renders as interactive product cards. The catalog is ranked with product TAGS as the highest form of relevance: products whose `tags` array contains any of the query's significant words (e.g. 'wireless', 'flash-sale', 'organic') are returned first, followed by title matches and category matches. Multi-word queries (e.g. 'wireless earbuds') match if ANY token hits a tag, title or category.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query, e.g. 'wireless headphones' or 'flash-sale shoes'.",
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
        "Filter the product catalog with structured constraints. Use when the user mentions price caps, ratings, categories, tags or sorting instead of a plain query. When `query` is supplied, the same tag-first ranking used by search_products applies (tags are the highest form of relevance).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional text to combine with the filters — tag-first ranking applies." },
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
        "Point at ANYTHING in the app with an animated pointer / pulsing highlight. Three modes: (1) pass a registered key to spotlight the exact control — registered keys: checkout.promoCode, checkout.payButton, checkout.orderSummary, cart.checkoutButton, tagAI.inputBar; (2) pass an `item_id` discovered via read_screen to point at an indexed item; (3) for anything else, pass a free-form short name in 'element' plus 'label' (and optionally 'description' / 'shape' / 'direction' / 'size' / 'coords') and the app highlights that area of the current screen. If what the user asks about lives on another page, call navigate_to_page first.",
      parameters: {
        type: "object",
        properties: {
          element: {
            type: "string",
            description:
              "A registered grounding key (see above) OR any short identifier for the thing being pointed at (e.g. 'search bar', 'profile avatar', 'wishlist heart').",
          },
          item_id: {
            type: "string",
            description:
              "Optional. If you have an item id from read_screen, pass it here and the overlay will spotlight that exact on-screen item.",
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
            description:
              "Optional absolute window coordinates {x, y, w, h} for free-form targets.",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
            },
          },
        },
        // `element` is required by OpenAI's function-calling validator, but
        // the model can pass any short string (e.g. "custom", the same item
        // id, or a free-form name) when the real targeting comes from
        // `item_id` or `coords`. Our executor checks item_id first.
        required: ["element"],
      },
    },
  },
  // ── Product / store detail tools (server-executed, read-only) ──────────
  // Mirror of the edge-function TOOLS. These are normally executed by the
  // OpenRouter edge agent and returned to the app, but the JS service
  // implements them locally too so the offline rule-based planner can
  // answer the same questions.
  {
    type: "function",
    function: {
      name: "get_product_details",
      description:
        "Fetch a single product by id with full details: the complete description, the entire specifications map (every key→value pair the seller filled in), sizes, colors, weight, shipping fee, variants, tags, and the seller's profile (name, verified flag, rating, reviews, location, fulfillment speed). Use this whenever the user asks anything that depends on a product's contents — 'what are the specs', 'what's the battery life', 'what's it made of', 'how heavy is it', 'is it waterproof', 'what colors does it come in', 'tell me the dimensions', 'what's the return policy', 'is it in stock'. The tool summary contains the full description (up to 600 chars) and every specification as a key/value block, so the model can answer any follow-up question without another tool call.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
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
        "Fetch a single store (seller) by id with full profile, ratings, badges, social links, verification status.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
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
        "List a store's products. Same filter/sort/pagination as filter_catalog but scoped to one seller_id.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
          sort: {
            type: "string",
            enum: ["price_asc", "price_desc", "rating", "popular", "newest"],
          },
          maxPrice: { type: "number" },
          minPrice: { type: "number" },
          minRating: { type: "number" },
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
      name: "search_stores",
      description:
        "Search the store directory by name, location, rating, or verification.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          location: { type: "string" },
          minRating: { type: "number" },
          verifiedOnly: { type: "boolean" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_store",
      description: "Open a seller's storefront page (device-side).",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
        },
        required: ["seller_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_product",
      description: "Open a specific product detail page (device-side).",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
      },
    },
  },
  // ── Reviews / ratings ───────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_product_reviews",
      description:
        "Fetch approved reviews for a product, plus rating distribution. Use when the user asks 'what do people say about this?', 'show me the reviews', 'is this product any good?'.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          sort: {
            type: "string",
            enum: ["newest", "helpful", "rating_high", "rating_low"],
          },
          min_rating: { type: "integer", description: "Min stars (1-5)." },
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
        "Aggregate reviews across all of a store's products. Use when the user asks 'how are this store's reviews?' or 'show me the bad reviews of this seller'.",
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
  // ── Screen map + tap ────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_screens",
      description:
        "List every navigable screen in the app. Filter by role or query.",
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
      description:
        "Get the components, tap targets, and available tools of a specific screen.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
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
          screen: { type: "string", description: "Optional screen to navigate to first." },
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
  // ── New "agent has eyes" tools (client-side) ─────────────────────────────
  {
    type: "function",
    function: {
      name: "read_screen",
      description:
        "Return a snapshot of items currently registered against the active screen. Use to learn what is visible before pointing, scrolling, or picking a product.",
      parameters: {
        type: "object",
        properties: {
          region: { type: "string", enum: ["viewport", "all"] },
          max_items: { type: "integer" },
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
      name: "dismiss_overlay",
      description: "Dismiss the AI pointer overlay (or any open modal the agent opened).",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Tool executors ───────────────────────────────────────────────────────────

const clampLimit = (limit) => Math.min(Math.max(Number(limit) || 4, 1), 8);

const PRODUCT_SELECT =
  "id,title,price,discount,compare_at_price,rating,total_ratings,thumbnail,thumbnails,category,tags,quantity,status,track_inventory,allow_backorder,description,specifications,sizes,colors,weight,weight_unit,shipping_fee,slug,sku,vendor,seller_id(id,name,avatar,rating,total_ratings,badges,store_description,is_verified,location,slug,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,fulfillment_speed,default_shipping_fee,account_verified)";

// Tokens we strip from a free-text query before turning it into tag/search
// candidates. Keeps the ranker focused on real product attributes.
const QUERY_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "have", "i", "in", "is", "it", "its", "of", "on", "or",
  "that", "the", "this", "to", "was", "we", "were", "with", "you",
  "your", "me", "my", "our", "some", "any", "do", "does", "can",
  "could", "would", "should", "want", "need", "like", "look", "looking",
  "find", "search", "show", "buy", "get", "recommend", "suggest",
  "browse", "please", "cheap", "best", "top", "good", "great",
]);

/**
 * Tokenize a free-text query into a list of significant search terms, each of
 * which we treat as a potential product tag (plus the joined phrase for the
 * title/category fallback). Returns `{ phrase, tokens }` where `phrase` is
 * the original query trimmed of trailing whitespace and `tokens` is the
 * filtered, de-duped list of single-word candidates.
 */
const tokenizeQuery = (rawQuery) => {
  const phrase = String(rawQuery || "").trim();
  if (!phrase) return { phrase: "", tokens: [] };
  const tokens = Array.from(
    new Set(
      phrase
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w && w.length >= 2 && !QUERY_STOPWORDS.has(w)),
    ),
  );
  return { phrase, tokens };
};

/**
 * Compute a relevance score for a single product against a tokenized query.
 * Tags are the highest form: a product whose `tags` array contains any of the
 * query tokens (case-insensitive, exact match) gets a heavy boost per matching
 * tag. Title contains any token gets a smaller boost. Category contains any
 * token gets a smaller boost still. Products with zero matches fall back to a
 * low base score so they still surface in the result set.
 *
 * Score is intentionally additive and bounded so the same ranker works for
 * both single-word ("wireless") and multi-word ("wireless earbuds") queries.
 */
const scoreProductForQuery = (product, phrase, tokens) => {
  if (!product) return 0;
  const title = String(product.title || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  const tags = Array.isArray(product.tags)
    ? product.tags.map((t) => String(t || "").toLowerCase()).filter(Boolean)
    : [];

  // Tag overlap — the highest form. A product whose tags contain ANY of the
  // query tokens gets +10 per matching tag, +5 if ALL tokens match (a tag hit
  // for every query term is a near-perfect match).
  const matchedTags = new Set();
  for (const tok of tokens) {
    for (const tag of tags) {
      if (tag === tok || tag.includes(tok) || tok.includes(tag)) {
        matchedTags.add(tag);
      }
    }
  }
  let score = matchedTags.size * 10;
  if (tokens.length > 0 && tokens.every((t) =>
    tags.some((tag) => tag === t || tag.includes(t) || t.includes(tag)),
  )) {
    score += 5;
  }

  // Phrase hit on the title (the user's literal query appears in the title).
  if (phrase && title.includes(phrase.toLowerCase())) score += 8;

  // Per-token title hits — secondary signal after tags.
  for (const tok of tokens) {
    if (title.includes(tok)) score += 3;
  }

  // Per-token category hits — tertiary signal.
  for (const tok of tokens) {
    if (category.includes(tok)) score += 2;
  }

  // Any match at all? Otherwise return a small base so the product still
  // appears (it was returned by the DB because *something* matched the OR
  // clause) but it ranks last.
  if (score === 0) score = 0.1;

  return score;
};

/**
 * Shape a product's specifications into a human-readable multi-line block.
 * Mirrors the server-side `formatSpecifications` so the local fallback
 * (no LLM) returns the same shape the model would have received.
 */
const formatSpecifications = (specs) => {
  if (!specs) return "";
  if (Array.isArray(specs)) {
    return specs
      .map((row) => {
        const key = String(row?.key ?? row?.name ?? "").trim();
        const value = String(row?.value ?? "").trim();
        if (!key || !value) return "";
        return `${key}: ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof specs === "object") {
    return Object.entries(specs)
      .map(([k, v]) => {
        const value =
          typeof v === "string" || typeof v === "number"
            ? String(v)
            : v
              ? JSON.stringify(v)
              : "";
        if (!String(k).trim() || !value) return "";
        return `${k}: ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

/**
 * Build a rich, model-readable summary of a product. Same shape as the
 * server-side `buildRichProductSummary` in supabase/functions/ai-assistant
 * so the local fallback and the LLM-backed path return identical text.
 *
 * Includes: title, category, tags, full price/comparison, stock/shipping,
 * variants (sizes/colors/weight), the FULL description (up to 600 chars),
 * every specification as a key/value block, and the seller profile.
 */
const buildRichProductSummary = (product) => {
  if (!product) return "";
  const seller = product.seller_id || {};
  const lines = [];

  const price = Number(product.price || 0);
  const compareAt =
    product.compare_at_price != null ? Number(product.compare_at_price) : null;
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

  const stockBits = [];
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

  const description = String(product.description || "").trim();
  if (description) {
    const truncated =
      description.length > 600 ? `${description.slice(0, 600)}…` : description;
    lines.push(`\nDescription:\n${truncated}`);
  }

  const specs = formatSpecifications(product.specifications);
  if (specs) {
    lines.push(`\nSpecifications:\n${specs}`);
  }

  if (seller?.name) {
    const sellerBits = [`Seller: ${seller.name}`];
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

const SELLER_SELECT =
  "id,name,slug,email,phone,avatar,cover_image,description,store_description,location,address,rating,total_ratings,fulfillment_speed,is_verified,is_active,created_at,badges,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,default_shipping_fee,account_verified";

/**
 * search_products / filter_catalog implementation against Supabase.
 * Mirrors the query strategy used by SearchResultsScreen (direct DB search).
 *
 * Tags are the highest form: when a free-text `query` is supplied we cast a
 * wide net (matches against `tags`, `title`, and `category` for every
 * significant token) and re-rank results in JS so products whose `tags`
 * array overlaps the query are returned first. The DB sort is preserved as
 * the tie-breaker inside each score bucket.
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

  const safeLimit = clampLimit(limit);
  const orderMap = {
    price_asc: { col: "price", asc: true },
    price_desc: { col: "price", asc: false },
    rating: { col: "rating", asc: false },
    newest: { col: "created_at", asc: false },
    popular: { col: "sold_count", asc: false },
  };
  const order = orderMap[sort] || orderMap.popular;

  const { phrase, tokens } = tokenizeQuery(query);
  const hasTextQuery = phrase.length > 0;

  let dbQuery = supabase
    .from("express_products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true);

  // ── Tags-first search ────────────────────────────────────────────────
  // When the user supplies a free-text query, we OR-match against three
  // dimensions for every significant token: the `tags` array (highest
  // priority, hence matched FIRST in the OR chain), the `title`, and the
  // `category`. PostgREST's `or` filter is a SQL OR across the listed
  // expressions, so listing tags first keeps the planner happy and lets us
  // do the final ranking in JS.
  if (hasTextQuery) {
    const orClauses = [];
    for (const tok of tokens) {
      const safe = String(tok).replace(/[%(),]/g, " ").trim();
      if (!safe) continue;
      // `cs` is the array-contains operator on a text[] column — matches
      // when the array contains a single-element array with this token.
      // We use `cs` per token, which together with the title/category
      // ilikes cover the multi-token "any of these words" case.
      orClauses.push(`tags.cs.{${safe}}`);
      orClauses.push(`title.ilike.%${safe}%`);
      orClauses.push(`category.ilike.%${safe}%`);
    }
    if (orClauses.length) dbQuery = dbQuery.or(orClauses.join(","));
  }
  if (category) dbQuery = dbQuery.ilike("category", `%${category}%`);
  if (tag) dbQuery = dbQuery.contains("tags", [tag]);
  if (minRating) dbQuery = dbQuery.gte("rating", Number(minRating));
  if (minPrice != null) dbQuery = dbQuery.gte("price", Number(minPrice));
  if (maxPrice != null) dbQuery = dbQuery.lte("price", Number(maxPrice));

  dbQuery = dbQuery.order(order.col, { ascending: order.asc });

  // Fetch a wider window when we're going to re-rank. The multiplier (3x)
  // gives the ranker enough headroom to surface the right products while
  // still keeping the query bounded.
  const fetchLimit = hasTextQuery ? Math.min(safeLimit * 3, 50) : safeLimit;
  const { data, error } = await dbQuery.range(0, fetchLimit - 1);
  if (error) {
    console.warn("[TagAI] catalog query failed:", error.message);
    return { products: [], note: "I couldn't reach the catalog just now." };
  }

  let products = data || [];
  if (hasTextQuery) {
    // Re-rank: products with tag overlap come first, then phrase title
    // hits, then per-token title hits, then per-token category hits.
    // The DB sort is the tie-breaker (stable sort preserves it).
    const scored = products
      .map((p, idx) => ({
        p,
        idx,
        score: scoreProductForQuery(p, phrase, tokens),
      }))
      // Stable sort: primary by score DESC, secondary by original index ASC
      // (i.e. the DB's chosen order).
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.idx - b.idx,
      )
      .map((x) => x.p);
    products = scored.slice(0, safeLimit);
  } else {
    products = products.slice(0, safeLimit);
  }

  return { products, note: null };
};

/**
 * resolveProductById — fetch a single active product straight from the
 * catalog. Used by the add_to_cart tool when the caller has no local cache
 * of the product (the model references ids returned by earlier searches).
 */
export const resolveProductById = async (productId) => {
  if (!productId || !supabase) return null;
  const { data, error } = await supabase
    .from("express_products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true)
    .maybeSingle();
  if (error) {
    console.warn("[TagAI] product resolve failed:", error.message);
    return null;
  }
  return data || null;
};

/**
 * getProductDetails — full product row (used by the `get_product_details`
 * tool when the agent wants to read the description, specs, etc.).
 */
export const getProductDetails = async (productId) => {
  if (!productId || !supabase) return null;
  const { data, error } = await supabase
    .from("express_products")
    .select(PRODUCT_SELECT)
    .eq("id", productId)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true)
    .maybeSingle();
  if (error) {
    console.warn("[TagAI] get_product_details failed:", error.message);
    return null;
  }
  return data || null;
};

/**
 * getStoreDetails — full seller row (used by the `get_store_details` tool).
 */
export const getStoreDetails = async (sellerId) => {
  if (!sellerId || !supabase) return null;
  const { data, error } = await supabase
    .from("express_sellers")
    .select(SELLER_SELECT)
    .eq("id", sellerId)
    .maybeSingle();
  if (error) {
    console.warn("[TagAI] get_store_details failed:", error.message);
    return null;
  }
  return data || null;
};

/**
 * getStoreProducts — list products from a specific store, paginated.
 */
export const getStoreProducts = async (args = {}) => {
  if (!supabase) return { products: [], count: 0 };
  const { seller_id: sellerId, sort = "newest", page = 1, limit = 5 } = args;
  if (!sellerId) return { products: [], count: 0, error: "seller_id is required" };
  const safeLimit = clampLimit(limit);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;

  let q = supabase
    .from("express_products")
    .select(PRODUCT_SELECT)
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true);

  if (Number.isFinite(Number(args?.maxPrice)))
    q = q.lte("price", Number(args.maxPrice));
  if (Number.isFinite(Number(args?.minPrice)))
    q = q.gte("price", Number(args.minPrice));
  if (Number.isFinite(Number(args?.minRating)))
    q = q.gte("rating", Number(args.minRating));

  const orderMap = {
    price_asc: { col: "price", asc: true },
    price_desc: { col: "price", asc: false },
    rating: { col: "rating", asc: false },
    newest: { col: "created_at", asc: false },
    popular: { col: "sold_count", asc: false },
  };
  const order = orderMap[sort] || orderMap.newest;
  q = q.order(order.col, { ascending: order.asc });

  const { data, error } = await q.range(offset, offset + safeLimit - 1);
  if (error) {
    console.warn("[TagAI] get_store_products failed:", error.message);
    return { products: [], count: 0, error: error.message };
  }
  return { products: data || [], count: (data || []).length, page: safePage };
};

/**
 * searchStores — search the store directory.
 */
export const searchStores = async (args = {}) => {
  if (!supabase) return { stores: [], count: 0 };
  const {
    query,
    location,
    minRating,
    verifiedOnly = false,
    limit = 5,
  } = args;
  const safeLimit = clampLimit(limit);
  let q = supabase
    .from("express_sellers")
    .select(SELLER_SELECT)
    .eq("is_active", true)
    .order("rating", { ascending: false })
    .limit(safeLimit);

  if (query) {
    const safe = String(query).replace(/[%]/g, " ").trim();
    if (safe) {
      q = q.or(
        `name.ilike.%${safe}%,store_description.ilike.%${safe}%,description.ilike.%${safe}%`,
      );
    }
  }
  if (location) q = q.ilike("location", `%${String(location).trim()}%`);
  if (Number.isFinite(Number(minRating)))
    q = q.gte("rating", Number(minRating));
  if (verifiedOnly) q = q.eq("is_verified", true);

  const { data, error } = await q;
  if (error) {
    console.warn("[TagAI] search_stores failed:", error.message);
    return { stores: [], count: 0, error: error.message };
  }
  return { stores: data || [], count: (data || []).length };
};

/**
 * getProductReviews — fetch approved reviews for a product, plus
 * rating distribution and any reply comments. Used by the agent when
 * the user asks "what do people say about this?" / "show me the reviews".
 */
export const getProductReviews = async (args = {}) => {
  if (!supabase) return { reviews: [], count: 0, average: 0 };
  const productId = String(args?.product_id || "").trim();
  if (!productId) {
    return { reviews: [], count: 0, error: "product_id is required" };
  }
  const limit = Math.min(20, Math.max(1, parseInt(args?.limit, 10) || 5));
  const page = Math.max(1, parseInt(args?.page, 10) || 1);
  const offset = (page - 1) * limit;
  const sort = String(args?.sort || "newest").toLowerCase();
  const minRating = Number.isFinite(Number(args?.min_rating))
    ? Number(args.min_rating)
    : null;

  let q = supabase
    .from("express_reviews")
    .select(
      "id, product_id, user_id, rating, comment, created_at, images, helpful_count, is_verified_purchase, is_approved, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
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
    case "newest":
    default:
      q = q.order("created_at", { ascending: false });
  }

  const { data, error, count } = await q;
  if (error) {
    console.warn("[TagAI] get_product_reviews failed:", error.message);
    return { reviews: [], count: 0, error: error.message };
  }
  const reviews = data || [];

  // Aggregate stats — separate query for accuracy.
  const { data: agg } = await supabase
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
    reviews,
    count: reviews.length,
    total,
    page,
    average: Number(average.toFixed(2)),
    distribution,
    summary:
      total === 0
        ? `No approved reviews yet for this product.`
        : `${total} review(s), average ${average.toFixed(1)}★ — breakdown: 5★ ${distribution[5]}, 4★ ${distribution[4]}, 3★ ${distribution[3]}, 2★ ${distribution[2]}, 1★ ${distribution[1]}.`,
  };
};

/**
 * getStoreReviews — aggregate reviews across all of a store's products.
 * Heavier than getProductReviews because it joins all reviews for all
 * products in one seller. Capped at 20 rows per call.
 */
export const getStoreReviews = async (args = {}) => {
  if (!supabase) return { reviews: [], count: 0, average: 0 };
  const sellerId = String(args?.seller_id || "").trim();
  if (!sellerId) {
    return { reviews: [], count: 0, error: "seller_id is required" };
  }
  const limit = Math.min(20, Math.max(1, parseInt(args?.limit, 10) || 5));
  const page = Math.max(1, parseInt(args?.page, 10) || 1);
  const offset = (page - 1) * limit;
  const minRating = Number.isFinite(Number(args?.min_rating))
    ? Number(args.min_rating)
    : null;

  // First fetch the seller's product ids.
  const { data: products, error: prodErr } = await supabase
    .from("express_products")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("status", "active");
  if (prodErr) {
    return { reviews: [], count: 0, error: prodErr.message };
  }
  const productIds = (products || []).map((p) => p.id);
  if (productIds.length === 0) {
    return {
      reviews: [],
      count: 0,
      total: 0,
      average: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      summary: "This store has no active products to review.",
    };
  }

  let q = supabase
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
  if (error) {
    console.warn("[TagAI] get_store_reviews failed:", error.message);
    return { reviews: [], count: 0, error: error.message };
  }

  // Aggregate
  const { data: agg } = await supabase
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
    reviews: data || [],
    count: (data || []).length,
    total,
    page,
    average: Number(average.toFixed(2)),
    distribution,
    summary:
      total === 0
        ? `No approved reviews yet for this store.`
        : `${total} review(s) across ${productIds.length} product(s), average ${average.toFixed(1)}★ — 5★ ${distribution[5]}, 4★ ${distribution[4]}, 3★ ${distribution[3]}, 2★ ${distribution[2]}, 1★ ${distribution[1]}.`,
  };
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
    console.warn("[TagAI] navigate failed:", e);
    return { ok: false, message: "I couldn't open that screen." };
  }
};

/**
 * point_to_element executor. Known keys resolve against GROUNDING_ELEMENTS
 * and spotlight the registered ref. An `item_id` resolves to whatever
 * read_screen indexed. Anything else succeeds in "generic" mode — the
 * overlay highlights the middle of the current screen and shows the
 * caller's label/description, so TagAI can point at ANYTHING on ANY page
 * even without a registered ref. `shape` / `direction` / `size` / `coords`
 * give the overlay more expressive pointers.
 */
export const executePointTo = (args = {}, ctx = {}) => {
  const elementKey = typeof args === "string" ? args : args?.element;
  const element = elementKey ? GROUNDING_ELEMENTS[elementKey] : null;
  const passThrough = {
    shape: args?.shape,
    direction: args?.direction,
    size: args?.size,
    coords: args?.coords,
    item_id: args?.item_id,
  };

  // 1. Item-id mode — resolve from the live snapshot to get on-screen coords.
  if (args?.item_id && typeof ctx.snapshotScreen === "function") {
    return (async () => {
      try {
        const snap = await ctx.snapshotScreen({ region: "all", maxItems: 200 });
        const item = (snap?.items || []).find(
          (it) => String(it.id) === String(args.item_id),
        );
        if (item?.rect) {
          return {
            ok: true,
            mode: "item",
            message: args?.description || `Pointing at ${item.text || args.item_id}.`,
            element: elementKey || args.item_id,
            label: args?.label || item.text || args.item_id,
            hint: args?.description || "",
            coords: {
              x: Math.round(item.rect.x),
              y: Math.round(item.rect.y),
              w: Math.round(item.rect.width),
              h: Math.round(item.rect.height),
            },
            ...passThrough,
          };
        }
        return {
          ok: false,
          status: "not_found",
          mode: "item",
          message: `Item ${args.item_id} is registered but not currently on screen. Try scrolling or re-running read_screen.`,
          ...passThrough,
        };
      } catch (e) {
        return {
          ok: false,
          status: "error",
          message: e?.message || String(e),
          ...passThrough,
        };
      }
    })();
  }

  // 2. Registered key mode.
  if (element) {
    return {
      ok: true,
      mode: "registered",
      message: element.hint,
      element: elementKey,
      label: element.label,
      hint: element.hint,
      ...passThrough,
    };
  }
  // 3. Generic / free-form mode.
  const label =
    args?.label ||
    (elementKey && elementKey !== "custom"
      ? String(elementKey).replace(/[._]/g, " ")
      : "") ||
    "this area";
  const hint = args?.description || "";
  return {
    ok: true,
    mode: "generic",
    message:
      hint ||
      `I highlighted the area on your screen — ${label} should be right around there.`,
    element: elementKey || "generic",
    label,
    hint,
    ...passThrough,
  };
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
  if (/\bwish ?list\b|\bsaved (items|products)\b|\bfavourites\b|\bfavorites\b|\bcollection(s)?\b/.test(t))
    return "collections";
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

// Explicit pointing verbs for the generic-pointing fallback. Deliberately
// excludes "show me" so navigation phrases ("show me my orders") don't get
// hijacked as pointing requests.
const POINT_ONLY_RE =
  /\b(point\s+(to|at)|where\s+is|where'?s|locate|highlight|which one is|find on (the )?screen)\b/i;
const POINT_VERB_STRIP_RE =
  /\b(point\s+(to|at)|where\s+is|where'?s|locate|highlight|which one is|can you|please)\b/gi;

/**
 * extractPointLabel — turns "point at the search bar" into "search bar".
 * Returns null when nothing meaningful remains after stripping the verbs.
 */
const extractPointLabel = (text) => {
  let s = String(text || "").replace(POINT_VERB_STRIP_RE, " ");
  s = s
    .replace(/^(the|a|an|my)\s+/i, "")
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 2) return null;
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
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
const CART_ADD_RE = /\b(add|put|drop)\b[^.?!]*\bcart\b/i;
// Intents for the new product/store detail tools.
const PRODUCT_DETAILS_RE =
  /\b(tell me (more )?about|what'?s? (the )?(detail|info|description)|show (me )?(the )?details?|what (are|is) the (specs?|specifications)|specs?|more (info|details))\b/i;
const STORE_DETAILS_RE =
  /\b(about (the )?(store|seller|shop)|who sells (it|this|them)?|where is (it|this|the store|the seller) (based|from)|is (the )?(store|seller) (legit|verified|trustworthy|reliable)|how (fast|quick) (do|does) (they|he|she) ship|store'?s? (rating|reviews|info|profile|policy|policies))\b/i;
const SEARCH_STORES_RE =
  /\b(find|show|search|list|are there|any|which|where)\b[^.?!]*\b(stores?|shops?|sellers?|vendors?|brands?)\b/i;
// Reviews / ratings — "what do people say?", "show me the bad reviews", "is it any good?"
const PRODUCT_REVIEWS_RE =
  /\b(what (do|does)\s+(people|users|customers|reviewers)\s+(say|think)|show\s+(me\s+)?(the\s+)?(reviews?|ratings?|comments?|feedback)|is\s+(it|this|the product)\s+(any\s+)?good|reviews?|ratings?)\b/i;
const STORE_REVIEWS_RE =
  /\b(store'?s?|seller'?s?|shop'?s?)\s+(reviews?|ratings?|reputation|feedback)\b|\bshow\s+(me\s+)?(the\s+)?(bad|negative|low|worst|1-star|2-star)\s+(reviews?|ratings?)\b/i;
// Screen map — "what screens are there?", "list all seller screens"
const LIST_SCREENS_RE =
  /\b(what|which|list|show|all)\s+(screens?|pages|views|destinations)\b.*\b(app|available|here|navigable|can|exist)\b/i;
// New intents for the upgraded agent. These are intentionally TIGHT — they
// must not shadow navigation (e.g. "go back" / "show me more" should still
// navigate, not scroll). Each requires a "scroll-shaped" verb right next to
// a direction word.
const SCROLL_RE =
  /\b(scroll(?:\s+(?:down|up|left|right|to))?|swipe(?:\s+(?:up|down|left|right))?|page(?:\s+(?:down|up))|keep\s+scrolling|show\s+me\s+more|move\s+(?:down|up|left|right))\b/i;
const READ_SCREEN_RE =
  /\b(what'?s\s+on\s+(?:the\s+)?screen|what\s+(?:is|are)\s+on\s+(?:the\s+)?screen|read\s+(?:the\s+)?screen|see\s+(?:the\s+)?screen|list\s+(?:what'?s|what\s+is)\s+on\s+screen)\b/i;
// Generic words stripped before matching a mention against product titles
const CART_STOPWORDS = new Set([
  "add",
  "put",
  "drop",
  "the",
  "this",
  "that",
  "it",
  "my",
  "your",
  "our",
  "cart",
  "please",
  "into",
  "item",
  "product",
  "one",
  "and",
  "for",
]);

/**
 * Local rule-based planner. Returns the same shape as an LLM tool-call turn:
 * { reply, toolCalls: [{ name, args }] }.
 *
 * `ctx.recentProducts` — products shown in recent assistant messages, so
 * "add this to my cart" can resolve against the latest search results.
 */
export const planLocalTurn = (text, ctx = {}) => {
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
        "Here's what I can do:\n" +
        "• 🛍️ Search the catalog — “find wireless earbuds under 200”\n" +
        "• 📋 Product details — “tell me about this product”, “what are the specs?”\n" +
        "• 🏪 Store details — “who sells this?”, “is this store verified?”\n" +
        "• 🔎 Search stores — “any stores in Accra?”, “verified sellers selling fresh fish”\n" +
        "• 🛒 Add to cart — tap “Add” on any card I show you\n" +
        "• 🧭 Navigate — “take me to my checkout”\n" +
        "• 🎯 Point at the UI — “where is my coupon code box?”\n" +
        "• 👀 Read the screen — “what's on screen right now?”\n" +
        "• ⬇️ Scroll — “scroll down to see more”",
      toolCalls: [],
    };
  }

  // 3. Add to cart ("add this to my cart", "add the earbuds to cart")
  if (CART_ADD_RE.test(lower)) {
    const recents = Array.isArray(ctx.recentProducts)
      ? ctx.recentProducts.filter((p) => p?.id)
      : [];
    // Try to match a mentioned product title against the recent results so
    // "add the earbuds to my cart" picks the right card.
    const words = lower
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !CART_STOPWORDS.has(w));
    let pick = null;
    if (recents.length) {
      const scored = recents
        .map((p) => ({
          p,
          score: words.filter((w) =>
            String(p.title || "").toLowerCase().includes(w),
          ).length,
        }))
        .sort((a, b) => b.score - a.score);
      if (scored[0]?.score > 0) pick = scored[0].p;
      else if (recents.length === 1) pick = recents[0];
    }
    if (pick) {
      return {
        reply: `Adding “${pick.title}” to your cart. 🛒`,
        toolCalls: [
          { name: "add_to_cart", args: { product_id: pick.id, quantity: 1 } },
        ],
      };
    }
    return {
      reply: recents.length
        ? "Which one should I add? Tell me the product name, or tap “Add to Cart” on its card. 🛒"
        : "Search for something first and I can drop it straight into your cart — try “find wireless earbuds”. 🛒",
      toolCalls: [],
    };
  }

  // 3b. Product details ("tell me about this", "what are the specs?")
  // Resolves against the most recent product the user has been looking at.
  if (PRODUCT_DETAILS_RE.test(lower)) {
    const recents = Array.isArray(ctx.recentProducts)
      ? ctx.recentProducts.filter((p) => p?.id)
      : [];
    if (recents.length === 0) {
      return {
        reply:
          "Tell me which product — search for it first and I'll pull up the full details. Try “find wireless earbuds”. 🔍",
        toolCalls: [],
      };
    }
    const target = recents[0];
    return {
      reply: `Here's the full rundown on **${target.title}**. 📋`,
      toolCalls: [
        { name: "get_product_details", args: { product_id: target.id } },
      ],
    };
  }

  // 3c. Store details ("who sells this?", "is the store legit?")
  if (STORE_DETAILS_RE.test(lower)) {
    const recents = Array.isArray(ctx.recentProducts)
      ? ctx.recentProducts.filter((p) => p?.id)
      : [];
    const sellerId =
      recents[0]?.seller_id?.id || recents[0]?.seller_id || null;
    if (sellerId) {
      return {
        reply: `Let me pull up the store's profile. 🏪`,
        toolCalls: [{ name: "get_store_details", args: { seller_id: sellerId } }],
      };
    }
    return {
      reply:
        "Open a product first and I'll tell you all about the store behind it. 🛍️",
      toolCalls: [],
    };
  }

  // 3d. Search stores ("are there any stores selling X", "stores in Accra")
  if (SEARCH_STORES_RE.test(lower)) {
    const query = extractQuery(t);
    const args = {};
    if (query) args.query = query;
    // Detect location tokens after "in" or "near" — small but useful.
    const locMatch = lower.match(
      /\b(?:in|near|around)\s+([a-z][a-z\s'-]{1,30})\b/,
    );
    if (locMatch) args.location = locMatch[1].trim();
    if (/\bverified?\b/.test(lower)) args.verifiedOnly = true;
    return {
      reply: query
        ? `Looking for stores matching “${query}”… 🔍`
        : "Looking for stores in our directory… 🔍",
      toolCalls: [{ name: "search_stores", args }],
    };
  }

  // 3e. Product reviews ("what do people say about this?", "show me the reviews")
  if (PRODUCT_REVIEWS_RE.test(lower)) {
    const recents = Array.isArray(ctx.recentProducts)
      ? ctx.recentProducts.filter((p) => p?.id)
      : [];
    if (recents.length === 0) {
      return {
        reply:
          "Open a product first and I'll pull up its reviews. Try “find wireless earbuds” and then ask again. 💬",
        toolCalls: [],
      };
    }
    const args = { product_id: recents[0].id };
    // "Show me the bad reviews" → filter to 1-2 stars.
    if (/\b(bad|negative|worst|low|1-star|2-star|1 star|2 star)\b/i.test(lower)) {
      args.min_rating = 1;
    }
    return {
      reply: `Pulling up reviews for **${recents[0].title}**. 💬`,
      toolCalls: [{ name: "get_product_reviews", args }],
    };
  }

  // 3f. Store reviews ("show me this store's reviews", "bad reviews of this seller")
  if (STORE_REVIEWS_RE.test(lower)) {
    const recents = Array.isArray(ctx.recentProducts)
      ? ctx.recentProducts.filter((p) => p?.id)
      : [];
    const sellerId =
      recents[0]?.seller_id?.id || recents[0]?.seller_id || null;
    if (sellerId) {
      const args = { seller_id: sellerId };
      if (/\b(bad|negative|worst|low|1-star|2-star)\b/i.test(lower)) {
        args.min_rating = 1;
      }
      return {
        reply: `Pulling up reviews for this store. 💬`,
        toolCalls: [{ name: "get_store_reviews", args }],
      };
    }
    return {
      reply:
        "Open a product first and I'll show you the reviews of the store behind it. 🏪",
      toolCalls: [],
    };
  }

  // 3g. List screens ("what screens can you navigate to?", "all seller screens")
  if (LIST_SCREENS_RE.test(lower)) {
    const args = {};
    if (/\bseller\b/i.test(lower)) args.role = "seller";
    else if (/\bcustomer\b/i.test(lower)) args.role = "customer";
    return {
      reply: args.role
        ? `Listing all ${args.role} screens. 📱`
        : "Listing every screen in the app. 📱",
      toolCalls: [{ name: "list_screens", args }],
    };
  }

  // 4. Grounding ("where is my coupon code box?")
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

  // Pointing at something NOT in the registry — still point! The overlay
  // highlights the middle of the screen with our label, so any "where is /
  // point at X" request works even for unknown elements.
  if (POINT_ONLY_RE.test(lower)) {
    const label = extractPointLabel(t);
    if (label) {
      return {
        reply: `Here's ${label}. ✨`,
        toolCalls: [
          { name: "point_to_element", args: { element: "custom", label } },
        ],
      };
    }
  }

  // 5. Navigation ("take me to my checkout") — must run BEFORE the new
  // read_screen / scroll checks so phrases like "go back", "go up" and
  // "show me more" still navigate when a page matches. (Regression: scroll
  // used to shadow these.)
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

  // 6. Deals shortcut → filter catalog by popularity under GH₵50
  if (DEALS_RE.test(lower)) {
    return {
      reply: "Here are some great deals I found for you. 🏷️",
      toolCalls: [
        { name: "filter_catalog", args: { sort: "popular", maxPrice: 50, limit: 4 } },
      ],
    };
  }

  // 6b. Read screen ("what's on screen?") — cheap intent check, runs after
  // navigation so "show me the screen" doesn't accidentally fire here.
  if (READ_SCREEN_RE.test(lower)) {
    return {
      reply: "Taking a look at what's on screen… 👀",
      toolCalls: [{ name: "read_screen", args: { region: "viewport", max_items: 30 } }],
    };
  }

  // 6c. Scroll ("scroll down", "swipe up") — must run AFTER navigation
  // (so "go back" still navigates) and AFTER product search (so "show me
  // more" still searches when a product verb is present).
  if (SCROLL_RE.test(lower) && !PRODUCT_VERBS.test(lower)) {
    const down = /\b(down|more|forward|next)\b/i.test(lower);
    const up = /\b(up|back|previous|top)\b/i.test(lower);
    const direction = down && !up ? "down" : up && !down ? "up" : "down";
    return {
      reply: direction === "up" ? "Scrolling back up. ⬆️" : "Scrolling down. ⬇️",
      toolCalls: [{ name: "scroll", args: { direction, amount: "page" } }],
    };
  }

  // 7. Product search / filter ("find headphones under 200")
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

  // 8. Fallback
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
      return {
        reply: data.reply,
        toolCalls: data.toolCalls || [],
        // Server-executed catalog searches return their results here — the
        // chat UI renders them as interactive product cards.
        products: Array.isArray(data.products) ? data.products : [],
      };
    }
    throw new Error(data?.error || "AI service unavailable");
  } catch (e) {
    console.warn(
      "[TagAI] remote planner unavailable, using local rules:",
      e?.message || e,
    );
    const local = await planLocalTurn(text, {
      // Products from the most recent assistant message — lets an
      // offline "add this to cart" resolve against the last search.
      recentProducts:
        [...(Array.isArray(history) ? history : [])]
          .reverse()
          .find(
            (m) => m?.role === "assistant" && Array.isArray(m.products),
          )?.products || [],
    });
    return { ...local, products: [] };
  }
};

// ── Tool dispatch ────────────────────────────────────────────────────────────
// ctx: {
//   navigateTo(route, params),
//   pointTo(elementKey, extra),
//   addProductToCart(product, qty),
//   resolveProduct(id),
//   snapshotScreen(opts),
//   findOnScreen(query, opts),
//   getAppState(),
//   getScrollSurface(key),
//   clearGrounding(),
// }

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
        // Prefer the caller's local product cache, then fall back to a
        // catalog lookup by id — the model passes ids it saw in earlier
        // search results, which the screen usually doesn't hold locally.
        const product =
          ctx.resolveProduct?.(args.product_id) ||
          (await resolveProductById(args.product_id));
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
      case "navigate_to_store": {
        const sellerId = String(args?.seller_id || "").trim();
        if (!sellerId) {
          return {
            name,
            status: "error",
            label: "Open store",
            message: "I need a store id to open it.",
          };
        }
        try {
          if (typeof ctx.navigateTo !== "function") {
            return {
              name,
              status: "unsupported",
              label: "Open store",
              message: "This screen can't navigate right now.",
            };
          }
          ctx.navigateTo("Store", { sellerId });
          return {
            name,
            status: "done",
            label: "Open store",
            message: "Opening the store for you. 🏪",
            seller_id: sellerId,
          };
        } catch (e) {
          return {
            name,
            status: "error",
            label: "Open store",
            message: e?.message || "Couldn't open that store.",
          };
        }
      }
      case "navigate_to_product": {
        const productId = String(args?.product_id || "").trim();
        if (!productId) {
          return {
            name,
            status: "error",
            label: "Open product",
            message: "I need a product id to open it.",
          };
        }
        try {
          if (typeof ctx.navigateTo !== "function") {
            return {
              name,
              status: "unsupported",
              label: "Open product",
              message: "This screen can't navigate right now.",
            };
          }
          ctx.navigateTo("ProductDetail", { productId });
          return {
            name,
            status: "done",
            label: "Open product",
            message: "Opening the product page. 🛍️",
            product_id: productId,
          };
        } catch (e) {
          return {
            name,
            status: "error",
            label: "Open product",
            message: e?.message || "Couldn't open that product.",
          };
        }
      }
      case "get_product_details": {
        const product = await getProductDetails(args?.product_id);
        if (!product) {
          return {
            name,
            status: "not_found",
            label: "Product details",
            message: `No active product with id ${args?.product_id || "(missing)"}.`,
          };
        }
        // Use the same rich summary the LLM-backed path produces: full
        // description (up to 600 chars), every specification as a
        // key/value block, sizes/colors/weight, and the seller profile.
        // The local planner's "tell me about this product" reply and the
        // LLM's reply now have identical information to work with.
        const summary = buildRichProductSummary(product);
        return {
          name,
          status: "done",
          label: "Product details",
          message: summary,
          product,
        };
      }
      case "get_store_details": {
        const store = await getStoreDetails(args?.seller_id);
        if (!store) {
          return {
            name,
            status: "not_found",
            label: "Store details",
            message: `No store with id ${args?.seller_id || "(missing)"}.`,
          };
        }
        const summary =
          `${store.name}` +
          (store.is_verified ? " (verified)" : "") +
          ` — rating ${Number(store.rating || 0).toFixed(1)}★ (${store.total_ratings || 0} reviews)` +
          (store.location ? ` — based in ${store.location}` : "") +
          (store.store_description
            ? `. ${String(store.store_description).slice(0, 220)}${String(store.store_description).length > 220 ? "…" : ""}`
            : ".");
        return {
          name,
          status: "done",
          label: "Store details",
          message: summary,
          store,
        };
      }
      case "get_store_products": {
        const result = await getStoreProducts(args);
        if (result.error) {
          return {
            name,
            status: "error",
            label: "Store products",
            message: result.error,
          };
        }
        const list = result.products || [];
        const summary =
          list.length === 0
            ? `No active products for that store on page ${result.page || 1}.`
            : `${list.length} product(s) from this store (page ${result.page || 1}): ${list
                .map(
                  (p) =>
                    `${p.title} — GH₵${Number(p.price || 0)}${p.discount > 0 ? ` (${p.discount}% off)` : ""}`,
                )
                .join("; ")}`;
        return {
          name,
          status: list.length > 0 ? "done" : "not_found",
          label: "Store products",
          message: summary,
          products: list,
          seller_id: args?.seller_id,
        };
      }
      case "search_stores": {
        const result = await searchStores(args);
        if (result.error) {
          return {
            name,
            status: "error",
            label: "Search stores",
            message: result.error,
          };
        }
        const list = result.stores || [];
        const summary =
          list.length === 0
            ? "No matching stores found."
            : `${list.length} store(s): ${list
                .map(
                  (s) =>
                    `${s.name}${s.is_verified ? " (verified)" : ""} — ${Number(s.rating || 0).toFixed(1)}★ (${s.total_ratings || 0} reviews)` +
                    (s.location ? ` — ${s.location}` : ""),
                )
                .join("; ")}`;
        return {
          name,
          status: list.length > 0 ? "done" : "not_found",
          label: "Search stores",
          message: summary,
          stores: list,
        };
      }
      case "get_product_reviews": {
        const result = await getProductReviews(args);
        if (result.error) {
          return {
            name,
            status: "error",
            label: "Product reviews",
            message: result.error,
          };
        }
        return {
          name,
          status: result.total > 0 ? "done" : "not_found",
          label: "Product reviews",
          message:
            result.summary ||
            (result.total === 0
              ? "No reviews yet for this product."
              : `${result.total} review(s).`),
          reviews: result.reviews || [],
          total: result.total,
          page: result.page,
          average: result.average,
          distribution: result.distribution,
        };
      }
      case "get_store_reviews": {
        const result = await getStoreReviews(args);
        if (result.error) {
          return {
            name,
            status: "error",
            label: "Store reviews",
            message: result.error,
          };
        }
        return {
          name,
          status: result.total > 0 ? "done" : "not_found",
          label: "Store reviews",
          message: result.summary,
          reviews: result.reviews || [],
          total: result.total,
          page: result.page,
          average: result.average,
          distribution: result.distribution,
        };
      }
      case "point_to_element": {
        // executePointTo can return either an object (sync) or a Promise
        // (async item-id mode). Normalise before consuming.
        const resolved = await executePointTo(args, ctx);
        if (resolved?.ok) {
          ctx.pointTo(resolved.element, {
            label: resolved.label,
            hint: resolved.hint,
            shape: resolved.shape,
            direction: resolved.direction,
            size: resolved.size,
            coords: resolved.coords,
          });
        }
        // If the caller's element wasn't found, attach a self-correction hint
        // so the model can chain read_screen → point_to_element.
        let message = resolved?.message || "Pointed at the target.";
        if (resolved?.status === "not_found") {
          message +=
            " Try read_screen to see what's visible, or scroll to bring it into view.";
        }
        return {
          name,
          status: resolved?.ok ? "done" : resolved?.status || "error",
          label: `Pointing at ${resolved?.label || args?.element || "target"}`,
          message,
          mode: resolved?.mode,
          coords: resolved?.coords,
        };
      }
      default: {
        // New "agent has eyes" tools — registered in src/tools/agentTools.js.
        const tool = AGENT_TOOLS.find((t) => t.name === name);
        if (tool) {
          const result = await tool.execute(args, ctx);
          return {
            name,
            status: result?.status || (result?.ok ? "done" : "error"),
            label: labelForTool(name),
            message: result?.message || result?.status || "Done.",
            data: result,
          };
        }
        return { name, status: "error", label: name, message: "Unknown tool." };
      }
    }
  } catch (e) {
    console.warn(`[TagAI] tool ${name} failed:`, e);
    return { name, status: "error", label: name, message: "That action failed." };
  }
};

const labelForTool = (name) => {
  switch (name) {
    case "read_screen":
      return "Reading screen";
    case "find_on_screen":
      return "Finding on screen";
    case "scroll":
      return "Scrolling";
    case "scroll_to":
      return "Scrolling to item";
    case "wait_for":
      return "Waiting";
    case "get_app_state":
      return "Checking app state";
    case "dismiss_overlay":
      return "Dismissing";
    case "get_product_details":
      return "Reading product details";
    case "get_store_details":
      return "Reading store details";
    case "get_store_products":
      return "Browsing store catalog";
    case "search_stores":
      return "Searching stores";
    case "navigate_to_store":
      return "Opening store";
    case "navigate_to_product":
      return "Opening product";
    case "get_product_reviews":
      return "Reading product reviews";
    case "get_store_reviews":
      return "Reading store reviews";
    default:
      return name;
  }
};

/** Names of all client-side tools. Useful for the planner / system prompt. */
export { AGENT_TOOL_NAMES };
