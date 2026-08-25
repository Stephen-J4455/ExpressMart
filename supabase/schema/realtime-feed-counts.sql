-- Realtime feed counters
-- ---------------------------------------------------------------------------
-- The home feed cards subscribe to postgres_changes on these two tables to
-- keep like/comment counts live (see FeedProductCard.js). Supabase Realtime
-- only broadcasts for tables that are members of the `supabase_realtime`
-- publication, which is EMPTY by default — without this, the subscriptions
-- silently never fire.
--
-- Idempotent: safe to re-run.
-- NOTE (RLS): realtime events are also filtered by each table's SELECT
-- policies. Both tables need at least a public-read SELECT policy so other
-- users' likes/comments broadcast:
--   alter table express_wishlists enable row level security;
--   create policy "public read wishlists" on express_wishlists for select using (true);
--   create policy "public read reviews" on express_reviews for select using (true);
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'express_reviews'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE express_reviews;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'express_wishlists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE express_wishlists;
  END IF;
END $$;