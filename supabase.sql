create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text unique,
  state text,
  city text,
  specialization text,
  experience text,
  role text not null default 'doctor' check (role in ('admin','doctor')),
  status text not null default 'active' check (status in ('active','inactive')),
  password_hash text not null,
  last_login timestamptz,
  session_duration text default '—',
  modules jsonb not null default '[]'::jsonb,
  completed_modules jsonb not null default '[]'::jsonb,
  onboarded boolean not null default true,
  score integer not null default 0,
  streak integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.app_content (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.logs (
  id bigint generated always as identity primary key,
  user_id text references public.users(id) on delete set null,
  event text not null,
  module text,
  device text,
  created_at timestamptz not null default now()
);

create table if not exists public.module_files (
  id bigint generated always as identity primary key,
  public_id text unique not null,
  storage_path text not null,
  owner_user_id text references public.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.app_content enable row level security;
alter table public.logs enable row level security;
alter table public.module_files enable row level security;

-- Intentionally no anon/authenticated policies: only the server-side service-role API reads these tables.
-- Create a PRIVATE Storage bucket named "modules" in the Supabase Dashboard.

-- Additive migration for live doctor profiles, learning analytics and backups.
-- This section only adds nullable columns/tables/indexes; it does not delete or replace existing content.
alter table public.users add column if not exists degree text;
alter table public.users add column if not exists hospital text;
alter table public.users add column if not exists registration_number text;
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.users add column if not exists password_set_at timestamptz;
alter table public.users add column if not exists welcome_email_opt_in boolean not null default false;
alter table public.users add column if not exists welcome_email_status text;
alter table public.users add column if not exists phone_verified boolean not null default false;

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id text references public.users(id) on delete set null,
  session_id text,
  event_name text not null,
  route text,
  content_type text,
  content_id text,
  module_id text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0 and duration_seconds <= 3600),
  device_type text,
  browser text,
  os text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not repair a table created by an older release.
-- Add missing columns explicitly; these operations preserve all existing rows.
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
  quiz_id text not null,
  quiz_title text not null,
  total_questions integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  score integer not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean not null default false,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

-- Repair older quiz tables additively too; legacy attempts remain intact.
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


create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events (event_name, created_at desc);
create index if not exists quiz_attempts_user_created_idx on public.quiz_attempts (user_id, created_at desc);
create index if not exists quiz_attempts_quiz_created_idx on public.quiz_attempts (quiz_id, created_at desc);

-- No client-side policies. The private service-role API is the only application access path.
-- Create a PRIVATE Supabase Storage bucket named "backups" for scheduled encrypted-access snapshots.


-- Admin password login throttling. Identifiers and IPs are HMAC digests, not raw values.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.auth_attempts enable row level security;
create index if not exists auth_attempts_identifier_created_idx on public.auth_attempts (identifier_hash, created_at desc);
create index if not exists auth_attempts_ip_created_idx on public.auth_attempts (ip_hash, created_at desc);

-- Password-only registration rate limits. Only HMAC identifier digests are stored.
create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.registration_attempts enable row level security;
create index if not exists registration_attempts_email_created_idx on public.registration_attempts (email_hash, created_at desc);
create index if not exists registration_attempts_ip_created_idx on public.registration_attempts (ip_hash, created_at desc);

-- Single-use links for admin-created doctors to choose their own password.
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

-- Server-only live analytics aggregate. The API returns aggregate summaries plus a small recent-event window,
-- avoiding downloading every historical event every 30 seconds. Exports read full detail when requested.
create or replace function public.admin_analytics_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select (now() at time zone 'Asia/Kolkata')::date as local_today
),
doctor_ids as (
  select id from public.users where role = 'doctor'
),
doctor_events as (
  select e.* from public.analytics_events e join doctor_ids d on d.id = e.user_id
),
doctor_attempts as (
  select a.* from public.quiz_attempts a join doctor_ids d on d.id = a.user_id
),
days as (
  select generate_series((p.local_today - 13)::timestamp, p.local_today::timestamp, interval '1 day')::date as day
  from params p
),
registrations as (
  select (u.created_at at time zone 'Asia/Kolkata')::date as day, count(*)::integer as value
  from public.users u cross join params p
  where u.role = 'doctor'
    and u.created_at >= ((p.local_today - 13)::timestamp at time zone 'Asia/Kolkata')
    and u.created_at < ((p.local_today + 1)::timestamp at time zone 'Asia/Kolkata')
  group by (u.created_at at time zone 'Asia/Kolkata')::date
),
active_days as (
  select (e.created_at at time zone 'Asia/Kolkata')::date as day, count(distinct e.user_id)::integer as value
  from doctor_events e cross join params p
  where e.user_id is not null
    and e.created_at >= ((p.local_today - 13)::timestamp at time zone 'Asia/Kolkata')
    and e.created_at < ((p.local_today + 1)::timestamp at time zone 'Asia/Kolkata')
  group by (e.created_at at time zone 'Asia/Kolkata')::date
),
daily as (
  select d.day, coalesce(r.value, 0) as registrations, coalesce(a.value, 0) as dau
  from days d left join registrations r using (day) left join active_days a using (day)
),
device_counts as (
  select coalesce(device_type, 'Unknown') as name, count(*)::integer as event_count
  from doctor_events group by coalesce(device_type, 'Unknown')
),
browser_counts as (
  select coalesce(browser, 'Unknown') as name, count(*)::integer as event_count
  from doctor_events group by coalesce(browser, 'Unknown')
),
os_counts as (
  select coalesce(os, 'Unknown') as name, count(*)::integer as event_count
  from doctor_events group by coalesce(os, 'Unknown')
),
route_counts as (
  select route, count(*)::integer as event_count from doctor_events where coalesce(route, '') <> '' group by route
),
content_counts as (
  select coalesce(content_type, 'content') as content_type,
         coalesce(content_id, module_id, 'unknown') as content_id,
         count(*)::integer as event_count,
         max(created_at) as last_seen
  from doctor_events
  where event_name in ('content_click', 'article_open', 'module_open', 'ad_click', 'external_link_click', 'download_click', 'ui_click')
  group by coalesce(content_type, 'content'), coalesce(content_id, module_id, 'unknown')
),
funnel_counts as (
  select
    count(*) filter (where event_name = 'module_open')::integer as module_opened,
    count(*) filter (where event_name = 'article_open')::integer as article_opened,
    count(*) filter (where event_name = 'quiz_start')::integer as quiz_started,
    (select count(*)::integer from doctor_attempts) as quiz_completed,
    count(*) filter (where event_name = 'article_complete')::integer as article_completed
  from doctor_events
),
totals as (
  select
    (select count(*)::integer from doctor_ids) as registered_doctors,
    (select count(*)::integer from public.users where role = 'doctor' and status = 'active') as active_doctors,
    (select count(distinct e.user_id)::integer from doctor_events e cross join params p where e.user_id is not null and e.created_at >= (p.local_today::timestamp at time zone 'Asia/Kolkata')) as active_doctors_today,
    (select count(*)::integer from doctor_events) as events,
    (select coalesce(round(sum(duration_seconds) / 60.0), 0)::integer from doctor_events) as total_minutes,
    (select coalesce(round(avg(duration_seconds)::numeric / 60.0, 1), 0) from doctor_attempts) as average_minutes_per_attempt,
    (select count(*)::integer from doctor_events where event_name = 'article_open') as article_opens,
    (select count(*)::integer from doctor_events where event_name = 'article_complete') as article_completions,
    (select count(*)::integer from doctor_events where event_name = 'content_click') as content_clicks,
    (select count(*)::integer from doctor_events where event_name = 'ad_click') as ad_clicks,
    (select count(*)::integer from doctor_events where event_name = 'ad_impression') as ad_impressions,
    (select count(*)::integer from doctor_events where event_name = 'external_link_click') as external_link_clicks,
    (select count(*)::integer from doctor_attempts) as quiz_attempts,
    (select coalesce(round(avg(percentage)), 0)::integer from doctor_attempts) as average_quiz_score,
    (select count(*)::integer from doctor_events e cross join params p where e.event_name in ('login', 'session_start') and e.created_at >= (p.local_today::timestamp at time zone 'Asia/Kolkata')) as logins_today
)
select jsonb_build_object(
  'dailyLabels', coalesce((select jsonb_agg(to_char(day, 'DD Mon') order by day) from daily), '[]'::jsonb),
  'registrations', coalesce((select jsonb_agg(registrations order by day) from daily), '[]'::jsonb),
  'dau', coalesce((select jsonb_agg(dau order by day) from daily), '[]'::jsonb),
  'deviceDist', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', event_count, 'pct', round(event_count * 100.0 / nullif((select sum(event_count) from device_counts), 0))::integer) order by event_count desc) from device_counts), '[]'::jsonb),
  'browserDist', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', event_count, 'pct', round(event_count * 100.0 / nullif((select sum(event_count) from browser_counts), 0))::integer) order by event_count desc) from browser_counts), '[]'::jsonb),
  'osDist', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', event_count, 'pct', round(event_count * 100.0 / nullif((select sum(event_count) from os_counts), 0))::integer) order by event_count desc) from os_counts), '[]'::jsonb),
  'completionFunnel', (select jsonb_build_array(
    jsonb_build_object('label', 'Module opened', 'count', module_opened, 'pct', case when module_opened > 0 then 100 else 0 end),
    jsonb_build_object('label', 'Article opened', 'count', article_opened, 'pct', case when module_opened > 0 then least(100, round(article_opened * 100.0 / module_opened)::integer) else 0 end),
    jsonb_build_object('label', 'Quiz started', 'count', quiz_started, 'pct', case when module_opened > 0 then least(100, round(quiz_started * 100.0 / module_opened)::integer) else 0 end),
    jsonb_build_object('label', 'Quiz completed', 'count', quiz_completed, 'pct', case when module_opened > 0 then least(100, round(quiz_completed * 100.0 / module_opened)::integer) else 0 end),
    jsonb_build_object('label', 'Article completed', 'count', article_completed, 'pct', case when module_opened > 0 then least(100, round(article_completed * 100.0 / module_opened)::integer) else 0 end)
  ) from funnel_counts),
  'navPaths', coalesce((select jsonb_agg(jsonb_build_object('route', route, 'count', event_count) order by event_count desc) from (select route, event_count from route_counts order by event_count desc limit 10) r), '[]'::jsonb),
  'topContent', coalesce((select jsonb_agg(jsonb_build_object('contentType', content_type, 'contentId', content_id, 'clicks', event_count, 'lastSeen', last_seen) order by event_count desc) from (select * from content_counts order by event_count desc limit 10) c), '[]'::jsonb),
  'totals', (select jsonb_build_object(
    'registeredDoctors', registered_doctors, 'activeDoctors', active_doctors, 'activeDoctorsToday', active_doctors_today,
    'events', events, 'totalMinutes', total_minutes, 'averageMinutesPerAttempt', average_minutes_per_attempt,
    'articleOpens', article_opens, 'articleCompletions', article_completions, 'contentClicks', content_clicks,
    'adClicks', ad_clicks, 'adImpressions', ad_impressions, 'externalLinkClicks', external_link_clicks,
    'quizAttempts', quiz_attempts, 'averageQuizScore', average_quiz_score, 'loginsToday', logins_today
  ) from totals)
);
$$;
revoke all on function public.admin_analytics_snapshot() from public, anon, authenticated;
grant execute on function public.admin_analytics_snapshot() to service_role;

-- Password-only self-registration and metadata are covered by the additive columns above.
-- Legacy registration challenge tables from previous releases are intentionally not dropped.


-- October update: three modules are available; content files are published privately by an administrator.
-- This updates only module status fields in the existing JSON. Articles, questions, and all other content remain unchanged.
update public.app_content as ac
set payload = jsonb_set(
  ac.payload,
  '{modules}',
  coalesce((
    select jsonb_agg(
      case when item.module->>'id' in ('m1','m2','m3')
        then jsonb_set(item.module, '{status}', '"active"'::jsonb, true)
        else item.module
      end order by item.ordinality
    )
    from jsonb_array_elements(ac.payload->'modules') with ordinality as item(module, ordinality)
  ), '[]'::jsonb),
  true
),
updated_at = now()
where ac.key = 'main'
  and jsonb_typeof(ac.payload->'modules') = 'array';

-- Additive metadata for module presentation uploads. Existing module_files rows are retained.
alter table public.module_files add column if not exists module_id text;
alter table public.module_files add column if not exists original_filename text;
alter table public.module_files add column if not exists mime_type text;
alter table public.module_files add column if not exists file_size bigint;
alter table public.module_files add column if not exists uploaded_by text references public.users(id) on delete set null;
alter table public.module_files add column if not exists updated_at timestamptz not null default now();
create index if not exists module_files_active_module_idx on public.module_files(module_id, active, created_at desc);

-- Self-service forgot-password flow; only a SHA-256 token digest is persisted.
create table if not exists public.password_reset_tokens (
  id bigint generated always as identity primary key,
  user_id text not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.password_reset_tokens enable row level security;
create index if not exists password_reset_tokens_user_created_idx on public.password_reset_tokens(user_id, created_at desc);
create index if not exists password_reset_tokens_expiry_idx on public.password_reset_tokens(expires_at);

-- Immutable non-secret snapshot for every new doctor registration, including admin-created accounts.
-- The original users table remains the source of truth; snapshots never include password_hash.
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
alter table public.registration_audit enable row level security;
create index if not exists registration_audit_registered_idx on public.registration_audit(registered_at desc);

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
      new.id, new.name, new.email, new.phone, new.degree, new.specialization,
      new.hospital, new.registration_number, new.city, new.state,
      coalesce(new.created_at, now()), now()
    ) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_doctor_registration() from public, anon, authenticated;
drop trigger if exists capture_doctor_registration_after_insert on public.users;
create trigger capture_doctor_registration_after_insert
after insert on public.users
for each row execute function public.capture_doctor_registration();

-- Backfill existing doctors into the archive without changing accounts or content.
insert into public.registration_audit (
  user_id, name, email, phone, degree, specialization, hospital,
  registration_number, city, state, registered_at, captured_at
)
select id, name, email, phone, degree, specialization, hospital,
       registration_number, city, state, coalesce(created_at, now()), now()
from public.users
where role = 'doctor'
on conflict (user_id) do nothing;


-- Ensure private Storage buckets exist for uploaded module presentations and snapshots.
-- Create or enforce private buckets for source presentations and database backup objects.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('modules', 'modules', false, 104857600, array['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 104857600;
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
