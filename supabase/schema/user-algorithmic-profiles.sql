-- ============================================================================
-- User algorithmic profiles — a computed "digital twin" of each shopper.
-- ----------------------------------------------------------------------------
-- One row per user. Built incrementally from express_user_events by the
-- build-user-profile edge function (triggered from track-user-event).
-- The ai-assistant edge function reads this to personalize its replies,
-- product recommendations, and navigation suggestions per user.
--
-- Columns:
--   id              — PK, references auth.users
--   category_scores — JSONB map of category_id → decayed weight
--   tag_scores      — JSONB map of tag → decayed weight
--   seller_scores   — JSONB map of seller_id → decayed weight
--   price_band      — 'budget' | 'mid' | 'premium' derived from cart/purchase history
--   avg_order_value — numeric, mean of purchase event metadata amounts
--   preferred_tags  — text[] top tags by score
--   preferred_categories — text[] top categories by score
--   preferred_sellers — uuid[] top sellers by score
--   last_event_at   — timestamptz of the most recent event used
--   event_count     — total events used to build the profile
--   version         — profile schema version (bump when computation changes)
--   updated_at      — last recompute timestamp
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.express_user_algorithmic_profiles (
  id                uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_scores   jsonb     NOT NULL DEFAULT '{}'::jsonb,
  tag_scores        jsonb     NOT NULL DEFAULT '{}'::jsonb,
  seller_scores     jsonb     NOT NULL DEFAULT '{}'::jsonb,
  price_band        text      CHECK (price_band IN ('budget', 'mid', 'premium')),
  avg_order_value   numeric   CHECK (avg_order_value >= 0),
  preferred_tags    text[]    NOT NULL DEFAULT '{}'::text[],
  preferred_categories text[] NOT NULL DEFAULT '{}'::text[],
  preferred_sellers uuid[]    NOT NULL DEFAULT '{}'::uuid[],
  last_event_at     timestamptz,
  event_count       int       NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  version           int       NOT NULL DEFAULT 1,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT express_user_algorithmic_profiles_pkey PRIMARY KEY (id)
);

-- Index for the ai-assistant lookup by user id (PK covers this, but keep
-- it explicit for clarity).
CREATE INDEX IF NOT EXISTS express_user_algorithmic_profiles_id_idx
  ON public.express_user_algorithmic_profiles (id);

-- RLS: users can read their own profile; service role writes.
ALTER TABLE public.express_user_algorithmic_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own algorithmic profile"
  ON public.express_user_algorithmic_profiles;
CREATE POLICY "Users can view their own algorithmic profile"
  ON public.express_user_algorithmic_profiles
  FOR SELECT
  USING (id = auth.uid());

-- No user-facing INSERT/UPDATE/DELETE — the build-user-profile edge function
-- (service role) owns all writes.

COMMENT ON TABLE public.express_user_algorithmic_profiles IS
  'Per-user algorithmic profile computed from express_user_events. Drives AI assistant personalization.';

COMMENT ON COLUMN public.express_user_algorithmic_profiles.price_band IS
  'Derived price sensitivity band: budget / mid / premium based on purchase and cart_add event amounts.';

COMMENT ON COLUMN public.express_user_algorithmic_profiles.version IS
  'Profile computation schema version. Bump when the scoring algorithm changes so stale profiles can be rebuilt.';
