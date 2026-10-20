create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 name text not null check (char_length(name) between 2 and 100),
 phone text not null check (char_length(phone) between 10 and 20),
 telegram text not null check (char_length(telegram) between 5 and 33),
 consent boolean not null check (consent = true),
 consent_version text not null default '2026-10-20',
 page text check (char_length(page) <= 2048),
 utm jsonb not null default '{}'::jsonb
);
alter table public.leads enable row level security;
-- No public policies: server secret key only. Quiz health answers are NOT stored.
