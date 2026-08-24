// ── Tab bar auto-hide (direction-aware) ──────────────────────────────────────
// Tiny pub/sub store shared between scrollable tab screens (which report
// their scroll position) and the mobile bottom tab bar (which hides/reveals).
//
// Convention (same as Instagram et al.):
//   • finger swipe UP   (content moves up, reading further down) → hide bar
//   • finger swipe DOWN (heading back toward newer/top content)  → show bar
//   • near the top of the list                                   → always show
//
// Only screens that opt in by calling updateTabBarOnScroll() drive the state,
// so other tabs are unaffected beyond the bar simply being visible again.

const subscribers = new Set();
let lastY = 0;
let hidden = false;

const HIDE_DELTA = 8; // px of upward travel before hiding
const SHOW_DELTA = 8; // px of downward travel before revealing
const TOP_ZONE = 60; // always show within this distance of the top

const emit = (value) => {
  subscribers.forEach((cb) => {
    try {
      cb(value);
    } catch (e) {
      // never let one subscriber break the rest
    }
  });
};

/** Feed scroll handlers call this with contentOffset.y. */
export const updateTabBarOnScroll = (y) => {
  const offset = Number(y || 0);
  const delta = offset - lastY;
  lastY = offset;

  if (offset <= TOP_ZONE) {
    if (hidden) {
      hidden = false;
      emit(false);
    }
    return;
  }

  if (delta > HIDE_DELTA && !hidden) {
    hidden = true;
    emit(true);
  } else if (delta < -SHOW_DELTA && hidden) {
    hidden = false;
    emit(false);
  }
};

/** Force the bar visible (e.g. filter change, pull-to-refresh, screen blur). */
export const showTabBar = () => {
  lastY = 0;
  if (hidden) {
    hidden = false;
    emit(false);
  }
};

/** Returns an unsubscribe function. */
export const subscribeTabBarVisibility = (cb) => {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
};
