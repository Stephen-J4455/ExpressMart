-- Add review comments/replies functionality
-- Migration: 20250129_add_review_comments

-- Create review comments table
CREATE TABLE IF NOT EXISTS express_review_comments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id uuid NOT NULL REFERENCES express_reviews(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    comment text NOT NULL,
    is_approved boolean DEFAULT true, -- Comments can be auto-approved or moderated
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_comments_review ON express_review_comments(review_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_user ON express_review_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_approved ON express_review_comments(is_approved) WHERE is_approved = true;

-- Enable RLS
ALTER TABLE express_review_comments ENABLE ROW LEVEL SECURITY;

-- Policies for review comments
CREATE POLICY "Anyone can view approved review comments" ON express_review_comments
    FOR SELECT USING (is_approved = true);

CREATE POLICY "Users can create review comments" ON express_review_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own review comments" ON express_review_comments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own review comments" ON express_review_comments
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all review comments" ON express_review_comments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM express_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Add comment for documentation
COMMENT ON TABLE express_review_comments IS 'Comments/replies on product reviews';