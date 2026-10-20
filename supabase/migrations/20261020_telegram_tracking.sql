-- Existing registrations remain intact. Run once in Supabase SQL Editor.
alter table public.leads
  add column if not exists telegram_user_id bigint,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_started_at timestamptz;
-- RLS remains enabled. No public read/write policies are added.
