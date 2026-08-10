// ---------------------------------------------------------------------------
// uploadReel.ts
// React Native client service for the "Reels" low-data short-video feature.
//
// Responsibilities:
//   1. Compress a raw local video URI to 540x960 (9:16) @ ~1.2 Mbps on device.
//   2. Ask the Supabase Edge Function `get-r2-upload-url` for a presigned PUT URL.
//   3. Upload the compressed MP4 directly to Cloudflare R2 with progress tracking.
//   4. Persist the resulting publicUrl + product metadata into the `reels` table.
// ---------------------------------------------------------------------------

import { supabase } from "../lib/supabase";
import { Video } from "react-native-compressor";
// expo-file-system v57 deprecated getInfoAsync/readAsStringAsync on the main
// entry (they now throw). The working implementation lives in the legacy
// subpath, which is exactly what we need for reading local file sizes/bytes.
import * as FileSystem from "expo-file-system/legacy";

// ── Type definitions ─────────────────────────────────────────────────────────

/** Product metadata that accompanies a reel upload. */
export interface ReelProductMeta {
  title: string;
  description?: string;
  price: number;
  product_id?: string | null; // existing express_products row, if any
  category?: string | null;
  tags?: string[]; // e.g. ["new", "trending"]
}

/** Result returned after a successful upload + DB insert. */
export interface UploadReelResult {
  publicUrl: string;
  r2Key: string;
  reelId: string;
}

/** Progress callback payload. `progress` is 0..1. */
export interface ReelUploadProgress {
  phase: "compress" | "upload" | "save";
  progress: number; // 0..1
  message?: string;
}

export type ReelProgressCallback = (p: ReelUploadProgress) => void;

// ── Configuration ───────────────────────────────────────────────────────────

const UPLOAD_URL_FUNCTION = "get-r2-upload-url";
const TRANSCODE_FUNCTION = "transcode-reel";
const REELS_TABLE = "reels";

// Compression presets (Strategy 1: client-side pre-upload compression).
// Videos are scaled down before upload to cut egress + storage, and encoded
// with H.264 (max device compatibility) and AAC-LC @ 128 kbps audio.
//
//  - "short" (1080x1920) for short-form reels — higher fidelity.
//  - "standard" (720x1280) for general user uploads — lighter, ~1 Mbps.
export type ReelCompressionPreset = "short" | "standard";

interface CompressionConfig {
  width: number;
  height: number; // 9:16 vertical
  videoBitRate: number; // bits/sec
  audioBitRate: number; // bits/sec (AAC-LC)
  codec: "h264" | "hevc";
}

const COMPRESSION_PRESETS: Record<ReelCompressionPreset, CompressionConfig> = {
  // Short-form reels: 1080p @ 2–4 Mbps, H.264 for universal compatibility.
  short: {
    width: 1080,
    height: 1920,
    videoBitRate: 3_000_000, // 3 Mbps (within the 2–4 Mbps target band)
    audioBitRate: 128_000, // AAC-LC @ 128 kbps
    codec: "h264",
  },
  // General uploads: 720p @ 1–2 Mbps.
  standard: {
    width: 720,
    height: 1280,
    videoBitRate: 1_500_000, // 1.5 Mbps (within the 1–2 Mbps target band)
    audioBitRate: 128_000, // AAC-LC @ 128 kbps
    codec: "h264",
  },
};

// Default preset used when the caller does not specify one.
const DEFAULT_PRESET: ReelCompressionPreset = "standard";

// ── Helper: invoke the presigned-URL edge function ───────────────────────────

interface PresignedResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

async function fetchPresignedUrl(
  fileName: string,
  fileType: string,
  folder: string = "reels",
): Promise<PresignedResponse> {
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase.functions.invoke(
    UPLOAD_URL_FUNCTION,
    {
      body: { fileName, fileType, folder },
    },
  );

  if (error) {
    console.error("get-r2-upload-url error:", error);
    throw new Error(error.message || "Failed to get upload URL");
  }

  if (!data?.uploadUrl || !data?.publicUrl) {
    throw new Error("Edge function returned an invalid response");
  }

  return data as PresignedResponse;
}

// ── Helper: PUT the file to R2 with progress (expo-file-system) ──────────────

async function uploadToR2(
  localUri: string,
  uploadUrl: string,
  fileType: string,
  onProgress?: ReelProgressCallback,
): Promise<void> {
  const totalBytes = (await FileSystem.getInfoAsync(localUri)).size ?? 0;

  if (!totalBytes) {
    // Fallback: no size info, just do a direct fetch upload (no progress).
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": fileType },
      body: bytes,
    });
    if (!res.ok) {
      throw new Error(`R2 upload failed with status ${res.status}`);
    }
    onProgress?.({ phase: "upload", progress: 1 });
    return;
  }

  // Use a streaming upload task so we can report progress.
  const uploadTask = FileSystem.createUploadTask(
    uploadUrl,
    localUri,
    {
      httpMethod: "PUT",
      headers: { "Content-Type": fileType },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    },
    (event) => {
      if (event.totalBytesSent && totalBytes > 0) {
        onProgress?.({
          phase: "upload",
          progress: Math.min(1, event.totalBytesSent / totalBytes),
        });
      }
    },
  );

  const result = await uploadTask;
  if (result.status !== 200) {
    throw new Error(`R2 upload failed with status ${result.status}`);
  }
  onProgress?.({ phase: "upload", progress: 1 });
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Compress + upload a local video as a product reel and save its metadata.
 *
 * @param localUri    Raw video URI returned by an image/video picker.
 * @param productMeta Product metadata to store alongside the reel.
 * @param onProgress  Optional progress callback for UI feedback.
 * @returns           The public CDN URL, R2 key, and new reel row id.
 */
export async function uploadReel(
  localUri: string,
  productMeta: ReelProductMeta,
  onProgress?: ReelProgressCallback,
  preset: ReelCompressionPreset = DEFAULT_PRESET,
): Promise<UploadReelResult> {
  if (!localUri) throw new Error("A local video URI is required");

  const cfg = COMPRESSION_PRESETS[preset] ?? COMPRESSION_PRESETS[DEFAULT_PRESET];

  // ── 1. Compress on device hardware (H.264 @ 720p/1080p, AAC-LC 128k) ───────
  // react-native-compressor's Video.compress accepts a `bitrate` (total) and a
  // `maxSize` (longest edge in px). It does not expose separate audio bitrate,
  // fps, or codec fields, so we approximate the target by summing the video +
  // audio bitrate and sizing to the longest preset dimension.
  onProgress?.({ phase: "compress", progress: 0, message: "Compressing…" });
  const compressedUri = await Video.compress(
    localUri,
    {
      compressionMethod: "manual",
      bitrate: cfg.videoBitRate + cfg.audioBitRate,
      maxSize: Math.max(cfg.width, cfg.height),
    } as any,
    (p) => {
      // react-native-compressor reports progress 0..100.
      onProgress?.({
        phase: "compress",
        progress: Math.min(1, (p ?? 0) / 100),
      });
    },
  );

  const fileType = "video/mp4";
  const fileName = `reel-${Date.now()}.mp4`;

  // ── 2. Resolve the authenticated user + owning seller BEFORE any network
  //        call (the upload folder and DB insert both depend on these). ───────
  onProgress?.({ phase: "upload", progress: 0, message: "Preparing upload…" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const sellerRes = user
    ? await supabase
        .from("express_sellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()
    : null;
  const sellerId = sellerRes?.data?.id ?? null;

  // ── 3. Fetch a presigned PUT URL from the edge function ────────────────────
  const { uploadUrl, publicUrl, key } = await fetchPresignedUrl(
    fileName,
    fileType,
    `reels/${sellerId || user?.id || "unknown"}`,
  );

  // ── 4. Upload the compressed file directly to R2 ───────────────────────────
  await uploadToR2(compressedUri, uploadUrl, fileType, onProgress);

  // ── 5. Persist metadata to the `reels` table ──────────────────────────────
  onProgress?.({ phase: "save", progress: 0, message: "Saving reel…" });

  const insertPayload = {
    video_url: publicUrl,
    r2_key: key,
    title: productMeta.title,
    description: productMeta.description ?? null,
    price: productMeta.price,
    product_id: productMeta.product_id ?? null,
    category: productMeta.category ?? null,
    tags: productMeta.tags ?? [],
    seller_id: sellerId,
    user_id: user?.id ?? null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from(REELS_TABLE)
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) {
    console.error("Failed to insert reel:", insertError);
    throw new Error(insertError.message || "Failed to save reel metadata");
  }

  const reelId = (inserted as { id: string }).id;

  // ── 5. Enqueue a server-side HLS transcode job (Strategy 2) ───────────────
  // The raw compressed MP4 is uploaded; a transcoder worker will later produce
  // multi-bitrate HLS segments (.m3u8 + .ts) for adaptive playback. This call
  // is best-effort: a failure here must NOT block the upload that already
  // succeeded, so we only log and continue.
  try {
    await supabase.functions.invoke(TRANSCODE_FUNCTION, {
      body: {
        sourceKey: key,
        ownerTable: REELS_TABLE,
        ownerId: reelId,
        hlsUrlColumn: "hls_url",
      },
    });
  } catch (transcodeErr) {
    console.warn("Failed to enqueue transcode job:", transcodeErr);
  }

  onProgress?.({ phase: "save", progress: 1 });
  return {
    publicUrl,
    r2Key: key,
    reelId,
  };
}

/**
 * Fetch a feed of reels (newest first) for the reels page.
 */
export async function fetchReels(limit = 20): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(REELS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchReels error:", error);
    return [];
  }
  return data ?? [];
}

/**
 * Fetch product reels: active products that have an attached showcase video
 * (`video_url`). Each product is normalised into the reel shape consumed by
 * FeedScreen so product videos can be browsed in the vertical reels feed.
 */
export async function fetchProductReels(limit = 30): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("express_products")
    .select(
      "id, title, price, description, video_url, video_hls_url, thumbnail, thumbnails, category, tags, view_count, total_ratings, seller_id(id,name,avatar)",
    )
    .eq("status", "active")
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchProductReels error:", error);
    return [];
  }

  const products = data ?? [];
  const productIds = products.map((product: any) => product.id).filter(Boolean);

  let likesByProductId: Record<string, number> = {};
  let commentsByProductId: Record<string, number> = {};

  if (productIds.length > 0) {
    const [{ data: wishlistRows }, { data: reviewRows }] = await Promise.all([
      supabase
        .from("express_wishlists")
        .select("product_id")
        .in("product_id", productIds),
      supabase
        .from("express_reviews")
        .select("product_id, comment")
        .in("product_id", productIds)
        .eq("is_approved", true),
    ]);

    likesByProductId = (wishlistRows ?? []).reduce(
      (acc: Record<string, number>, row: { product_id?: string | null }) => {
        if (!row?.product_id) return acc;
        acc[row.product_id] = (acc[row.product_id] || 0) + 1;
        return acc;
      },
      {},
    );

    commentsByProductId = (reviewRows ?? []).reduce(
      (acc: Record<string, number>, row: { product_id?: string | null; comment?: string | null }) => {
        if (!row?.product_id) return acc;
        if (!String(row.comment || "").trim()) return acc;
        acc[row.product_id] = (acc[row.product_id] || 0) + 1;
        return acc;
      },
      {},
    );
  }

  return products.map((product: any) => ({
    id: product.id,
    video_url: product.video_url,
    hls_url: product.video_hls_url || null,
    thumbnail_url: product.thumbnail || product.thumbnails?.[0] || null,
    title: product.title,
    price: product.price,
    description: product.description,
    product_id: product.id,
    seller: product.seller_id,
    category: product.category || null,
    tags: product.tags || [],
    view_count: product.view_count || 0,
    total_ratings: product.total_ratings || 0,
    likes_count: likesByProductId[product.id] || 0,
    comments_count: commentsByProductId[product.id] || 0,
  }));
}
