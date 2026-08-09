import { createContext } from "react";

// Lightweight singleton registry so LazyImage components can be told when the
// nearest scroll container scrolls, without re-rendering the whole tree.
const subscribers = new Set();

export const LazyScrollContext = createContext(null);

export const lazyScroll = {
  viewportHeight: 800,
  lastScrollY: 0,
  register: (cb) => subscribers.add(cb),
  unregister: (cb) => subscribers.delete(cb),
  notify: (scrollY) => {
    lazyScroll.lastScrollY = scrollY;
    subscribers.forEach((cb) => {
      try {
        cb(scrollY);
      } catch (e) {
        // ignore individual subscriber errors
      }
    });
  },
};