// hiddenSellers
// ---------------------------------------------------------------------------
// "Hide seller" is a per-device preference. When a user dismisses a feed post
// because they don't want to see that seller anymore, we record the seller
// id locally in AsyncStorage so we can filter future feed loads on this
// device — no server round-trip required.
//
// The storage shape is a JSON array of seller ids: { hidden: string[] }.
// Stored under a single key so reads/writes are O(1) and easy to wipe.
//
// Consumers:
//   * HomeScreen / FeedScreen → filter products whose seller is in the list
//   * Settings (future)        → "Manage hidden sellers" screen
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "expressmart.hidden_sellers.v1";

let cachedList = null; // in-memory mirror, valid for the lifetime of the app
let inflightLoad = null; // de-dupe concurrent loads

const sanitize = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || "").trim())
    .filter(Boolean);
};

const writeCache = (list) => {
  cachedList = list;
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ hidden: list })).catch(
    (e) => {
      console.warn("[hiddenSellers] persist failed:", e?.message);
    },
  );
};

/**
 * Read the current hidden-sellers list. Cached in-memory after the first call
 * for the lifetime of the app — call `clearHiddenSellersCache()` if you need
 * to force a re-read (e.g. after a sign-out).
 */
export const loadHiddenSellers = async () => {
  if (cachedList) return cachedList;
  if (inflightLoad) return inflightLoad;
  inflightLoad = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) {
        cachedList = [];
        return cachedList;
      }
      try {
        const parsed = JSON.parse(raw);
        cachedList = sanitize(parsed?.hidden);
      } catch {
        cachedList = [];
      }
      return cachedList;
    })
    .catch((e) => {
      console.warn("[hiddenSellers] load failed:", e?.message);
      cachedList = [];
      return cachedList;
    })
    .finally(() => {
      inflightLoad = null;
    });
  return inflightLoad;
};

/**
 * Hide a seller — adds the id to the local list and persists. No-op when the
 * id is missing/empty or already hidden. Returns the updated list.
 */
export const hideSeller = async (sellerId) => {
  const id = String(sellerId || "").trim();
  if (!id) return cachedList || [];
  const current = await loadHiddenSellers();
  if (current.includes(id)) return current;
  const next = [...current, id];
  await writeCache(next);
  return next;
};

/**
 * Unhide a seller — removes the id from the list and persists. Returns the
 * updated list.
 */
export const unhideSeller = async (sellerId) => {
  const id = String(sellerId || "").trim();
  if (!id) return cachedList || [];
  const current = await loadHiddenSellers();
  const next = current.filter((x) => x !== id);
  await writeCache(next);
  return next;
};

/**
 * Wipe the in-memory cache so the next read goes back to AsyncStorage.
 * Useful on logout, or when running tests.
 */
export const clearHiddenSellersCache = () => {
  cachedList = null;
  inflightLoad = null;
};

/**
 * Returns true if the seller is currently in the hidden list. Reads from the
 * cache; if the cache hasn't been populated yet, returns false (the user
 * hasn't hidden anyone on this device yet).
 */
export const isSellerHidden = (sellerId) => {
  if (!cachedList || !sellerId) return false;
  return cachedList.includes(String(sellerId));
};

export const HIDDEN_SELLERS_KEY = STORAGE_KEY;