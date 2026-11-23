-- Row-level security for express chat conversations and messages.
--
-- Without these policies Supabase's default-deny RLS blocks every read/write
-- on the chat tables, so opening a chat can never mark messages as read and
-- the unread badge never clears.
--
-- A participant is either the buyer (user_id) or the seller (seller_id) of
-- the conversation. Both sides can read their own conversations and the
-- messages inside them, insert messages they send, and mark messages read.

-- ── express_chat_conversations ─────────────────────────────────────────────
ALTER TABLE public.express_chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their own conversations"
  ON public.express_chat_conversations;
CREATE POLICY "Participants can view their own conversations"
  ON public.express_chat_conversations FOR SELECT
  USING (user_id = auth.uid() OR seller_id = auth.uid());

DROP POLICY IF EXISTS "Users can start conversations"
  ON public.express_chat_conversations;
CREATE POLICY "Users can start conversations"
  ON public.express_chat_conversations FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Participants can update their own conversations"
  ON public.express_chat_conversations;
CREATE POLICY "Participants can update their own conversations"
  ON public.express_chat_conversations FOR UPDATE
  USING (user_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR seller_id = auth.uid());

-- ── express_chat_messages ──────────────────────────────────────────────────
ALTER TABLE public.express_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view conversation messages"
  ON public.express_chat_messages;
CREATE POLICY "Participants can view conversation messages"
  ON public.express_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.express_chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can send messages"
  ON public.express_chat_messages;
CREATE POLICY "Participants can send messages"
  ON public.express_chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.express_chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants can mark messages read"
  ON public.express_chat_messages;
CREATE POLICY "Participants can mark messages read"
  ON public.express_chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.express_chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.express_chat_conversations c
      WHERE c.id = conversation_id
        AND (c.user_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );
