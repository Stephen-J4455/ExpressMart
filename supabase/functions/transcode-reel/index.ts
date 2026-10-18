// Supabase Edge Function: transcode-reel
// ---------------------------------------------------------------------------
// Enqueues a server-side HLS adaptive-bitrate (ABR) transcode job for a video
// that was just uploaded to Cloudflare R2. The actual encoding is performed by
// a self-hosted FFmpeg worker (see scripts/transcode-worker) that drains the
// `video_transcode_jobs` table; this function only records the intent.
//
// This keeps the client response fast: the compressed MP4 is immediately
// playable, and the higher-quality HLS rendition is attached asynchronously
// once the worker finishes.
//
// Expected POST body:
//   {
//     "sourceKey":    "reels/<uuid>-reel.mp4",
//     "ownerTable":   "reels" | "express_products",
//     "ownerId":      "<uuid>",
//     "hlsUrlColumn": "hls_url" | "video_hls_url"
//   }
//
// Returns:
//   { "jobId": "<uuid>", "status": "pending" }
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TranscodeRequest {
  sourceKey: string;
  ownerTable: string;
  ownerId: string;
  hlsUrlColumn?: string;
}

const VALID_TABLES = new Set(["reels", "express_products"]);
const VALID_COLUMNS = new Set(["hls_url", "video_hls_url"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Partial<TranscodeRequest>;

    if (!body.sourceKey || !body.ownerTable || !body.ownerId) {
      return json(
        { error: "sourceKey, ownerTable and ownerId are required" },
        400,
      );
    }

    if (!VALID_TABLES.has(body.ownerTable)) {
      return json({ error: `Unsupported ownerTable: ${body.ownerTable}` }, 400);
    }

    const hlsUrlColumn = VALID_COLUMNS.has(body.hlsUrlColumn ?? "")
      ? (body.hlsUrlColumn as string)
      : body.ownerTable === "express_products"
        ? "video_hls_url"
        : "hls_url";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "Supabase is not configured" }, 500);
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/video_transcode_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        source_key: body.sourceKey,
        owner_table: body.ownerTable,
        owner_id: body.ownerId,
        hls_url_column: hlsUrlColumn,
        status: "pending",
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Failed to insert transcode job:", res.status, detail);
      // A 42P01 ("relation does not exist") means the video_transcode_jobs
      // table has not been deployed yet. Surface an actionable message so the
      // operator knows to run supabase/schema/transcode-jobs.sql.
      if (/42P01|relation "video_transcode_jobs" does not exist/i.test(detail)) {
        console.error(
          "MISSING TABLE: public.video_transcode_jobs does not exist. " +
            "Run `supabase db execute --file supabase/schema/transcode-jobs.sql` " +
            "(or paste it into the Supabase SQL editor) and start the FFmpeg worker.",
        );
        return json(
          { error: "Transcode queue table missing — deploy supabase/schema/transcode-jobs.sql" },
          500,
        );
      }
      return json({ error: "Failed to enqueue transcode job" }, 500);
    }

    const [job] = await res.json();
    return json({ jobId: job.id, status: job.status }, 200);
  } catch (err) {
    console.error("transcode-reel error:", err);
    return json({ error: (err as Error)?.message ?? "Unknown error" }, 500);
  }
});