-- MedNeo password-only doctor registration migration.
-- Safe to run after public.users and public.analytics_events exist.
-- Additive only: does not delete users, content, quizzes, events, or published articles.

alter table public.users add column if not exists password_set_at timestamptz;
alter table public.users add column if not exists welcome_email_opt_in boolean not null default false;
alter table public.users add column if not exists welcome_email_status text;
alter table public.users add column if not exists phone_verified boolean not null default false;

create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.registration_attempts enable row level security;
create index if not exists registration_attempts_email_created_idx on public.registration_attempts (email_hash, created_at desc);
create index if not exists registration_attempts_ip_created_idx on public.registration_attempts (ip_hash, created_at desc);

-- Existing registration_challenges / OTP audit tables, if present from an older release,
-- are intentionally left in place and unused. This migration does not drop legacy data.


-- Single-use links for administrator-created doctors to set their own password.
create table if not exists public.password_setup_tokens (
  id bigint generated always as identity primary key,
  doctor_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.password_setup_tokens enable row level security;
create index if not exists password_setup_tokens_doctor_created_idx on public.password_setup_tokens (doctor_id, created_at desc);
create index if not exists password_setup_tokens_expiry_idx on public.password_setup_tokens (expires_at);
