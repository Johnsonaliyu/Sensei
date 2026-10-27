create extension if not exists pgcrypto;

create table if not exists public.sensei_bot_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default 'My business',
  use_case text not null default 'customer_support'
    check (use_case in ('customer_support', 'lead_generation', 'appointment_booking', 'order_updates', 'faq_assistant', 'custom')),
  description text not null default '',
  system_prompt text not null default 'Answer customer questions using only the business information provided.',
  welcome_message text not null default 'Hi! How can I help you today?',
  tone text not null default 'friendly'
    check (tone in ('friendly', 'professional', 'concise', 'warm')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sensei_whatsapp_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_auth_state text,
  connection_state text not null default 'disconnected'
    check (connection_state in ('disconnected', 'connecting', 'qr_ready', 'connected', 'reconnecting', 'error')),
  phone_number text,
  connected_at timestamptz,
  error_message text,
  updated_at timestamptz not null default now()
);

create table if not exists public.sensei_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_phone text not null,
  customer_name text not null default '',
  preview text not null default '',
  last_message_at timestamptz not null default now(),
  unread_count integer not null default 0 check (unread_count >= 0),
  state text not null default 'open' check (state in ('open', 'resolved', 'needs_human')),
  created_at timestamptz not null default now(),
  unique (user_id, customer_phone)
);

create index if not exists sensei_conversations_user_recent_idx
  on public.sensei_conversations (user_id, last_message_at desc);

create table if not exists public.sensei_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.sensei_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  provider text check (provider in ('groq', 'nvidia')),
  sent_at timestamptz not null default now()
);

create index if not exists sensei_messages_user_recent_idx
  on public.sensei_messages (user_id, sent_at desc);

alter table public.sensei_bot_configs enable row level security;
alter table public.sensei_whatsapp_sessions enable row level security;
alter table public.sensei_conversations enable row level security;
alter table public.sensei_messages enable row level security;

drop policy if exists "Users manage their bot config" on public.sensei_bot_configs;
create policy "Users manage their bot config"
  on public.sensei_bot_configs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- WhatsApp credentials are encrypted and remain server-only; no end-user policy is granted.

drop policy if exists "Users manage their conversations" on public.sensei_conversations;
create policy "Users manage their conversations"
  on public.sensei_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their messages" on public.sensei_messages;
create policy "Users manage their messages"
  on public.sensei_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.sensei_bot_configs to authenticated;
grant select, insert, update, delete on public.sensei_conversations to authenticated;
grant select, insert, update, delete on public.sensei_messages to authenticated;
grant all on public.sensei_bot_configs to service_role;
grant all on public.sensei_whatsapp_sessions to service_role;
grant all on public.sensei_conversations to service_role;
grant all on public.sensei_messages to service_role;
