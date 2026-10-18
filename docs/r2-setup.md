# Cloudflare R2 Setup

This document explains how Cloudflare R2 is used in ExpressMart for storing large
media (videos) such as **product showcase videos**. Images still use Supabase
Storage; videos are streamed to R2 to keep Supabase bandwidth/quota low.

---

## 1. What is uploaded to R2

| Asset            | Storage            | How it gets there                              |
| ---------------- | ------------------ | ---------------------------------------------- |
| Product images   | Supabase Storage   | Direct upload from the app                     |
| Product video    | **Cloudflare R2**  | Presigned PUT via `get-r2-upload-url` edge fn |
| Reels / statuses | **Cloudflare R2**  | Same edge function (`folder: "reels"`)         |

The product video flow is implemented in `src/screens/SellerAdminScreen.js`
(`pickVideo` → `uploadVideoToR2` → `submitProduct`). Only the resulting public
URL (`video_url`) and the R2 object key (`r2_video_key`) are stored on the
product row in Supabase.

---

## 2. Create a Cloudflare R2 bucket

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Go to **R2 Object Storage** → **Create bucket**.
3. Name the bucket (e.g. `expressmart-media`). Note the **Account ID** shown in
   the R2 overview / bucket settings.
4. (Recommended) Enable **R2.dev subdomain** or, for production, add a **custom
   domain** (e.g. `cdn.expressmart.com`). This becomes the public domain used
   for video URLs.

---

## 3. Create an R2 API token

1. In R2, open **Manage R2 API Tokens** → **Create API token**.
2. Scope the token to the bucket you created with **Edit / Write** permissions
   (the app only needs to `PUT` objects; it never reads via the API key).
3. Copy the **Access Key ID** and **Secret Access Key**. You will not be able to
   see the secret again.

> Keep these credentials secret. They are only ever used server-side inside the
> Supabase Edge Function, never shipped to the client.

---

## 4. Make uploaded objects public

The app stores **public URLs**, so objects must be accessible without a
signature.

- Either enable **Public access** / "Allow access from the internet" on the
  bucket (Cloudflare lets you serve public objects from the R2.dev subdomain), or
- Put the bucket behind a **custom domain / CDN** that allows anonymous `GET`.

The signed upload URL expires in **15 minutes** (`URL_EXPIRY_SECONDS` in the
edge function) and is used only for the one-time `PUT`.

---

## 5. Configure Supabase environment secrets

In the **Supabase Dashboard → Project Settings → Edge Functions → Secrets**
(or via the Supabase CLI), add the following secrets used by
`supabase/functions/get-r2-upload-url/index.ts`:

| Secret                | Value                                              |
| --------------------- | ------------------------------------------------- |
| `R2_ACCOUNT_ID`       | Your Cloudflare account ID                         |
| `R2_ACCESS_KEY_ID`    | R2 API token Access Key ID                        |
| `R2_SECRET_ACCESS_KEY`| R2 API token Secret Access Key                    |
| `R2_BUCKET_NAME`      | The bucket name (e.g. `expressmart-media`)        |
| `R2_PUBLIC_DOMAIN`    | Public base URL, e.g. `https://cdn.expressmart.com` or `https://<id>.r2.dev` |

Example (CLI):

```bash
supabase secrets set \
  R2_ACCOUNT_ID=abc123 \
  R2_ACCESS_KEY_ID=AKIA... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET_NAME=expressmart-media \
  R2_PUBLIC_DOMAIN=https://cdn.expressmart.com
```

---

## 6. Deploy / redeploy the edge function

The bucket is used by the `get-r2-upload-url` function. Deploy it with:

```bash
supabase functions deploy get-r2-upload-url
```

The function expects a JSON body:

```json
{ "fileName": "product-video.mp4", "fileType": "video/mp4", "folder": "products" }
```

and returns:

```json
{
  "uploadUrl": "https://<accountId>.r2.cloudflarestorage.com/<bucket>/products/<uuid>-product-video.mp4?X-Amz-...",
  "publicUrl": "https://<publicDomain>/products/<uuid>-product-video.mp4",
  "key": "products/<uuid>-product-video.mp4"
}
```

The app uploads the raw video bytes to `uploadUrl` with a `PUT` and
`Content-Type: video/mp4`, then stores `publicUrl` in `express_products.video_url`
and `key` in `express_products.r2_video_key`.

---

## 7. Database schema

Run the included migration once (it is idempotent):

```bash
supabase db execute --file supabase/schema/product_video.sql
```

Or paste `supabase/schema/product_video.sql` into the Supabase SQL editor:

```sql
ALTER TABLE public.express_products
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS r2_video_key text;
```

---

## 8. Client permissions

- **React Native**: the video is uploaded with
  `expo-file-system` `createUploadTask` (binary PUT). Make sure `expo-file-system`
  and `react-native-video` are installed (both already in `package.json`).
- **Web**: the video `Blob` is fetched/PUT directly via `fetch`.

No extra native configuration is required beyond the existing Expo setup.

---

## 9. Troubleshooting

| Symptom                                  | Cause / fix                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Edge function returns "R2 storage is not configured" | One of the 5 secrets is missing in Supabase.            |
| Upload fails with 403                    | Wrong access key / secret, or token lacks write on the bucket.   |
| `video_url` is null after save           | Network/upload error — check logs; the product still saves.      |
| Video does not play                       | `R2_PUBLIC_DOMAIN` not serving public objects / wrong CORS.      |
| CORS error from the device               | The function already returns `Access-Control-Allow-Origin: *`.   |

---

## 10. Notes

- Video is optional on products. Existing videos can be removed from the edit
  form (clears `video_url` / `r2_video_key`).
- `r2_video_key` is retained so a future cleanup job can `DELETE` the orphaned
  object from R2 when a product video is replaced or removed.
- The same bucket and function are reused for reels/statuses by passing
  `folder: "reels"` instead of `"products"`.