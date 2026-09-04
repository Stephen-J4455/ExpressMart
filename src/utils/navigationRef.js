// Global navigation ref — lets non-component code (push notification taps,
// deep links) navigate without prop-drilling a navigation object around.
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

/**
 * Navigate to a screen once the container is ready. Returns false when the
 * navigator isn't mounted yet (e.g. app cold-started from a notification tap)
 * — callers should retry shortly.
 */
export function navigateToScreen(screen, params) {
  if (navigationRef.isReady()) {
    try {
      navigationRef.navigate(screen, params);
      return true;
    } catch (e) {
      console.warn("[navigationRef] navigate failed:", e?.message);
      return false;
    }
  }
  return false;
}

/**
 * Pop the current screen off the navigation stack. Returns true when the
 * navigator actually went back; false when the stack is at the root (no-op).
 */
export function goBack() {
  if (navigationRef.isReady()) {
    try {
      if (typeof navigationRef.canGoBack === "function" && !navigationRef.canGoBack()) {
        return false;
      }
      navigationRef.goBack();
      return true;
    } catch (e) {
      console.warn("[navigationRef] goBack failed:", e?.message);
      return false;
    }
  }
  return false;
}