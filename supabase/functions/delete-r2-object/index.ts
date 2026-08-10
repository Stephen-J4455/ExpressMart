// Supabase Edge Function: delete-r2-object
// ---------------------------------------------------------------------------
// Deletes an object from Cloudflare R2 using the AWS Signature Version 4
// algorithm (DELETE method). Used by the seller admin reels screen so a seller
// can permanently remove a reel video from the R2 bucket.
//
// Runtime: Supabase Deno Edge Runtime
//
// Expected POST body:
//   {
//     "key": "reels/<uuid>-reel.mp4"   // the stored R2 object key
//   }
//
// Returns:
//   { "success": true }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS headers required for React Native (and web) clients.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

async function deleteObject(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string,
  key: string,
): Promise<void> {
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const method = "DELETE";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucketName}/${key}`;
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // empty body sha256

  const signedHeaders = "host";
  const canonicalHeaders = `host:${host}\n`;

  const credential = `${accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`;
  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalQuery = Object.keys(queryParams)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
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

  const url = `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  const res = await fetch(url, { method: "DELETE" });
  // R2/S3 returns 204 (no content) on success and 200/404 if missing.
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`R2 delete failed with status ${res.status}: ${body}`);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as { key?: string };

    if (!body.key) {
      return new Response(
        JSON.stringify({ error: "key is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      console.error("Missing R2 environment secrets");
      return new Response(
        JSON.stringify({ error: "R2 storage is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Guard against deleting outside the bucket.
    const key = body.key.replace(/^\/+/, "");
    if (key.includes("..") || key.startsWith("/")) {
      return new Response(
        JSON.stringify({ error: "Invalid object key" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await deleteObject(
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      key,
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error deleting R2 object:", err);
    return new Response(
      JSON.stringify({ error: (err as Error)?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});