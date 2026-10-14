-- MedNeo: additive module publishing, per-question records, password reset, registration archive.
-- BACK UP THE DATABASE FIRST. This script is designed to retain existing users, quiz attempts,
-- published articles and app_content. It does not drop tables, truncate data or delete rows.

begin;

-- Profile fields used by registration and the doctor dashboard.
alter table public.users add column if not exists degree text;
alter table public.users add column if not exists specialization text;
alter table public.users add column if not exists experience text;
alter table public.users add column if not exists hospital text;
alter table public.users add column if not exists registration_number text;
alter table public.users add column if not exists city text;
alter table public.users add column if not exists state text;
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.users add column if not exists password_set_at timestamptz;
alter table public.users add column if not exists welcome_email_opt_in boolean not null default false;
alter table public.users add column if not exists welcome_email_status text;
alter table public.users add column if not exists phone_verified boolean not null default false;

-- Durable analytics events: individual quiz-answer clicks are inserted by the server.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id text references public.users(id) on delete set null,
  session_id text,
  event_name text not null,
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
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_user_created_idx on public.analytics_events(user_id, created_at desc);
create index if not exists analytics_events_quiz_answer_idx on public.analytics_events(created_at desc) where event_name = 'quiz_answer';
alter table public.analytics_events enable row level security;

-- Completed quiz submissions keep the entire server-checked answer sheet.
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
create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts(user_id, created_at desc);
create index if not exists quiz_attempts_quiz_created_idx on public.quiz_attempts(quiz_id, created_at desc);
alter table public.quiz_attempts enable row level security;

-- Server-side authentication rate limits.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.auth_attempts add column if not exists identifier_hash text;
alter table public.auth_attempts add column if not exists ip_hash text;
alter table public.auth_attempts add column if not exists created_at timestamptz not null default now();
create index if not exists auth_attempts_identifier_created_idx on public.auth_attempts(identifier_hash, created_at desc);
create index if not exists auth_attempts_ip_created_idx on public.auth_attempts(ip_hash, created_at desc);
alter table public.auth_attempts enable row level security;

create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.registration_attempts add column if not exists email_hash text;
alter table public.registration_attempts add column if not exists ip_hash text;
alter table public.registration_attempts add column if not exists created_at timestamptz not null default now();
create index if not exists registration_attempts_email_created_idx on public.registration_attempts(email_hash, created_at desc);
create index if not exists registration_attempts_ip_created_idx on public.registration_attempts(ip_hash, created_at desc);
alter table public.registration_attempts enable row level security;

-- One-time password reset links: only the token digest is retained.
create table if not exists public.password_reset_tokens (
  id bigint generated always as identity primary key,
  user_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists password_reset_tokens_user_created_idx on public.password_reset_tokens(user_id, created_at desc);
create index if not exists password_reset_tokens_expiry_idx on public.password_reset_tokens(expires_at);
alter table public.password_reset_tokens enable row level security;

-- Admin-created profiles set their password through a hashed, single-use invitation.
create table if not exists public.password_setup_tokens (
  id bigint generated always as identity primary key,
  doctor_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists password_setup_tokens_doctor_created_idx on public.password_setup_tokens(doctor_id, created_at desc);
create index if not exists password_setup_tokens_expiry_idx on public.password_setup_tokens(expires_at);
alter table public.password_setup_tokens enable row level security;

-- Append-only registration snapshot archive. Password hashes are deliberately excluded.
create table if not exists public.registration_audit (
  id bigint generated always as identity primary key,
  user_id text unique references public.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  degree text,
  specialization text,
  hospital text,
  registration_number text,
  city text,
  state text,
  registered_at timestamptz not null default now(),
  captured_at timestamptz not null default now()
);
alter table public.registration_audit add column if not exists user_id text references public.users(id) on delete set null;
alter table public.registration_audit add column if not exists name text;
alter table public.registration_audit add column if not exists email text;
alter table public.registration_audit add column if not exists phone text;
alter table public.registration_audit add column if not exists degree text;
alter table public.registration_audit add column if not exists specialization text;
alter table public.registration_audit add column if not exists hospital text;
alter table public.registration_audit add column if not exists registration_number text;
alter table public.registration_audit add column if not exists city text;
alter table public.registration_audit add column if not exists state text;
alter table public.registration_audit add column if not exists registered_at timestamptz not null default now();
alter table public.registration_audit add column if not exists captured_at timestamptz not null default now();
create unique index if not exists registration_audit_user_uidx on public.registration_audit(user_id);
create index if not exists registration_audit_registered_idx on public.registration_audit(registered_at desc);
alter table public.registration_audit enable row level security;

create or replace function public.capture_doctor_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'doctor' then
    insert into public.registration_audit (
      user_id, name, email, phone, degree, specialization, hospital,
      registration_number, city, state, registered_at, captured_at
    ) values (
      new.id, new.name, new.email, new.phone, new.degree, new.specialization, new.hospital,
      new.registration_number, new.city, new.state, coalesce(new.created_at, now()), now()
    ) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_doctor_registration() from public, anon, authenticated;
drop trigger if exists capture_doctor_registration_after_insert on public.users;
create trigger capture_doctor_registration_after_insert after insert on public.users
for each row execute function public.capture_doctor_registration();

-- One-time backfill for already registered doctors; existing archive rows are never overwritten.
insert into public.registration_audit (
  user_id, name, email, phone, degree, specialization, hospital, registration_number,
  city, state, registered_at, captured_at
)
select id, name, email, phone, degree, specialization, hospital, registration_number,
       city, state, coalesce(created_at, now()), now()
from public.users where role = 'doctor'
on conflict (user_id) do nothing;

-- Module file metadata is additive; existing uploads are retained.
alter table public.module_files add column if not exists module_id text;
alter table public.module_files add column if not exists original_filename text;
alter table public.module_files add column if not exists mime_type text;
alter table public.module_files add column if not exists file_size bigint;
alter table public.module_files add column if not exists uploaded_by text references public.users(id) on delete set null;
alter table public.module_files add column if not exists updated_at timestamptz not null default now();
create index if not exists module_files_active_module_idx on public.module_files(module_id, active, created_at desc);
alter table public.module_files enable row level security;

-- Private file storage for module PPT/PPTX/PDF files and backup snapshots.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('modules', 'modules', false, 104857600, array['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets(id, name, public)
values ('backups', 'backups', false)
on conflict (id) do update set public = false;

-- Ensure all three module slots exist and are active without overwriting existing module content.
-- Missing slots receive metadata only; approved slide decks and question banks are uploaded by the administrator.
do $$
declare
  v_payload jsonb;
  v_modules jsonb;
  v_module jsonb;
  v_definitions jsonb[] := array[
    jsonb_build_object(
      'id','m1','title','Dermatology Fundamentals','subtitle','Skin Conditions, Diagnosis & Management',
      'status','active','description','A comprehensive module covering common dermatological conditions, diagnostic approaches, and evidence-based treatment protocols.',
      'duration',45,'color','#E31837','accentColor','#FF4D6A','icon','🩺','tag','BAD Certified',
      'contents',jsonb_build_array(
        jsonb_build_object('type','slide_deck','id','sd1','title','Introduction to Dermatology','duration',15,'slides',8),
        jsonb_build_object('type','article','id','ar2','title','Eczema Management in Adults','duration',10,'readTime','10 min read'),
        jsonb_build_object('type','mcq','id','mq1','title','Module 1 Assessment','duration',15,'questions',10)
      )
    ),
    jsonb_build_object(
      'id','m2','title','Advanced Skin Therapeutics','subtitle','Biologics, Novel Therapies & Clinical Outcomes',
      'status','active','description','Explore approved learning content for biologic therapies, targeted treatments and clinical outcomes.',
      'duration',50,'color','#C41230','accentColor','#E31837','icon','💊','tag','BAD Certified','contents','[]'::jsonb
    ),
    jsonb_build_object(
      'id','m3','title','Procedural Dermatology','subtitle','Techniques, Safety & Patient Communication',
      'status','active','description','Explore approved learning content about procedural dermatology, safety and patient communication.',
      'duration',60,'color','#A00E28','accentColor','#C41230','icon','🔬','tag','BAD Certified','contents','[]'::jsonb
    )
  ];
begin
  select payload into v_payload from public.app_content where key = 'main' for update;
  if v_payload is not null then
    if coalesce(jsonb_typeof(v_payload->'modules'), '') <> 'array' then
      v_payload := jsonb_set(v_payload, '{modules}', '[]'::jsonb, true);
    end if;

    foreach v_module in array v_definitions loop
      if not exists (
        select 1 from jsonb_array_elements(v_payload->'modules') as existing(value)
        where existing.value->>'id' = v_module->>'id'
      ) then
        v_payload := jsonb_set(v_payload, '{modules}', (v_payload->'modules') || jsonb_build_array(v_module), true);
      end if;
    end loop;

    select coalesce(jsonb_agg(
      case when item.value->>'id' in ('m1','m2','m3')
        then jsonb_set(item.value, '{status}', '"active"'::jsonb, true)
        else item.value
      end order by item.ordinality
    ), '[]'::jsonb)
    into v_modules
    from jsonb_array_elements(v_payload->'modules') with ordinality as item(value, ordinality);

    v_payload := jsonb_set(v_payload, '{modules}', v_modules, true);
    update public.app_content set payload = v_payload, updated_at = now() where key = 'main';
  end if;
end;
$$;

commit;
