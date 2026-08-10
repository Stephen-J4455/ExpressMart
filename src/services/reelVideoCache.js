// ---------------------------------------------------------------------------
// reelVideoCache.js
// Caches reel MP4s locally (one download per URL) so the feed plays from disk
// instead of re-streaming the remote source every time the user scrolls back to
// a video or navigates away and returns. Falls back to the streaming URL when
// a download hasn't finished or fails, so playback never blocks on the cache.
// ---------------------------------------------------------------------------
import * as FileSystem from "expo-file-system/legacy";

const REEL_CACHE_DIR = `${FileSystem.documentDirectory}reel_cache/`;

// In-flight downloads keyed by cache key so we don't start the same download
// twice (e.g. when the feed mounts multiple reel rows for the same video).
const _downloads = new Map();

// Build a safe, unique filename for a reel URL.
const keyForUrl = (url) => {
  try {
    const clean = String(url || "").split("?")[0];
    let name = clean.split("/").pop() || "reel.mp4";
    if (!name.includes(".")) name = `${name}.mp4`;
    // strip anything that isn't filesystem friendly
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  } catch (e) {
    return "reel.mp4";
  }
};

const localUriForUrl = (url) => `${REEL_CACHE_DIR}${keyForUrl(url)}`;

let _dirReady = null;
const ensureDir = () => {
  if (!_dirReady) {
    _dirReady = FileSystem.makeDirectoryAsync(REEL_CACHE_DIR, {
      intermediates: true,
    })
      .then(() => true)
      .catch(() => true);
  }
  return _dirReady;
};

/**
 * Returns the best available source for a reel:
 *  - If a local cached copy exists, returns its file:// URI.
 *  - Otherwise kicks off a background download (fire-and-forget) and returns
 *    the streaming URL so playback starts immediately without waiting.
 *
 * @param {string} streamUrl  The remote CDN/R2 URL.
 * @returns {Promise<{uri: string, cached: boolean}>}
 */
export async function getReelSource(streamUrl) {
  if (!streamUrl) return { uri: "", cached: false };
  const localUri = localUriForUrl(streamUrl);
  try {
    await ensureDir();
    const info = await FileSystem.getInfoAsync(localUri);
    if (info?.exists && info?.size > 0) {
      return { uri: localUri, cached: true };
    }
  } catch (e) {
    // fall through to streaming + start download
  }
  // Not cached yet — start a background download and stream for now.
  downloadReel(streamUrl).catch(() => {});
  return { uri: streamUrl, cached: false };
}

/**
 * Downloads the reel MP4 to local storage (idempotent). Resolves with the
 * local file URI when done. Failures resolve to null so callers keep using
 * the streaming URL.
 */
export async function downloadReel(streamUrl) {
  if (!streamUrl) return null;
  const localUri = localUriForUrl(streamUrl);

  if (_downloads.has(streamUrl)) {
    return _downloads.get(streamUrl);
  }

  const task = (async () => {
    try {
      await ensureDir();
      const info = await FileSystem.getInfoAsync(localUri);
      if (info?.exists && info?.size > 0) return localUri;

      const download = FileSystem.createDownloadResumable(
        streamUrl,
        localUri,
        { headers: { Range: "bytes=0-" } },
      );
      const result = await download.downloadAsync();
      if (result?.status === 200 || result?.status === 206) {
        return localUri;
      }
      return null;
    } catch (e) {
      return null;
    }
  })();

  _downloads.set(streamUrl, task);
  const result = await task;
  // Keep the cached promise so repeated calls reuse it, but allow re-download
  // attempts if it failed.
  if (!result) _downloads.delete(streamUrl);
  return result;
}

/**
 * Preload (download) a reel into local storage without blocking. Safe to call
 * for upcoming feed items so they can play from disk.
 */
export function preloadReel(streamUrl) {
  if (!streamUrl) return;
  if (_downloads.has(streamUrl)) return;
  downloadReel(streamUrl).catch(() => {});
}