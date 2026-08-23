# WhatsApp Catalog ↔ Tagit Deep-Linking

Bridges the WhatsApp Business catalog with the Tagit app: shared product links
open the PDP directly (native or mobile-web fallback), support pre-adding to
cart, and keep inventory in sync with Meta's catalog.

## Link formats

| Format | Example | Resolves to |
| --- | --- | --- |
| Custom scheme | `tagit://product/[sku]` | PDP by SKU |
| Legacy scheme | `expressmart://product/[id]` | PDP by product id |
| Universal link | `https://expressmart.me/product/[id]` | PDP by product id |
| SKU universal link | `https://expressmart.me/p/[sku]` | PDP by SKU |
| Cart hand-off | any of the above + `?action=add_to_cart` | auto-add to cart → Cart screen |

## App configuration (`app.json`)

- `scheme`: `["tagit", "expressmart"]`
- iOS `associatedDomains`: `applinks:www.expressmart.me`, `applinks:expressmart.me`
- Android `intentFilters`: `autoVerify: true`, hosts `expressmart.me` /
  `www.expressmart.me`, path prefixes `/product` and `/p`

### Verification files (served from `public/.well-known/`)

- `apple-app-site-association` — Team-ID appID + `/product/*`, `/p/*` paths.
  Must be served as `application/json` with **no redirects**. On Vercel this is
  handled automatically for files under `.well-known/`.
- `assetlinks.json` — package `com.stephenj.expressmart` + SHA-256 cert
  fingerprints. Add release-key fingerprints alongside the debug one when
  available.

> After changing these, re-deploy the web app and re-build the native apps
> (associated domains are baked into the binary).

## Routing & cart hand-off

- `App.js` linking config maps `p/:sku` → `ProductDetailBySku` (same
  `ProductDetailScreen` component) and `product/:productId` → `ProductDetail`.
- `src/hooks/useDeepLinkProductHandler.js`:
  - Parses both link families (`parseProductLink`).
  - Resolves SKUs via `fetchProductBySku` (excludes draft/rejected/archived).
  - Stock-checks before mutating the cart; out-of-stock shows a warning and
    stays on the PDP instead of silently failing.
  - On success: toast + navigate to Cart.
  - Dedup guard (`handledRef`) prevents double-adds on effect re-runs and
    background→foreground replays; a warm-start `Linking.addEventListener`
    listener re-arms only for genuinely new URLs.

## Meta catalog sync

- Migration: `supabase/schema/whatsapp-catalog-sync.sql`
  - `product_catalog_mappings` (`meta_retailer_id` unique, `meta_catalog_id`,
    `synced_at`) — 1:1 with products, indexed for webhook lookups.
  - `catalog_interactions` (`user_phone`, `product_id`, `event_type`,
    `payload`, `created_at`) — RLS: service-role insert only.
- Edge function: `supabase/functions/whatsapp-webhook/index.ts`
  - `GET` verification handshake against `WHATSAPP_VERIFY_TOKEN`.
  - `POST` verifies `X-Hub-Signature-256` HMAC-SHA256 against
    `WHATSAPP_APP_SECRET`; rejects invalid signatures with 401.
  - Extracts `product_retailer_id` anywhere in the payload, logs interactions,
    acks 200 immediately (no slow work inline).

### Deploy checklist (outside the codebase)

1. Apply the migration: run `whatsapp-catalog-sync.sql` against Supabase.
2. Deploy the function:
   `supabase functions deploy whatsapp-webhook`
3. Set secrets:
   `supabase secrets set WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=...`
4. In Meta App Dashboard → WhatsApp → Webhooks:
   - Callback URL: `https://meiljgoztnhnyvtfkzuh.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: same value as the secret above.
   - Subscribe to the `messages` field (includes catalog product context).
5. In Commerce Manager, ensure each catalog item's `product_retailer_id`
   matches the Tagit SKU, then backfill rows into
   `product_catalog_mappings` (retailer_id = SKU).

## Web fallback (app not installed)

Universal links fall through to `https://expressmart.me/product/[id]` or
`/p/[sku]`. Vercel rewrites serve the Expo-web SPA which renders the normal
PDP; `InstallAppBanner` shows an App Store / Play Store prompt on mobile web.

## Testing matrix

- [ ] Cold start: app closed → tap universal link (iOS + Android)
- [ ] Warm start: app backgrounded → tap link (dedup guard must prevent double-add)
- [ ] Custom scheme `tagit://product/[sku]` from a browser / WhatsApp in-app webview
- [ ] `?action=add_to_cart` happy path → toast + Cart screen
- [ ] Out-of-stock SKU with `?action=add_to_cart` → warning, no cart mutation
- [ ] Unknown SKU → "not found" state on PDP (no silent redirect home)
- [ ] Not-installed fallback: link opens mobile-web PDP with install banner
- [ ] Webhook: GET handshake with correct/wrong token; POST without signature → 401;
      POST with valid signature + known retailer_id → row in `catalog_interactions`
