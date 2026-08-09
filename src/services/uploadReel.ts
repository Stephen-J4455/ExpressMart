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
import { VideoCompressor } from "react-native-video-compressor";
import * as FileSystem from "expo-file-system";

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
const TARGET_WIDTH = 540;
const TARGET_HEIGHT = 960; // 9:16 vertical
const TARGET_BITRATE = 1_200_000; // ~1.2 Mbps

// ── Helper: invoke the presigned-URL edge function ───────────────────────────

interface PresignedResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

async function fetchPresignedUrl(
  fileName: string,
  fileType: string,
): Promise<PresignedResponse> {
  if (!supabase) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await supabase.functions.invoke(
    UPLOAD_URL_FUNCTION,
    {
      body: { fileName, fileType, folder: "reels" },
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
): Promise<UploadReelResult> {
  if (!localUri) throw new Error("A local video URI is required");

  // ── 1. Compress on device hardware to 540x960 @ ~1.2 Mbps ──────────────────
  onProgress?.({ phase: "compress", progress: 0, message: "Compressing…" });
  const compressedUri = await VideoCompressor.compress(localUri, {
    compressionMethod: "manual",
    videoBitRate: TARGET_BITRATE,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    fps: 30,
    maxFileSize: 0,
    onProgress: (p) => {
      // VideoCompressor reports 0..100.
      onProgress?.({
        phase: "compress",
        progress: Math.min(1, (p ?? 0) / 100),
      });
    },
  } as any);

  const fileType = "video/mp4";
  const fileName = `reel-${Date.now()}.mp4`;

  // ── 2. Fetch a presigned PUT URL from the edge function ────────────────────
  onProgress?.({ phase: "upload", progress: 0, message: "Preparing upload…" });
  const { uploadUrl, publicUrl, key } = await fetchPresignedUrl(
    fileName,
    fileType,
  );

  // ── 3. Upload the compressed file directly to R2 ───────────────────────────
  await uploadToR2(compressedUri, uploadUrl, fileType, onProgress);

  // ── 4. Persist metadata to the `reels` table ──────────────────────────────
  onProgress?.({ phase: "save", progress: 0, message: "Saving reel…" });

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

  onProgress?.({ phase: "save", progress: 1 });
  return {
    publicUrl,
    r2Key: key,
    reelId: (inserted as { id: string }).id,
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