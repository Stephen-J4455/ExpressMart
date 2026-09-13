// Supabase Edge Function: get-r2-upload-url
// ---------------------------------------------------------------------------
// Generates a short-lived (15-minute) presigned PUT upload URL for Cloudflare R2
// and returns the corresponding public CDN asset URL.
//
// Runtime: Supabase Deno Edge Runtime
//
// NOTE: Signing is done with the built-in Web Crypto API (crypto.subtle) using
// the AWS Signature Version 4 algorithm — no external packages are imported so
// the function bundles reliably in Supabase's esbuild pipeline.
//
// Expected POST body:
//   {
//     "fileName": "my-video.mp4",
//     "fileType": "video/mp4",
//     "folder":   "reels"      // optional, defaults to "reels"
//   }
//
// Returns:
//   {
//     "uploadUrl": "https://<accountId>.r2.cloudflarestorage.com/...?X-Amz-...",
//     "publicUrl": "https://<publicDomain>/<folder>/<fileName>"
//   }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers required for React Native (and web) clients to call this
// function directly from the device.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Shape of the incoming request body.
interface UploadUrlRequest {
  fileName: string;
  fileType: string;
  folder?: string;
}

// Shape of the successful response.
interface UploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

// How long the presigned URL should remain valid (15 minutes).
const URL_EXPIRY_SECONDS = 15 * 60;

// ── AWS SigV4 helpers (built on Deno's Web Crypto) ───────────────────────────

const encoder = new TextEncoder();

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(sig);
}

async function hmacSha256Hex(key: ArrayBuffer | Uint8Array, message: string) {
  const raw = await hmacSha256(key, message);
  return [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive the SigV4 signing key for the supplied credentials.
 */
async function getSignatureKey(
  key: string,
  datestamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmacSha256(encoder.encode("AWS4" + key), datestamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Build a presigned PUT URL for Cloudflare R2 using AWS Signature V4.
 *
 * The generated URL carries the `X-Amz-*` query parameters and a final
 * `X-Amz-Signature`. The client must PUT with the same signed headers
 * (`host` and `content-type`).
 */
async function createPresignedUrl(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string,
  key: string,
  fileType: string,
): Promise<string> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const method = "PUT";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucketName}/${key}`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  // Signed headers: host + content-type (client PUTs with Content-Type set).
  const signedHeaders = "content-type;host";
  const canonicalHeaders =
    `content-type:${fileType}\n` +
    `host:${host}\n`;

  // Query parameters (sorted, URL-encoded values) for the canonical request.
  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(URL_EXPIRY_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalQuery = Object.keys(queryParams)
    .map(
      (k) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`,
    )
    .sort()
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  return `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

serve(async (req: Request) => {
  // Preflight CORS handling for mobile/Web clients.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Validate and read the request body ──────────────────────────────────
    const body = (await req.json()) as Partial<UploadUrlRequest>;

    if (!body.fileName || !body.fileType) {
      return new Response(
        JSON.stringify({ error: "fileName and fileType are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Read R2 credentials from Supabase environment secrets ────────────────
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME");
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN");

    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucketName ||
      !publicDomain
    ) {
      console.error("Missing R2 environment secrets");
      return new Response(
        JSON.stringify({ error: "R2 storage is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Build a unique object key ────────────────────────────────────────────
    const folder = (body.folder || "reels").replace(/^\/+|\/+$/g, "");
    // Replace spaces and unsafe characters in the original file name.
    const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${folder}/${crypto.randomUUID()}-${safeName}`;

    // ── Generate the presigned upload URL and public CDN URL ─────────────────
    const uploadUrl = await createPresignedUrl(
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key,
      body.fileType,
    );

    // Public URL points at the R2 public bucket domain (custom/CDN domain).
    const publicUrl = `${publicDomain.replace(/\/+$/g, "")}/${key}`;

    const response: UploadUrlResponse = { uploadUrl, publicUrl, key };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});