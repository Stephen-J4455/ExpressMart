// HLS Transcode Worker (self-hosted / FFmpeg)
// ---------------------------------------------------------------------------
// Drains the `video_transcode_jobs` queue and produces multi-bitrate HLS
// (.m3u8 + .ts) renditions into Cloudflare R2 for adaptive playback.
//
// Runs in Node.js. Requires `ffmpeg` (libx264) on PATH and R2 + Supabase env.
// ---------------------------------------------------------------------------

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

// ── Config from environment ─────────────────────────────────────────────────
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN?.replace(/\/+$/g, "");
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/g, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);
const RUN_ONCE = process.argv.includes("--once");

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME ||
  !R2_PUBLIC_DOMAIN ||
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  console.error("Missing required environment variables. See README.md.");
  process.exit(1);
}

// ── HLS rendition ladder (Strategy 2: ABR) ──────────────────────────────────
// Each tier scales the source to a target height and caps bitrate so viewers
// on weak connections get 360p and strong connections get 1080p.
const RENDITIONS = [
  { name: "360p", height: 360, videoBitrate: "800k", audioBitrate: "64k" },
  { name: "480p", height: 480, videoBitrate: "1400k", audioBitrate: "96k" },
  { name: "720p", height: 720, videoBitrate: "2800k", audioBitrate: "128k" },
  { name: "1080p", height: 1080, videoBitrate: "5000k", audioBitrate: "128k" },
];

// ── AWS SigV4 (same algorithm the edge function uses) ───────────────────────
function sha256Hex(message) {
  return crypto.createHash("sha256").update(message).digest("hex");
}

function hmacSha256(key, message) {
  return crypto.createHmac("sha256", key).update(message).digest();
}

function getSignatureKey(key, datestamp, region, service) {
  const kDate = hmacSha256("AWS4" + key, datestamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

// Build a presigned GET (download) or PUT (upload) URL for R2.
function presignR2Url(key, method, contentType) {
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}`;
  const region = "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = `/${R2_BUCKET_NAME}/${key}`;
  const signedHeaders = "host";
  const credential = `${R2_ACCESS_KEY_ID}/${dateStamp}/${region}/${service}/aws4_request`;
  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "3600",
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(queryParams)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .sort()
    .join("&");
  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";
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
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");
  return `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function publicR2Url(key) {
  return `${R2_PUBLIC_DOMAIN}/${key}`;
}

// Simple GET → file.
function downloadTo(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);
    lib
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => reject(err));
      });
  });
}

// PUT a local file to R2 using a presigned URL.
function uploadFile(key, filePath, contentType) {
  const url = presignR2Url(key, "PUT", contentType);
  const body = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const u = new URL(url);
    const req = lib.request(
      {
        method: "PUT",
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { "Content-Type": contentType, "Content-Length": body.length },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () =>
            reject(new Error(`Upload failed ${res.statusCode}: ${data}`)),
          );
        } else {
          resolve();
        }
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Supabase REST helpers (service role) ────────────────────────────────────
function supabaseFetch(pathname, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${SUPABASE_URL}/rest/v1/${pathname}`);
    const req = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=representation",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Core job processing ─────────────────────────────────────────────────────
async function processNextJob() {
  // 1. Claim the oldest pending job.
  const listRes = await supabaseFetch(
    `video_transcode_jobs?status=eq.pending&order=created_at.asc&limit=1`,
  );
  if (listRes.status !== 200 || !Array.isArray(listRes.body) || listRes.body.length === 0) {
    return false; // nothing to do
  }
  const job = listRes.body[0];

  await supabaseFetch(`video_transcode_jobs?id=eq.${job.id}`, "PATCH", {
    status: "processing",
    updated_at: new Date().toISOString(),
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hls-"));
  const sourcePath = path.join(tmpDir, "source.mp4");
  const outDir = path.join(tmpDir, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const jobFolder = `${job.target_folder || "hls"}/${job.id}`;

  try {
    // 2. Download the compressed source from R2.
    const sourceUrl = presignR2Url(job.source_key, "GET");
    await downloadTo(sourceUrl, sourcePath);

    // 3. Build the ffmpeg command: one input, N video+audio variant streams,
    //    each with its own HLS playlist, stitched by a master playlist.
    const args = [
      "-i", sourcePath,
      "-preset", "veryfast",
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      "-c:a", "aac", "-ar", "48000",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_list_size", "0",
      "-hls_flags", "independent_segments+append_list",
      "-master_pl_name", "master.m3u8",
    ];

    const varStreamMap = [];
    RENDITIONS.forEach((r, i) => {
      args.push(
        "-map", "0:v",
        "-map", "0:a?",
        `-b:v:${i}`, r.videoBitrate,
        `-maxrate:v:${i}`, r.videoBitrate,
        `-bufsize:v:${i}`, parseInt(r.videoBitrate) * 2 + "k",
        `-vf:${i}`, `scale=-2:${r.height}`,
        `-b:a:${i}`, r.audioBitrate,
      );
      fs.mkdirSync(path.join(outDir, r.name), { recursive: true });
      args.push("-hls_segment_filename", path.join(outDir, r.name, "seg_%03d.ts"));
      args.push(path.join(outDir, r.name, "index.m3u8"));
      varStreamMap.push(`v:${i},a:${i},name:${r.name}`);
    });

    args.push("-var_stream_map", varStreamMap.join(" "));

    const ff = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
    if (ff.status !== 0) {
      throw new Error("ffmpeg failed: " + (ff.stderr || ff.stdout || "").slice(-2000));
    }

    // 4. Upload every generated file (master.m3u8, per-rendition playlists + .ts).
    const walk = (dir, base) => {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, path.join(base, entry.name)));
        else out.push(full);
      }
      return out;
    };

    const files = walk(outDir, "");
    for (const file of files) {
      const rel = file.replace(outDir + path.sep, "").split(path.sep).join("/");
      const key = `${jobFolder}/${rel}`;
      const isPlaylist = rel.endsWith(".m3u8");
      await uploadFile(key, file, isPlaylist ? "application/vnd.apple.mpegurl" : "video/mp2t");
    }

    // 5. Write the public master playlist URL back to the owner row.
    const masterUrl = publicR2Url(`${jobFolder}/master.m3u8`);
    await supabaseFetch(
      `${job.owner_table}?id=eq.${job.owner_id}`,
      "PATCH",
      { [job.hls_url_column]: masterUrl, updated_at: new Date().toISOString() },
    );
    await supabaseFetch(`video_transcode_jobs?id=eq.${job.id}`, "PATCH", {
      status: "completed",
      updated_at: new Date().toISOString(),
    });

    console.log(`[ok] job ${job.id} -> ${masterUrl}`);
    return true;
  } catch (err) {
    console.error(`[fail] job ${job.id}:`, err.message || err);
    await supabaseFetch(`video_transcode_jobs?id=eq.${job.id}`, "PATCH", {
      status: "failed",
      error_message: String(err.message || err).slice(0, 1000),
      updated_at: new Date().toISOString(),
    });
    return true; // job handled (failed) — continue to next
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function loop() {
  try {
    let processed = true;
    while (processed) {
      processed = await processNextJob();
    }
  } catch (err) {
    console.error("Worker loop error:", err);
  }
}

if (RUN_ONCE) {
  loop().then(() => process.exit(0));
} else {
  console.log(`[worker] polling every ${POLL_INTERVAL_MS}ms`);
  (async () => {
    while (true) {
      await loop();
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  })();
}