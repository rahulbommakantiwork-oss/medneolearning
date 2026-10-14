-- Repair for ERROR 42703: column "user_id" does not exist.
-- Run this script first if the original migration stopped on a pre-existing older table.
-- It creates missing tracking tables when needed and only adds columns; it does not delete rows.
-- Requires public.users(id) to exist, as it does in the portal's base schema.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id text references public.users(id) on delete set null,
  session_id text,
  event_name text,
  route text,
  content_type text,
  content_id text,
  module_id text,
  duration_seconds integer not null default 0,
  device_type text,
  browser text,
  os text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events add column if not exists user_id text references public.users(id) on delete set null;
alter table public.analytics_events add column if not exists session_id text;
alter table public.analytics_events add column if not exists event_name text;
alter table public.analytics_events add column if not exists route text;
alter table public.analytics_events add column if not exists content_type text;
alter table public.analytics_events add column if not exists content_id text;
alter table public.analytics_events add column if not exists module_id text;
alter table public.analytics_events add column if not exists duration_seconds integer not null default 0;
alter table public.analytics_events add column if not exists device_type text;
alter table public.analytics_events add column if not exists browser text;
alter table public.analytics_events add column if not exists os text;
alter table public.analytics_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.analytics_events add column if not exists created_at timestamptz not null default now();

create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id text references public.users(id) on delete set null,
  quiz_id text,
  quiz_title text,
  total_questions integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean not null default false,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.quiz_attempts add column if not exists user_id text references public.users(id) on delete set null;
alter table public.quiz_attempts add column if not exists quiz_id text;
alter table public.quiz_attempts add column if not exists quiz_title text;
alter table public.quiz_attempts add column if not exists total_questions integer not null default 0;
alter table public.quiz_attempts add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.quiz_attempts add column if not exists score integer not null default 0;
alter table public.quiz_attempts add column if not exists percentage numeric(5,2) not null default 0;
alter table public.quiz_attempts add column if not exists passed boolean not null default false;
alter table public.quiz_attempts add column if not exists duration_seconds integer not null default 0;
alter table public.quiz_attempts add column if not exists created_at timestamptz not null default now();

create index if not exists analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);
create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);
