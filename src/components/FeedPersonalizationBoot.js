// FeedPersonalizationBoot
// ----------------------------------------------------------------------------
// Renders nothing; its only job is to mount the feedPersonalizationService
// once for the lifetime of the app. Lives inside `ShopProvider` so the
// service is available to all screens that fire trackEvent calls.
//
// Mounts:
//   - a 5s periodic flush of the in-memory event queue
//   - an AppState background flush
//   - an auth-state-change listener that clears the queue on sign-in/out
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { initFeedPersonalization } from "../services/feedPersonalizationService";

export const FeedPersonalizationBoot = () => {
  useEffect(() => {
    const cleanup = initFeedPersonalization();
    return cleanup;
  }, []);
  return null;
};

export default FeedPersonalizationBoot;
