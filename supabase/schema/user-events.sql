-- ============================================================================
-- User events log — drives the personalized "For You" home feed.
-- ----------------------------------------------------------------------------
-- One row per user interaction (view, like, search, tag click, etc.). The
-- cached-products edge function reads the last 500 events for a user, builds
-- a decayed interest vector, and re-orders the same Upstash-cached product
-- set per user.
--
-- The table is append-only. Old rows are pruned by `prune_user_events(...)`
-- (a helper defined at the bottom) which the ExpressMart admin can call
-- from a scheduled Supabase function.
-- ============================================================================

-- ── 1. The events table.
-- event_type is a CHECK constraint (not a real enum) so adding a new event
-- type later is a single-line schema change, not a migration that rewrites
-- the table.
CREATE TABLE IF NOT EXISTS public.express_user_events (
  id            uuid          NOT NULL DEFAULT uuid_generate_v4(),
  user_id       uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text          NOT NULL CHECK (event_type IN (
                                'view',
                                'like',
                                'unlike',
                                'cart_add',
                                'search',
                                'tag_click',
                                'category_view',
                                'follow',
                                'unfollow',
                                'purchase'
                              )),
  product_id    uuid          REFERENCES public.express_products(id) ON DELETE SET NULL,
  category_id   uuid          REFERENCES public.express_categories(id) ON DELETE SET NULL,
  category      text,
  seller_id     uuid          REFERENCES public.express_sellers(id) ON DELETE SET NULL,
  tag           text,
  query         text,
  weight        numeric       NOT NULL DEFAULT 1 CHECK (weight >= 0),
  metadata      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT express_user_events_pkey PRIMARY KEY (id)
);

-- ── 2. Indexes.
-- The edge function reads the last 500 events for a user sorted by
-- created_at DESC, so a (user_id, created_at DESC) btree is the primary
-- access path.
CREATE INDEX IF NOT EXISTS express_user_events_user_created_idx
  ON public.express_user_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS express_user_events_type_created_idx
  ON public.express_user_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS express_user_events_product_idx
  ON public.express_user_events (product_id)
  WHERE product_id IS NOT NULL;

-- ── 3. RLS.
-- Users can read their own events; only the service role (edge functions)
-- writes. The service role bypasses RLS, so the policies below only need
-- to cover the anon/authenticated read path.
ALTER TABLE public.express_user_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own events"
  ON public.express_user_events;
CREATE POLICY "Users can view their own events"
  ON public.express_user_events
  FOR SELECT
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for regular users — writes go through
-- the track-user-event edge function which uses the service role key. This
-- guarantees the event log is server-validated (the function clamps the
-- event_type, weight, and trims the query string before insert).

-- ── 4. Retention helper.
-- Run from the SQL editor, or wire into a Supabase scheduled function:
--   SELECT prune_user_events(90);   -- keep last 90 days
CREATE OR REPLACE FUNCTION public.prune_user_events(older_than_days int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => older_than_days);
  deleted bigint;
BEGIN
  IF older_than_days IS NULL OR older_than_days < 1 THEN
    RAISE EXCEPTION 'older_than_days must be >= 1';
  END IF;

  DELETE FROM public.express_user_events
  WHERE created_at < cutoff;

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_user_events(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_user_events(int) TO service_role;

-- ── 5. Default weights used by the personalization scorer.
-- Reference only; the edge function owns the authoritative mapping.
COMMENT ON COLUMN public.express_user_events.weight IS
  'Default weights used by the personalization scorer: view=1, search=2, '
  'tag_click=3, follow=4, like=5, cart_add=8, purchase=10.';
