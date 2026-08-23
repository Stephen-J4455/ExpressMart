# Cloudflare R2 for new uploads (no data migration)

All **new** image/media uploads (avatars, product images, seller statuses, ad
images) go to **Cloudflare R2** (`expressmart-media` bucket) via presigned PUT.
Videos/reels were already on R2.

**Existing files stay in Supabase Storage.** No migration was performed —
legacy database URLs keep pointing at Supabase and continue to work as-is.

## Architecture

```
App (RN/web) ──invoke──▶ Supabase Edge Function "get-r2-upload-url"
                              │ presigned PUT URL (15 min)
                              ▼
                        Cloudflare R2  ◀── public reads ── https://cdn.expressmart.com/<key>
App ──invoke──▶ Edge Function "delete-r2-object" (SigV4 DELETE)

Legacy reads/deletes ──▶ Supabase Storage (unchanged)
```

R2 credentials live only in Supabase edge-function secrets and server-side
`.env` files — never in the app bundles.

## Key layout (new uploads only)

| Content         | R2 key prefix                                        |
|-----------------|------------------------------------------------------|
| Avatars/logos   | `profile/{userId}/avatar-<ts>.jpg`                   |
| Product images  | `express-products/products/{sellerId}/product-*.jpg` |
| Seller statuses | `seller-statuses/{sellerId}/<ts>.jpg`                |
| Ad images       | `ad-images/ad-<ts>-<rand>.jpg`                       |
| Reels/videos    | `reels/...` (existing)                               |

## Dual-backend behaviour

`src/services/r2Storage.js` handles both backends transparently:

- `resolveMediaUrl()` — absolute URLs pass through untouched (legacy Supabase
  URLs keep resolving to Supabase); bare object paths resolve to the R2 CDN
  domain (only new uploads store bare paths).
- `getStorageBackend(url)` — returns `"supabase"` or `"r2"`.
- `deleteMediaByUrl(url)` — routes deletes to Supabase Storage or R2 based on
  the URL shape.

## Setup steps

1. Create the R2 bucket in the Cloudflare dashboard and connect a custom
   domain (e.g. `cdn.expressmart.com`) or a Worker.
2. Set edge-function secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`.
3. Update `R2_PUBLIC_DOMAIN` in both `src/services/r2Storage.js` files if your
   domain differs from `https://cdn.expressmart.com`.

## Code map

| File | Role |
|---|---|
| `ExpressMart/src/services/r2Storage.js` | Shared client: presigned upload, dual-backend delete, URL resolution |
| `ExpressMartAdmin/src/services/r2Storage.js` | Same for the admin app |
| `ExpressMart/supabase/functions/get-r2-upload-url/` | Presigned PUT generator (existing) |
| `ExpressMart/supabase/functions/delete-r2-object/` | SigV4 DELETE (existing) |

## Optional future cleanup

If you later want to consolidate legacy files into R2, write a copy script that
mirrors each Supabase bucket into its `<bucket>/` prefix in R2, then run a SQL
backfill rewriting `/storage/v1/object/(public|sign)/<bucket>/<path>` URLs to
the CDN domain. Not required today.
