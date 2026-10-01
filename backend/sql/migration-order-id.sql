-- Run this once for an existing Supabase database.
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS order_id VARCHAR(12);
CREATE INDEX IF NOT EXISTS idx_submissions_order_id ON public.submissions(order_id);
