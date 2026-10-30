# Supabase Edge Functions

This directory contains Supabase Edge Functions for handling backend operations.

## Functions

### payment

Combined Edge Function handling all payment-related operations.

**Actions:**

#### create-order

Creates orders in the database with proper validation and business logic.

**Input:**

```json
{
  "action": "create-order",
  "items": [...],
  "shippingAddress": {...},
  "paymentMethod": "paystack",
  "shippingFee": 500
}
```

**Output:**

```json
{
  "success": true,
  "data": {
    "orders": [...],
    "primaryOrder": {...},
    "total": 10000
  }
}
```

#### initialize-payment

Initializes payment with Paystack.

**Input:**

```json
{
  "action": "initialize-payment",
  "email": "user@example.com",
  "amount": 10000,
  "order_id": "order-uuid",
  "user_id": "user-uuid"
}
```

**Output:**

```json
{
  "success": true,
  "data": {
    "authorization_url": "...",
    "reference": "...",
    "access_code": "..."
  }
}
```

#### verify-payment

Verifies payment with Paystack and updates order status.

**Input:**

```json
{
  "action": "verify-payment",
  "reference": "paystack-reference",
  "order_id": "order-uuid"
}
```

**Output:**

```json
{
  "success": true,
  "data": {
    "verified": true,
    "paystack_data": {...}
  }
}
```

## Deployment

To deploy this function:

1. Install Supabase CLI:

```bash
npm install -g supabase
```

2. Login to Supabase:

```bash
supabase login
```

3. Link to your project:

```bash
supabase link --project-ref meiljgoztnhnyvtfkzuh
```

4. Push database migrations:

```bash
supabase db push
```

5. Deploy function:

```bash
supabase functions deploy payment
```

## Environment Variables

Make sure to set the following environment variables in your Supabase project:

- `PAYSTACK_SECRET_KEY`: Your Paystack secret key
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for privileged writes
- `REDIS_REST_URL` (optional): Redis REST endpoint used by payment function cache
- `REDIS_REST_TOKEN` (optional): Redis REST bearer token
- `REDIS_CACHE_TTL_SECONDS` (optional): TTL for cached settings/seller lookups (default `120`)
- `REDIS_DEFAULT_ENABLED` (optional): Fallback cache mode when `express_settings.redis_cache_enabled` is not set (`true`/`false`)

## Testing

You can test the function locally:

```bash
supabase functions serve
```

Then make requests to `http://localhost:54321/functions/v1/payment` with the appropriate action in the request body.
