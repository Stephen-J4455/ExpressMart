// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare R2 storage service (images / avatars / statuses / ads)
//
// NEW uploads go to R2 through the `get-r2-upload-url` Supabase Edge Function
// (presigned PUT), so R2 credentials never live in the app bundle. Deletes go
// through the existing `delete-r2-object` Edge Function.
//
// LEGACY files remain in Supabase Storage — no data migration was performed.
// `resolveMediaUrl` therefore keeps Supabase Storage URLs pointing at Supabase
// and only builds CDN URLs for bare object paths / R2 keys.
//
// Key layout in the R2 bucket (`expressmart-media`) for new uploads:
//   profile/{userId}/avatar-<ts>.jpg
//   express-products/products/{sellerId}/product-<ts>-<rand>.jpg
//   seller-statuses/{sellerId}/<ts>.jpg
//   ad-images/ad-<ts>-<rand>.jpg
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from "react-native";
import { supabase } from "../lib/supabase";
// Static import (NOT dynamic): lazily `import()`-ing this module deep inside
// the upload flow caused odd dev-mode crashes ("Cannot read property 'reload'
// of undefined") when Metro had to resolve the extra module mid-request.
import * as FileSystem from "expo-file-system/legacy";

const UPLOAD_URL_FUNCTION = "get-r2-upload-url";
const DELETE_OBJECT_FUNCTION = "delete-r2-object";

// Public CDN domain for the R2 bucket. Keep in sync with the edge function's
// R2_PUBLIC_DOMAIN secret. Used to build public URLs without a network call.
export const R2_PUBLIC_DOMAIN = "https://cdn.expressmart.com";

// Logical buckets that were migrated from Supabase Storage 1:1.
export const R2_FOLDERS = {
  PROFILE: "profile",
  PRODUCTS: "express-products",
  STATUSES: "seller-statuses",
  ADS: "ad-images",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export const getFileExtension = (uri, fallback = "jpg") => {
  const seg = String(uri || "").split("?")[0].split("#")[0].split("/").pop() || "";
  if (!seg.includes(".")) return fallback;
  const ext = seg.split(".").pop()?.toLowerCase();
  if (!ext || ext.length > 5) return fallback;
  return ext === "jpeg" ? "jpg" : ext;
};

export const getImageMimeType = (uri, fallback = "image/jpeg") => {
  const ext = getFileExtension(uri);
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    case "jpg":
      return "image/jpeg";
    default:
      return fallback;
  }
};

/** Build the public CDN URL for an R2 object key. */
export const r2PublicUrl = (key) =>
  `${R2_PUBLIC_DOMAIN.replace(/\/+$/g, "")}/${String(key || "").replace(/^\/+/, "")}`;

/**
 * Resolve any stored media reference to a fetchable URL:
 *  - absolute http(s)/file URIs pass through untouched (legacy Supabase URLs
 *    keep working as-is — existing files were NOT migrated);
 *  - bare object paths are treated as `<folder>/<path>` keys on the R2 CDN
 *    (only new uploads store bare paths).
 */
export const resolveMediaUrl = (rawValue, folder = null) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value.split("?")[0];
  }
  if (value.startsWith("file://")) return value;

  const cleanPath = value.replace(/^\/+/, "");
  if (!folder) return r2PublicUrl(cleanPath);
  // Avoid double-prefixing when callers pass already-prefixed keys.
  if (cleanPath.startsWith(`${folder}/`)) return r2PublicUrl(cleanPath);
  return r2PublicUrl(`${folder}/${cleanPath}`);
};

/**
 * Detect where a stored media reference lives:
 *  - "supabase" for legacy Supabase Storage URLs;
 *  - "r2" for CDN-domain URLs or bare object keys (new uploads).
 */
export const getStorageBackend = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  if (/storage\/v1\/object\//i.test(value)) return "supabase";
  if (/^https?:\/\//i.test(value)) {
    return value.startsWith(R2_PUBLIC_DOMAIN.replace(/\/+$/g, "")) ? "r2" : null;
  }
  return "r2"; // bare path → new-style R2 key
};

/** Extract the storage key from a stored URL (R2 CDN or legacy Supabase). */
export const getKeyFromUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const clean = url.split("?")[0];

  const cdnBase = R2_PUBLIC_DOMAIN.replace(/\/+$/g, "");
  if (clean.startsWith(cdnBase)) {
    return decodeURIComponent(clean.slice(cdnBase.length).replace(/^\/+/, "")) || null;
  }

  const match = clean.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+)$/i);
  if (match) {
    return `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
  }
  return null;
};

// ── Presigned upload flow ────────────────────────────────────────────────────

async function fetchPresignedUploadUrl(fileName, fileType, folder) {
  const { data, error } = await supabase.functions.invoke(UPLOAD_URL_FUNCTION, {
    body: { fileName, fileType, folder },
  });
  if (error) throw new Error(error.message || "Failed to request upload URL");
  if (!data?.uploadUrl || !data?.publicUrl) {
    throw new Error("Upload service returned an invalid response");
  }
  return data; // { uploadUrl, publicUrl, key }
}

async function putToR2(uploadUrl, body, contentType) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`);
  }
}

/**
 * Read a local asset URI into an uploadable body:
 * Blob on web, ArrayBuffer on native (works with plain fetch PUT).
 */
async function readAssetBody(uri, pickedFile = null) {
  try {
    if (pickedFile instanceof Blob) return pickedFile;
    if (Platform.OS === "web") {
      const response = await fetch(uri);
      const blob = await response.blob();
      if (!blob) throw new Error("blob was empty");
      return blob;
    }
    // Native: read base64 and decode to bytes for a reliable binary PUT.
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (err) {
    throw new Error(
      `Could not read the selected file (${uri}): ${
        err?.message || String(err)
      }`,
    );
  }
}

/**
 * Upload a local image to R2 via a presigned URL.
 *
 * @param {object} opts
 * @param {string} opts.uri            Local asset URI from the picker.
 * @param {Blob|null} [opts.pickedFile] Web File/Blob when available.
 * @param {string} opts.folder         R2 key prefix, e.g. "profile/<userId>".
 * @param {string} [opts.fileName]     Optional base file name.
 * @returns {Promise<{publicUrl: string, key: string}>}
 */
export const uploadToR2Presigned = async ({
  uri,
  pickedFile = null,
  folder,
  fileName = null,
}) => {
  if (!uri) throw new Error("A local file URI is required");
  if (!folder) throw new Error("An R2 folder prefix is required");

  const ext = getFileExtension(uri);
  const safeName =
    fileName ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const contentType = pickedFile?.type || getImageMimeType(uri);

  try {
    const { uploadUrl, publicUrl, key } = await fetchPresignedUploadUrl(
      safeName,
      contentType,
      folder,
    );

    const body = await readAssetBody(uri, pickedFile);
    await putToR2(uploadUrl, body, contentType);

    return { publicUrl, key };
  } catch (err) {
    // Surface WHICH stage failed so upload issues are diagnosable from the
    // console alone (presigned-URL request vs local file read vs PUT).
    const stage = err?.message?.startsWith("Could not read")
      ? "reading file"
      : err?.message?.startsWith("Upload failed")
      ? "uploading to storage"
      : "requesting upload URL";
    console.error(
      `[r2Storage] upload failed during ${stage}:`,
      err?.stack || err,
    );
    throw new Error(
      `${stage.charAt(0).toUpperCase() + stage.slice(1)} failed: ${
        err?.message || String(err)
      }`,
    );
  }
};

/** Delete an object from R2 via the delete-r2-object Edge Function. */
export const deleteFromR2 = async (key) => {
  if (!key) throw new Error("An R2 object key is required");
  const { error } = await supabase.functions.invoke(DELETE_OBJECT_FUNCTION, {
    body: { key },
  });
  if (error) throw new Error(error.message || "Failed to delete file");
};

/** Delete a legacy object from Supabase Storage by bucket + path. */
export const deleteFromSupabase = async (bucket, path) => {
  if (!bucket || !path) throw new Error("Bucket and path are required");
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(error.message || "Failed to delete file");
};

/**
 * Delete a stored media reference from wherever it lives:
 * legacy Supabase Storage URLs → Supabase, everything else → R2.
 */
export const deleteMediaByUrl = async (url) => {
  if (!url || typeof url !== "string") {
    throw new Error("A media URL is required");
  }
  if (getStorageBackend(url) === "supabase") {
    const match = url
      .split("?")[0]
      .match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+)$/i);
    if (!match) throw new Error("Could not parse Supabase storage URL");
    return deleteFromSupabase(
      decodeURIComponent(match[1]),
      decodeURIComponent(match[2]),
    );
  }
  const key = getKeyFromUrl(url);
  if (!key) throw new Error("Could not determine storage key from URL");
  return deleteFromR2(key);
};
