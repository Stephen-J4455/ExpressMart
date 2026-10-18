// ── Agent tools ─────────────────────────────────────────────────────────────
// Client-side tool implementations for the TagAI agent. Each tool exports:
//
//   { name, schema, execute(args, ctx) }
//
// where `ctx` is the per-turn execution context from TagAIAssistantContext
// (snapshotScreen, findOnScreen, getAppState, pointTo, navigateTo, ...).
//
// These are registered with executeToolCall() so both the local rule-based
// planner and the OpenRouter edge agent can call them. The `schema` mirrors
// what the LLM sees in its function-calling spec.

import { scrollSurface, scrollToItem, waitFor } from "../services/screenScanner";

/* ── read_screen ─────────────────────────────────────────────────────────── */
export const readScreenTool = {
  name: "read_screen",
  schema: {
    description:
      "Return a snapshot of items currently registered against the active screen. Use to learn what is visible before pointing, scrolling, or picking a product.",
    parameters: {
      type: "object",
      properties: {
        region: {
          type: "string",
          enum: ["viewport", "all"],
          description:
            "viewport = only items currently measured on screen. all = every registered item (default viewport).",
        },
        max_items: { type: "integer", description: "Cap on items returned (default 30)." },
      },
    },
  },
  execute: async (args = {}, ctx = {}) => {
    try {
      const snap = await ctx.snapshotScreen?.({
        region: args.region || "viewport",
        maxItems: Number(args.max_items) || 30,
      });
      if (!snap) {
        return {
          ok: false,
          status: "unsupported",
          message: "No screen-index is registered for the current view.",
        };
      }
      const items = (snap.items || []).map((it) => ({
        id: it.id,
        text: it.text,
        role: it.role,
        meta: it.meta,
        visible: it.visible,
        ...(it.rect
          ? {
              rect: {
                x: Math.round(it.rect.x),
                y: Math.round(it.rect.y),
                w: Math.round(it.rect.width),
                h: Math.round(it.rect.height),
              },
            }
          : {}),
      }));
      return { ok: true, status: "done", route: snap.route, count: snap.count, items };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── find_on_screen ──────────────────────────────────────────────────────── */
export const findOnScreenTool = {
  name: "find_on_screen",
  schema: {
    description:
      "Find items matching a free-text query on the active screen. Returns enriched items with rects so you can call point_to_element against a specific match.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Substring to match in item text/label." },
        role: { type: "string", description: "Optional role filter (e.g. 'button', 'product', 'link')." },
        max_items: { type: "integer", description: "Cap on items returned (default 5)." },
      },
    },
  },
  execute: async (args = {}, ctx = {}) => {
    try {
      const result = await ctx.findOnScreen?.(args.text, {
        role: args.role,
        maxItems: Number(args.max_items) || 5,
      });
      if (!result) {
        return { ok: false, status: "unsupported", message: "No screen-index registered." };
      }
      return {
        ok: true,
        status: result.count > 0 ? "done" : "not_found",
        count: result.count,
        items: result.items.map((it) => ({
          id: it.id,
          text: it.text,
          role: it.role,
          meta: it.meta,
          visible: it.visible,
          rect: it.rect
            ? {
                x: Math.round(it.rect.x),
                y: Math.round(it.rect.y),
                w: Math.round(it.rect.width),
                h: Math.round(it.rect.height),
              }
            : null,
        })),
      };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── scroll ──────────────────────────────────────────────────────────────── */
export const scrollTool = {
  name: "scroll",
  schema: {
    description:
      "Scroll the active (or named) scroll surface in a direction. Use when the target is below the fold or off to the side.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: {
          type: "string",
          description: "Either 'page' (≈1× viewport, default), 'half', or a number of pixels.",
        },
        surface: { type: "string", description: "Optional scroll-surface key override." },
      },
      required: ["direction"],
    },
  },
  execute: async (args = {}, ctx = {}) => {
    const surface = ctx.getScrollSurface?.(args.surface);
    return scrollSurface(surface, { direction: args.direction, amount: args.amount });
  },
};

/* ── scroll_to ───────────────────────────────────────────────────────────── */
export const scrollToTool = {
  name: "scroll_to",
  schema: {
    description:
      "Scroll a named item into view. The item must be registered in the screen index (use read_screen to discover ids).",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "Id of the item to reveal." },
        position: { type: "string", enum: ["top", "bottom", "visible"] },
        surface: { type: "string", description: "Optional surface key override." },
      },
      required: ["item_id"],
    },
  },
  execute: async (args = {}, ctx = {}) => {
    const surface = ctx.getScrollSurface?.(args.surface);
    const snap = await ctx.snapshotScreen?.({ region: "all", maxItems: 200 });
    const map = new Map();
    for (const it of snap?.items || []) map.set(String(it.id), it);
    return scrollToItem(args.item_id, map, surface);
  },
};

/* ── wait_for ────────────────────────────────────────────────────────────── */
export const waitForTool = {
  name: "wait_for",
  schema: {
    description:
      "Poll the screen index until an item matches a predicate. Useful after a navigate or scroll when the new content takes a moment to mount.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Substring to wait for." },
        role: { type: "string", description: "Optional role filter." },
        timeout_ms: { type: "integer", description: "Max wait (default 4000ms)." },
        poll_ms: { type: "integer", description: "Poll interval (default 250ms)." },
      },
    },
  },
  execute: async (args = {}, ctx = {}) => {
    const initial = await ctx.snapshotScreen?.({ region: "all", maxItems: 200 });
    const map = new Map();
    for (const it of initial?.items || []) map.set(String(it.id), it);
    return waitFor(
      { text: args.text, role: args.role },
      {
        indexMap: map,
        timeout_ms: Number(args.timeout_ms) || 4000,
        poll_ms: Number(args.poll_ms) || 250,
      },
    );
  },
};

/* ── get_app_state ───────────────────────────────────────────────────────── */
export const getAppStateTool = {
  name: "get_app_state",
  schema: {
    description:
      "Return the current app state: active route, signed-in user id, cart count, etc. Useful as a low-cost context check before acting.",
    parameters: { type: "object", properties: {} },
  },
  execute: async (_args = {}, ctx = {}) => {
    return ctx.getAppState?.() || { ok: true };
  },
};

/* ── dismiss_overlay ────────────────────────────────────────────────────── */
export const dismissOverlayTool = {
  name: "dismiss_overlay",
  schema: {
    description: "Dismiss the AI pointer overlay (or any open modal the agent opened).",
    parameters: { type: "object", properties: {} },
  },
  execute: async (_args = {}, ctx = {}) => {
    try {
      ctx.clearGrounding?.();
      return { ok: true, status: "done" };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── tap_element ─────────────────────────────────────────────────────────── */
// Fire a registered press handler. Screens opt-in via the useTapTarget
// hook (see src/hooks/useGrounding.js). Common ids are catalogued in
// src/services/screenMap.js (e.g. "productDetail.addToCart",
// "checkout.payButton", "store.follow").
export const tapElementTool = {
  name: "tap_element",
  schema: {
    description:
      "Tap a registered element on the current screen (e.g. 'add to cart', 'follow store', 'apply promo', 'go live'). The element must have been registered via the useTapTarget hook. Use list_screens or get_screen_info to see what's available on the current screen, or call list_tap_targets to enumerate live registrations.",
    parameters: {
      type: "object",
      properties: {
        item_id: {
          type: "string",
          description:
            "Stable tap-target id (e.g. 'productDetail.addToCart', 'store.follow', 'checkout.payButton').",
        },
        screen: {
          type: "string",
          description:
            "Optional screen name. When provided, the dispatcher will navigate to that screen first if the user is on a different route.",
        },
      },
      required: ["item_id"],
    },
  },
  execute: async (args = {}, ctx = {}) => {
    if (!ctx.invokeTapTarget) {
      return {
        ok: false,
        status: "unsupported",
        message:
          "Tap targets are not available on this build. Update to the latest version of the app.",
      };
    }
    if (args.screen && typeof ctx.navigateTo === "function") {
      try {
        ctx.navigateTo(args.screen);
      } catch (_) {
        // continue — the tap will report not_found if the target belongs
        // to a different screen.
      }
    }
    const result = await ctx.invokeTapTarget(args.item_id);
    return {
      ok: !!result?.ok,
      status: result?.ok ? "done" : result?.status || "error",
      message: result?.ok
        ? `Tapped ${args.item_id}.`
        : result?.message || "Tap failed.",
    };
  },
};

/* ── go_back ─────────────────────────────────────────────────────────────── */
export const goBackTool = {
  name: "go_back",
  schema: {
    description:
      "Pop the current screen off the navigation stack (equivalent to tapping the back button).",
    parameters: { type: "object", properties: {} },
  },
  execute: async (_args = {}, ctx = {}) => {
    try {
      if (typeof ctx.goBack === "function") {
        ctx.goBack();
        return { ok: true, status: "done", message: "Went back." };
      }
      return {
        ok: false,
        status: "unsupported",
        message: "goBack is not available on this screen.",
      };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── list_screens ───────────────────────────────────────────────────────── */
export const listScreensTool = {
  name: "list_screens",
  schema: {
    description:
      "List every navigable screen in the app. Optionally filter by role (customer | seller) or a free-text query (e.g. 'checkout', 'product', 'seller admin'). Use this to discover what the agent can navigate to.",
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          enum: ["customer", "seller", "both"],
          description: "Filter by screen role.",
        },
        query: { type: "string", description: "Free-text filter." },
      },
    },
  },
  execute: async (args = {}) => {
    try {
      const { listScreens } = await import("../services/screenMap");
      const screens = listScreens({ role: args.role, query: args.query });
      return {
        ok: true,
        status: "done",
        count: screens.length,
        screens: screens.map((s) => ({
          name: s.name,
          role: s.role,
          label: s.label,
          description: s.description,
        })),
        summary:
          screens.length === 0
            ? "No screens matched the filter."
            : `${screens.length} screen(s)${args.role ? ` (role=${args.role})` : ""}${
                args.query ? ` matching "${args.query}"` : ""
              }: ${screens.map((s) => s.name).join(", ")}`,
      };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── get_screen_info ────────────────────────────────────────────────────── */
export const getScreenInfoTool = {
  name: "get_screen_info",
  schema: {
    description:
      "Get the full description of a single screen — its components, tap targets, and which tools work on it. Use this before navigating or before tapping a target.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Screen name (e.g. 'ProductDetail', 'Checkout', 'SellerAdmin').",
        },
      },
      required: ["name"],
    },
  },
  execute: async (args = {}) => {
    try {
      const { getScreenInfo } = await import("../services/screenMap");
      const info = getScreenInfo(args.name);
      if (!info) {
        return {
          ok: false,
          status: "not_found",
          message: `No screen with name "${args.name}". Call list_screens() to see what's available.`,
        };
      }
      return {
        ok: true,
        status: "done",
        screen: info,
        summary: `${info.label} (${info.role}) — ${info.description}`,
      };
    } catch (e) {
      return { ok: false, status: "error", message: e?.message || String(e) };
    }
  },
};

/* ── list_tap_targets ──────────────────────────────────────────────────── */
export const listTapTargetsTool = {
  name: "list_tap_targets",
  schema: {
    description:
      "List every currently-registered tap target id on the active screen. Use this to find out what the user can tap on right now.",
    parameters: { type: "object", properties: {} },
  },
  execute: async (_args = {}, ctx = {}) => {
    if (typeof ctx.listTapTargets !== "function") {
      return {
        ok: false,
        status: "unsupported",
        message: "Tap registry unavailable.",
      };
    }
    const list = ctx.listTapTargets();
    return {
      ok: true,
      status: "done",
      count: list.length,
      targets: list,
      summary:
        list.length === 0
          ? "No tap targets are currently registered on this screen."
          : `${list.length} tap target(s): ${list.map((t) => t.id).join(", ")}`,
    };
  },
};

/* ── Registry ──────────────────────────────────────────────────────────────
 * Single source of truth for client-side tools. executeToolCall iterates
 * this to dispatch. Adding a new tool = adding a new entry here.
 */
export const AGENT_TOOLS = [
  readScreenTool,
  findOnScreenTool,
  scrollTool,
  scrollToTool,
  waitForTool,
  getAppStateTool,
  dismissOverlayTool,
  tapElementTool,
  goBackTool,
  listScreensTool,
  getScreenInfoTool,
  listTapTargetsTool,
];

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);
