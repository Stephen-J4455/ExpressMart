# HLS Transcode Worker

A self-hosted FFmpeg worker that produces adaptive-bitrate (ABR) HLS renditions
for the ExpressMart reels / product videos uploaded to Cloudflare R2.

## What it does

1. Polls the `video_transcode_jobs` table for rows with `status = 'pending'`.
2. Downloads the compressed source MP4 from R2.
3. Encodes it with `ffmpeg` into multiple HLS quality tiers (360p / 480p / 720p / 1080p)
   plus a master playlist (`.m3u8`) and `.ts` segment chunks.
4. Uploads the playlist + segments back to R2 under the `hls/` folder.
5. Writes the public master-playlist URL into the owning row
   (`reels.hls_url` or `express_products.video_hls_url`) and marks the job `completed`.

The mobile client (`FeedScreen`) prefers `hls_url` for playback and falls back to the
raw compressed `video_url` MP4 until the job finishes.

## Requirements

- Node.js 18+
- `ffmpeg` on `PATH` (with `libx264`)
- Environment variables (same R2 + Supabase creds as the edge functions):

  | Variable                  | Description                              |
  |---------------------------|------------------------------------------|
  | `R2_ACCOUNT_ID`           | Cloudflare account id                    |
  | `R2_ACCESS_KEY_ID`        | R2 access key id                         |
  | `R2_SECRET_ACCESS_KEY`    | R2 secret access key                     |
  | `R2_BUCKET_NAME`          | Bucket name                              |
  | `R2_PUBLIC_DOMAIN`        | Public/CDN domain (e.g. `cdn.example.com`) |
  | `SUPABASE_URL`            | Project URL                              |
  | `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS)       |

## Run

```bash
cd ExpressMart/scripts/transcode-worker
npm install
# run once
node worker.js --once
# or run continuously (polls every POLL_INTERVAL_MS, default 15000)
POLL_INTERVAL_MS=15000 node worker.js
```

Deploy as a cron-managed process, a queue worker, or a serverless function that
invokes `processNextJob()` directly.