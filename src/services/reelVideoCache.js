// Reel video caching
// ---------------------------------------------------------------------------
// Caches each reel's video locally so it is only fetched from Cloudflare R2
// once. On subsequent views (e.g. scroll up and back) the video plays from the
// device, avoiding repeated data usage on metered connections.
//
// HLS (.m3u8) is preferred over the plain MP4 because it is adaptive and much
// smaller per-rendition. We download the playlist and all of its segment files
// into a per-reel cache directory, then rewrite the playlist to reference the
// local segment paths so the native player can serve it fully offline.
//
// For reels that only expose a plain MP4 (video_url), we fall back to
// downloading that single file.
// ---------------------------------------------------------------------------

// expo-file-system v57 deprecated getInfoAsync/downloadAsync/makeDirectoryAsync/
// writeAsStringAsync on the main entry (they now throw). The working
// implementation lives in the legacy subpath, which is what we need here.
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const CACHE_MAP_KEY = "expressmart.cache.reels.videos";

// ── helpers ────────────────────────────────────────────────────────────────
const extFromUrl = (url) => {
  const clean = String(url || "").split("?")[0];
  const seg = clean.split("/").pop() || "";
  const ext = seg.includes(".") ? seg.split(".").pop().toLowerCase() : "";
  if (["mp4", "mov", "m4v", "webm"].includes(ext)) return ext;
  return "mp4";
};

const resolveUrl = (uri, base) => {
  if (/^https?:\/\//i.test(uri)) return uri;
  const baseDir = base.split("?")[0].substring(0, base.lastIndexOf("/") + 1);
  return baseDir + uri;
};

const fetchText = async (url) => {
  const res = await fetch(url);
  return res.text();
};

const isMasterPlaylist = (text) => /#EXT-X-STREAM-INF/.test(text);

// From a master playlist, pick the lowest-bandwidth rendition (smallest to
// download/cache) and return its absolute URL.
const pickLowestVariant = (text, baseUrl) => {
  const lines = text.split("\n");
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const m = line.match(/BANDWIDTH=(\d+)/);
      const bw = m ? parseInt(m[1], 10) : 0;
      const uri = lines[i + 1]?.trim();
      if (uri && !uri.startsWith("#")) {
        variants.push({ bw, uri: resolveUrl(uri, baseUrl) });
      }
    }
  }
  if (!variants.length) return null;
  variants.sort((a, b) => a.bw - b.bw);
  return variants[0].uri;
};

// Download every segment in a variant playlist into `dir`, rewriting each
// segment line to a relative local filename. Returns the rewritten playlist text.
const downloadVariantSegments = async (variantText, variantUrl, dir) => {
  const lines = variantText.split("\n");
  const base = variantUrl.split("?")[0].substring(0, variantUrl.lastIndexOf("/") + 1);
  let segIndex = 0;
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    // Keep tags/comments as-is; only rewrite actual media/playlist URLs.
    if (!line || line.startsWith("#")) {
      out.push(raw);
      continue;
    }
    // Skip nested playlists (already resolved to a single variant above).
    if (line.endsWith(".m3u8")) {
      out.push(raw);
      continue;
    }
    const segUrl = /^https?:\/\//i.test(line) ? line : base + line;
    const segExt = (segUrl.split("?")[0].split(".").pop() || "ts").split(/[^a-z0-9]/i)[0];
    const localName = `seg${String(segIndex).padStart(4, "0")}.${segExt}`;
    segIndex++;
    const dest = dir + localName;
    try {
      const dl = await FileSystem.downloadAsync(segUrl, dest);
      if (dl.status !== 200) {
        out.push(line); // fallback to remote if a segment fails
        continue;
      }
    } catch {
      out.push(line); // fallback to remote if a segment fails
      continue;
    }
    out.push(localName);
  }
  return out.join("\n");
};

// ── cache map (reel id -> local file URI) ──────────────────────────────────
const readMap = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeMap = async (map) => {
  try {
    await AsyncStorage.setItem(CACHE_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("Failed to persist reel video cache map:", e);
  }
};

// Returns the local file URI for a reel if already cached and still on disk.
export const getLocalVideoUri = async (reelId) => {
  if (Platform.OS === "web") return null;
  try {
    const map = await readMap();
    const uri = map[reelId];
    if (!uri) return null;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
    delete map[reelId];
    await writeMap(map);
    return null;
  } catch {
    return null;
  }
};

// Cache a plain MP4 (fallback when no HLS is available).
export const cacheVideo = async (reelId, remoteUrl) => {
  if (Platform.OS === "web" || !remoteUrl) return null;
  try {
    const ext = extFromUrl(remoteUrl);
    const dest = `${FileSystem.cacheDirectory}reel-${reelId}.${ext}`;
    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      const dl = await FileSystem.downloadAsync(remoteUrl, dest);
      if (dl.status !== 200) return null;
    }
    const map = await readMap();
    map[reelId] = dest;
    await writeMap(map);
    return dest;
  } catch (e) {
    console.warn("Reel MP4 cache failed:", e);
    return null;
  }
};

// Cache an HLS reel: download the playlist + all segment files locally and
// return the local .m3u8 URI. Picks the lowest-bandwidth rendition to keep the
// cache small (smaller than a single full-bitrate MP4).
export const cacheHls = async (reelId, hlsUrl) => {
  if (Platform.OS === "web" || !hlsUrl) return null;
  try {
    const dir = `${FileSystem.cacheDirectory}reel-${reelId}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const localPlaylist = `${dir}index.m3u8`;

    const map = await readMap();
    const existing = await FileSystem.getInfoAsync(localPlaylist);
    if (existing.exists) {
      map[reelId] = localPlaylist;
      await writeMap(map);
      return localPlaylist;
    }

    let targetUrl = hlsUrl;
    let targetText = await fetchText(hlsUrl);

    // If this is a master playlist, resolve to the smallest rendition only.
    if (isMasterPlaylist(targetText)) {
      const variant = pickLowestVariant(targetText, hlsUrl);
      if (variant) {
        targetUrl = variant;
        targetText = await fetchText(variant);
      }
    }

    const rewritten = await downloadVariantSegments(targetText, targetUrl, dir);
    await FileSystem.writeAsStringAsync(localPlaylist, rewritten);

    map[reelId] = localPlaylist;
    await writeMap(map);
    return localPlaylist;
  } catch (e) {
    console.warn("Reel HLS cache failed:", e);
    return null;
  }
};

// Convenience: cache whichever source is available, preferring HLS (smaller).
export const cacheReelVideo = async (reelId, { hlsUrl, videoUrl }) => {
  if (hlsUrl) {
    const local = await cacheHls(reelId, hlsUrl);
    if (local) return local;
  }
  if (videoUrl) return cacheVideo(reelId, videoUrl);
  return null;
};