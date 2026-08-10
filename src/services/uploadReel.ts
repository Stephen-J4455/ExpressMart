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
// expo-file-system v57 deprecated getInfoAsync/readAsStringAsync on the main
// entry (they now throw). The working implementation lives in the legacy
// subpath, which is exactly what we need for reading local file sizes/bytes.
import * as FileSystem from "expo-file-system/legacy";

const DEBUG_REEL_UPLOADS = typeof __DEV__ !== "undefined" ? __DEV__ : true;
const ENABLE_SERVER_TRANSCODE_FALLBACK = false;

const logReelUpload = (...args: any[]) => {
  if (DEBUG_REEL_UPLOADS) {
    console.log("[uploadReel]", ...args);
  }
};

const getVideoUploadDetails = (uri: string) => {
  const cleanUri = String(uri || "").split("?")[0];
  const fileName = cleanUri.split("/").pop() || "video.mp4";
  const rawExt = fileName.includes(".") ? fileName.split(".").pop() : "";
  const ext = String(rawExt || "mp4").toLowerCase();

  if (ext === "mov" || ext === "qt") {
    return {
      fileName: fileName.endsWith(".mov") ? fileName : `${fileName}.mov`,
      contentType: "video/quicktime",
    };
  }

  if (ext === "m4v") {
    return {
      fileName: fileName.endsWith(".m4v") ? fileName : `${fileName}.m4v`,
      contentType: "video/mp4",
    };
  }

  return {
    fileName: fileName.endsWith(".mp4") ? fileName : `${fileName}.mp4`,
    contentType: "video/mp4",
  };
};

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
const REELS_TABLE = "reels";

// Live transcoding server (Node/Express). Kept here for later re-enable, but
// the temporary path below stays on-device so uploads do not depend on it.
//
//   e.g. "https://flmrp9wx-8080.uks1.devtunnels.ms"
//
// Leave empty to use the legacy on-device compression + R2 presigned flow only.
export const TRANSCODE_SERVER_URL = "https://flmrp9wx-8080.uks1.devtunnels.ms";

// When true, skip on-device compression entirely and always send the original
// video to the transcode server. The temporary client-only path ignores this.
export const FORCE_SERVER_TRANSCODE = false;

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

  const result = await uploadTask.uploadAsync();
  if (!result) {
    throw new Error("R2 upload failed: no response returned");
  }
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
): Promise<UploadReelResult> {
  if (!localUri) throw new Error("A local video URI is required");

  const { fileName, contentType } = getVideoUploadDetails(localUri);

  // ── Resolve the authenticated user + owning seller BEFORE any network call.
  onProgress?.({ phase: "upload", progress: 0, message: "Preparing upload…" });
  logReelUpload("start", { localUri, fileName, contentType });
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

  // ── 1. Fetch a presigned PUT URL from the edge function ────────────────────
  onProgress?.({ phase: "upload", progress: 0, message: "Uploading original video…" });
  const { uploadUrl, publicUrl, key } = await fetchPresignedUrl(
    fileName,
    contentType,
    `reels/${sellerId || user?.id || "unknown"}`,
  );

  // ── 2. Upload the original file directly to R2 ─────────────────────────────
  await uploadToR2(localUri, uploadUrl, contentType, onProgress);

  // ── 3. Persist metadata to the `reels` table ──────────────────────────────
  onProgress?.({ phase: "save", progress: 0, message: "Saving reel…" });

  const { reelId } = await insertReelRow({
    video_url: publicUrl,
    r2_key: key,
    productMeta,
    sellerId,
    userId: user?.id ?? null,
  });

  // Server transcode stays disabled for now while we debug client playback.
  logReelUpload("saved reel", { reelId, key, publicUrl });

  onProgress?.({ phase: "save", progress: 1 });
  return { publicUrl, r2Key: key, reelId };
}

// Insert a reel row and return its new id.
async function insertReelRow({
  video_url,
  r2_key,
  productMeta,
  sellerId,
  userId,
}: {
  video_url: string;
  r2_key: string;
  productMeta: ReelProductMeta;
  sellerId: string | null;
  userId: string | null;
}): Promise<{ reelId: string }> {
  const { data: inserted, error: insertError } = await supabase
    .from(REELS_TABLE)
    .insert({
      video_url,
      r2_key,
      title: productMeta.title,
      description: productMeta.description ?? null,
      price: productMeta.price,
      product_id: productMeta.product_id ?? null,
      category: productMeta.category ?? null,
      tags: productMeta.tags ?? [],
      seller_id: sellerId,
      user_id: userId,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Failed to insert reel:", insertError);
    throw new Error(insertError.message || "Failed to save reel metadata");
  }
  return { reelId: (inserted as { id: string }).id };
}

// Fallback path: send the ORIGINAL video to the live transcode server.
async function uploadViaServer(
  localUri: string,
  fileType: string,
  fileName: string,
  userId: string | null,
  sellerId: string | null,
  productMeta: ReelProductMeta,
  onProgress?: ReelProgressCallback,
): Promise<UploadReelResult> {
  // Insert the reel row first so we have an ownerId for the transcode server.
  onProgress?.({ phase: "save", progress: 0, message: "Saving reel…" });
  const { reelId } = await insertReelRow({
    video_url: "",
    r2_key: "",
    productMeta,
    sellerId,
    userId,
  });

  // Upload the original video; server stores source to R2 + transcodes.
  const { publicUrl, r2Key } = await uploadToTranscodeServer(
    localUri,
    fileType,
    fileName,
    REELS_TABLE,
    reelId,
    onProgress,
  );

  // Persist the server-returned source URL/key on the reel row.
  const { error: patchError } = await supabase
    .from(REELS_TABLE)
    .update({ video_url: publicUrl, r2_key: r2Key })
    .eq("id", reelId);
  if (patchError) console.warn("Failed to patch reel source:", patchError);

  onProgress?.({ phase: "save", progress: 1 });
  return { publicUrl, r2Key, reelId };
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
