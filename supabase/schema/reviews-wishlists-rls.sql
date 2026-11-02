-- Allow public/anonymous read of product reviews, review comments and
-- wishlists so the feed, product detail and cart discovery screens can show
-- likes/comments/reviews from ALL accounts — not just the signed-in user.
--
-- Without these SELECT policies, Supabase's default-deny RLS (enabled on the
-- tables) blocks every anon read, and the only rows that ever come back are
-- the current user's own (because the dashboard policy typically restricts
-- SELECT to `user_id = auth.uid()`). That is why only the current account's
-- likes/comments were appearing.
--
-- Writes (insert/update/delete) remain owner-scoped via separate policies so
-- users can only modify their own rows.

-- ── express_reviews ────────────────────────────────────────────────────────
ALTER TABLE public.express_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view approved reviews" ON public.express_reviews;
CREATE POLICY "Public can view approved reviews"
  ON public.express_reviews FOR SELECT
  USING (is_approved = true);

DROP POLICY IF EXISTS "Users manage their own reviews" ON public.express_reviews;
CREATE POLICY "Users manage their own reviews"
  ON public.express_reviews FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── express_review_comments ──────────────────────────────────────────────────
ALTER TABLE public.express_review_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view approved review comments" ON public.express_review_comments;
CREATE POLICY "Public can view approved review comments"
  ON public.express_review_comments FOR SELECT
  USING (is_approved = true);

DROP POLICY IF EXISTS "Users manage their own review comments" ON public.express_review_comments;
CREATE POLICY "Users manage their own review comments"
  ON public.express_review_comments FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── express_wishlists ────────────────────────────────────────────────────────
-- Wishlists power the "like" count on products. Public read lets every device
-- see the total like count; writes stay owner-scoped.
ALTER TABLE public.express_wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view wishlists" ON public.express_wishlists;
CREATE POLICY "Public can view wishlists"
  ON public.express_wishlists FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users manage their own wishlists" ON public.express_wishlists;
CREATE POLICY "Users manage their own wishlists"
  ON public.express_wishlists FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
