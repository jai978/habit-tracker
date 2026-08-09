-- Postgres / Supabase schema for the JPS Client Request Processor.
-- Run this once in the Supabase SQL editor when STORE_DRIVER=supabase.
-- The `jps_` prefix matches SUPABASE_TABLE_PREFIX; change both together.
--
-- Row Level Security is enabled with no policies: these tables are only ever
-- reached with the service role key from the server, and the anon key must not
-- be able to read client conversations.

create extension if not exists pgcrypto;

create table if not exists jps_clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  facebook_sender_id text not null unique,
  facebook_page_id text,
  website_url text,
  lovable_project_reference text,
  site_context text,
  special_instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jps_message_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references jps_clients (id) on delete set null,
  facebook_sender_id text not null,
  status text not null default 'OPEN',
  attempts integer not null default 0,
  last_error text,
  process_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jps_batches_due on jps_message_batches (status, process_after);
create index if not exists idx_jps_batches_sender on jps_message_batches (facebook_sender_id, status);

create table if not exists jps_messages (
  id uuid primary key default gen_random_uuid(),
  mid text not null unique,
  batch_id uuid references jps_message_batches (id) on delete set null,
  client_id uuid references jps_clients (id) on delete set null,
  facebook_sender_id text not null,
  facebook_page_id text,
  text text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists idx_jps_messages_batch on jps_messages (batch_id);
create index if not exists idx_jps_messages_sender on jps_messages (facebook_sender_id, sent_at);

create table if not exists jps_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references jps_clients (id) on delete set null,
  -- Not unique: reprocessing a batch (after linking an unknown sender) writes a
  -- new request and leaves the earlier one as history.
  batch_id uuid not null references jps_message_batches (id) on delete cascade,
  classification text not null,
  confidence real not null default 0,
  original_messages jsonb not null default '[]'::jsonb,
  summary text not null default '',
  requested_changes jsonb not null default '[]'::jsonb,
  client_supplied_content jsonb not null default '[]'::jsonb,
  attachments_required jsonb not null default '[]'::jsonb,
  ambiguities jsonb not null default '[]'::jsonb,
  clarification_required text,
  lovable_prompt text,
  status text not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_jps_requests_batch on jps_change_requests (batch_id, created_at desc);
create index if not exists idx_jps_requests_status on jps_change_requests (status, created_at desc);
create index if not exists idx_jps_requests_client on jps_change_requests (client_id, created_at desc);

create table if not exists jps_webhook_events (
  event_key text primary key,
  payload text not null,
  received_at timestamptz not null default now()
);

alter table jps_clients enable row level security;
alter table jps_message_batches enable row level security;
alter table jps_messages enable row level security;
alter table jps_change_requests enable row level security;
alter table jps_webhook_events enable row level security;
