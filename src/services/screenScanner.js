// ── screenScanner — pure helpers for the TagAI "agent has eyes" capability ──
//
// All of these functions take the screen index (Map<id, itemEntry>) and run
// either synchronously (filters) or with a one-shot `measureInWindow` call
// (snapshots). They are wrapped by TagAIAssistantContext so screens never
// have to call them directly — the agent tools (`read_screen`,
// `find_on_screen`, `scroll`, `scroll_to`, `wait_for`) read the same Map.
//
// An "item" registered in the index looks like:
//   {
//     id:        'product-abc',
//     route:     'Home',                // owning screen
//     text:      'Wireless earbuds',    // human-readable label(s)
//     role:      'product' | 'button' | 'header' | 'link' | 'row' | ...,
//     ref:       <React ref to the View>,
//     meta:      { price, category, index, ... arbitrary tags },
//     surface:   'home-feed',           // optional scroll-surface key
//   }

const safeStr = (v) => (v == null ? "" : String(v));

const matchText = (item, q) => {
  if (!q) return true;
  const needle = String(q).toLowerCase().trim();
  if (!needle) return true;
  const haystack = [
    safeStr(item.text),
    safeStr(item.role),
    safeStr(item.meta?.label),
    safeStr(item.meta?.title),
    safeStr(item.meta?.price),
    safeStr(item.meta?.category),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

const matchRole = (item, role) => {
  if (!role) return true;
  return String(item.role || "").toLowerCase() === String(role).toLowerCase();
};

const summarize = (item) => ({
  id: item.id,
  text: item.text || null,
  role: item.role || null,
  meta: item.meta || null,
  surface: item.surface || null,
});

const measureItem = (item) =>
  new Promise((resolve) => {
    const ref = item?.ref;
    if (!ref || !ref.current || typeof ref.current.measureInWindow !== "function") {
      resolve(null);
      return;
    }
    try {
      ref.current.measureInWindow((x, y, w, h) => {
        if (
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(w) &&
          Number.isFinite(h) &&
          w > 0 &&
          h > 0 &&
          x > -9999 &&
          y > -9999
        ) {
          resolve({ x, y, width: w, height: h });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });

/**
 * Take a snapshot of items registered against the active route. Each item
 * is enriched with its screen rect (measured via the ref). Items that fail
 * to measure are dropped (they're not really on screen, anyway).
 *
 * Options:
 *   - maxItems: cap how many items to return (default 30)
 *   - region:   'viewport' (default) keeps only items overlapping the window
 *               bounds; 'all' returns every registered item regardless.
 */
export const takeScreenSnapshot = async (indexMap, options = {}) => {
  const { maxItems = 30, region = "viewport", route } = options;

  const list = [];
  for (const item of indexMap.values()) {
    if (route && item.route && item.route !== route) continue;
    list.push(item);
  }
  list.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const enriched = [];
  for (const item of list) {
    if (enriched.length >= maxItems) break;
    const rect = await measureItem(item);
    if (!rect) {
      if (region === "all") {
        enriched.push({ ...summarize(item), visible: false, rect: null });
      }
      continue;
    }
    enriched.push({ ...summarize(item), visible: true, rect });
  }

  return {
    route: route || null,
    count: enriched.length,
    items: enriched,
  };
};

/**
 * Find items matching a query (substring of text/label) on the active route.
 * Returns enriched items with their rects so the agent can immediately
 * call `point_to_element` against the top match.
 */
export const findItemsOnScreen = async (indexMap, query, options = {}) => {
  const { role, route, maxItems = 10, query: qText, text: qText2 } = options;
  const q = qText || qText2 || query;
  const list = [];
  for (const item of indexMap.values()) {
    if (route && item.route && item.route !== route) continue;
    if (!matchText(item, q)) continue;
    if (!matchRole(item, role)) continue;
    list.push(item);
  }
  const enriched = [];
  for (const item of list) {
    if (enriched.length >= maxItems) break;
    const rect = await measureItem(item);
    enriched.push({ ...summarize(item), visible: !!rect, rect });
  }
  return { count: enriched.length, items: enriched };
};

/** Clamp a scroll offset to safe bounds. */
export const clampOffset = (offset, maxOffset) => {
  if (!Number.isFinite(offset)) return 0;
  if (offset < 0) return 0;
  if (Number.isFinite(maxOffset) && offset > maxOffset) return maxOffset;
  return offset;
};

/**
 * scrollSurface — perform a directional scroll on the active surface.
 *
 * `direction`: 'up' | 'down' | 'left' | 'right'
 * `amount`:    'page' (≈1× viewport, default) | 'half' | number (px)
 */
export const scrollSurface = async (surface, opts = {}) => {
  if (!surface) {
    return {
      ok: false,
      status: "unsupported",
      message: "No scrollable surface is registered on the current screen.",
    };
  }
  const { direction = "down", amount = "page" } = opts;
  if (typeof surface.measure !== "function") {
    return { ok: false, status: "unsupported", message: "Surface cannot be measured." };
  }
  const layout = await new Promise((resolve) => {
    try {
      surface.measure((_x, _y, w, h) => resolve({ w, h }));
    } catch {
      resolve(null);
    }
  });
  if (!layout) {
    return { ok: false, status: "error", message: "Could not measure surface." };
  }
  const pageH = layout.h || 0;
  const px =
    amount === "page" ? pageH : amount === "half" ? pageH / 2 : Number(amount) || pageH;
  const dx = direction === "left" ? -px : direction === "right" ? px : 0;
  const dy = direction === "up" ? -px : direction === "down" ? px : 0;
  if (dx === 0 && dy === 0) {
    return { ok: false, status: "error", message: `Unknown direction: ${direction}` };
  }
  if (typeof surface.scrollBy === "function") {
    surface.scrollBy(dx, dy, true);
  } else if (typeof surface.scrollTo === "function") {
    // No absolute offset known — fall back to a best-effort relative scroll.
    surface.scrollTo({ x: 0, y: 0, animated: true });
  } else {
    return {
      ok: false,
      status: "unsupported",
      message: "Surface does not support scrolling.",
    };
  }
  return { ok: true, status: "done", direction, delta: { dx, dy } };
};

/**
 * scrollToItem — scroll the active surface until the named item is on screen.
 * Uses the item's `surface` field to find the right scrollable.
 */
export const scrollToItem = async (itemId, indexMap, surface) => {
  if (!itemId) return { ok: false, status: "error", message: "Missing item id." };
  const item = indexMap.get(String(itemId));
  if (!item) {
    return { ok: false, status: "not_found", message: `No indexed item with id ${itemId}.` };
  }
  if (!surface || typeof surface.scrollToIndex !== "function") {
    return {
      ok: false,
      status: "unsupported",
      message: "Active surface can't scroll by index.",
    };
  }
  const idx = Number(item?.meta?.index);
  if (!Number.isFinite(idx)) {
    return {
      ok: false,
      status: "error",
      message: "Item has no index metadata; can't scroll to it.",
    };
  }
  try {
    surface.scrollToIndex({ index: idx, animated: true, viewPosition: 0.1 });
    return { ok: true, status: "done", index: idx };
  } catch (e) {
    return { ok: false, status: "error", message: e?.message || "scrollToIndex failed." };
  }
};

/**
 * waitFor — poll the index until a predicate matches (or timeout).
 * Used by the `wait_for` tool.
 */
export const waitFor = async (predicate, options = {}) => {
  const { timeout_ms = 4000, poll_ms = 250, indexMap, route } = options;
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await runPredicate(predicate, indexMap, route);
    if (result.matched) return { ok: true, status: "done", items: result.items };
    if (Date.now() - start > timeout_ms) {
      return { ok: false, status: "timeout", message: "Predicate never matched." };
    }
    await new Promise((r) => setTimeout(r, poll_ms));
  }
};

const runPredicate = async (predicate, indexMap, route) => {
  if (!predicate || typeof predicate !== "object") return { matched: true, items: [] };
  const items = await findItemsOnScreen(indexMap, predicate.text, {
    role: predicate.role,
    route,
    maxItems: 5,
  });
  return { matched: items.count > 0, items: items.items };
};

