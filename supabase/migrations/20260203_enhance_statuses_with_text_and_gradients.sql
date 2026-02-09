-- Migration: Enhance seller statuses to support text-only statuses with color and gradient backgrounds

-- Add new columns to express_seller_statuses
ALTER TABLE IF EXISTS public.express_seller_statuses 
ADD COLUMN IF NOT EXISTS status_type TEXT DEFAULT 'image' CHECK (status_type IN ('image', 'text')),
ADD COLUMN IF NOT EXISTS background_color TEXT DEFAULT '#FFFFFF',
ADD COLUMN IF NOT EXISTS gradient_start TEXT,
ADD COLUMN IF NOT EXISTS gradient_end TEXT,
ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT '#000000',
ADD COLUMN IF NOT EXISTS font_size INTEGER DEFAULT 24;

-- Create index on status_type for efficient querying
CREATE INDEX IF NOT EXISTS idx_seller_statuses_type ON public.express_seller_statuses(status_type);
