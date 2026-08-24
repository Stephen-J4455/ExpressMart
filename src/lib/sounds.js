// One-shot UI sound effects played via expo-audio.
// Currently used for the product "like" (wishlist) action.

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import bubbleSfx from "../../assets/sound/mixkit-soap-bubble-sound-2925.wav";

let player = null;
let audioModeConfigured = false;

const ensurePlayer = () => {
  if (!player) {
    player = createAudioPlayer(bubbleSfx);
  }
  return player;
};

/**
 * Play the soap-bubble "pop" sound when a user likes a product.
 * Fire-and-forget: failures are swallowed so liking never breaks UX.
 */
export const playLikeSound = async () => {
  try {
    if (!audioModeConfigured) {
      await setAudioModeAsync({ playsInSilentMode: true });
      audioModeConfigured = true;
    }
    const p = ensurePlayer();
    p.seekTo(0);
    p.play();
  } catch {
    /* non-critical */
  }
};
