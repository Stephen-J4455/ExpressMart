-- WhatsApp order notifications for stores
-- Logs outbound WhatsApp messages sent to sellers when orders are placed.

CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES public.express_orders(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.express_sellers(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_order_id
  ON public.whatsapp_message_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_seller_id
  ON public.whatsapp_message_logs (seller_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_status
  ON public.whatsapp_message_logs (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_created_at
  ON public.whatsapp_message_logs (created_at DESC);

-- RLS: sellers can read their own message logs; service role writes.
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Seller read own whatsapp logs" ON public.whatsapp_message_logs;
CREATE POLICY "Seller read own whatsapp logs"
  ON public.whatsapp_message_logs FOR SELECT
  TO authenticated
  USING (seller_id IN (
    SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service write whatsapp logs" ON public.whatsapp_message_logs;
CREATE POLICY "Service write whatsapp logs"
  ON public.whatsapp_message_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Keep updated_at fresh.
DROP TRIGGER IF EXISTS trg_touch_whatsapp_message_logs ON public.whatsapp_message_logs;
CREATE TRIGGER trg_touch_whatsapp_message_logs
  BEFORE UPDATE ON public.whatsapp_message_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
