-- Reels engagement: likes and comments for the Feed (Reels) screen.
-- These tables are separate from express_wishlists/express_reviews so the
-- feed can support lightweight, video-native interactions (a "like" on a
-- reel is not the same as wishlisting the underlying product, and reel
-- comments are quick reactions rather than verified-purchase reviews).

CREATE TABLE IF NOT EXISTS public.express_reel_likes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  reel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_reel_likes_pkey PRIMARY KEY (id),
  CONSTRAINT express_reel_likes_reel_id_user_id_key UNIQUE (reel_id, user_id),
  CONSTRAINT express_reel_likes_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE,
  CONSTRAINT express_reel_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS express_reel_likes_reel_id_idx ON public.express_reel_likes (reel_id);
CREATE INDEX IF NOT EXISTS express_reel_likes_user_id_idx ON public.express_reel_likes (user_id);

CREATE TABLE IF NOT EXISTS public.express_reel_comments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  reel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  comment text NOT NULL CHECK (char_length(trim(comment)) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_reel_comments_pkey PRIMARY KEY (id),
  CONSTRAINT express_reel_comments_reel_id_fkey FOREIGN KEY (reel_id) REFERENCES public.reels(id) ON DELETE CASCADE,
  CONSTRAINT express_reel_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS express_reel_comments_reel_id_idx ON public.express_reel_comments (reel_id, created_at DESC);

-- RLS: anyone (even anon) can read likes/comments to render the feed.
-- Authenticated users can like/comment on reels; they can only modify/delete
-- their own rows.
ALTER TABLE public.express_reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.express_reel_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view reel likes" ON public.express_reel_likes;
CREATE POLICY "Public can view reel likes"
  ON public.express_reel_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Auth users can like reels" ON public.express_reel_likes;
CREATE POLICY "Auth users can like reels"
  ON public.express_reel_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.express_reel_likes;
CREATE POLICY "Users can unlike their own likes"
  ON public.express_reel_likes FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view reel comments" ON public.express_reel_comments;
CREATE POLICY "Public can view reel comments"
  ON public.express_reel_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Auth users can comment on reels" ON public.express_reel_comments;
CREATE POLICY "Auth users can comment on reels"
  ON public.express_reel_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.express_reel_comments;
CREATE POLICY "Users can update their own comments"
  ON public.express_reel_comments FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.express_reel_comments;
CREATE POLICY "Users can delete their own comments"
  ON public.express_reel_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger for comments
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS express_reel_comments_updated_at ON public.express_reel_comments;
CREATE TRIGGER express_reel_comments_updated_at
  BEFORE UPDATE ON public.express_reel_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
