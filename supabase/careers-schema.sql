-- Kenwer careers schema, reflecting changes applied to the new Supabase project.
-- Already applied to project imoulrezdhgbqtzfvsxx; retain as reference.
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submission_id uuid not null default gen_random_uuid() unique,
  full_name text not null,
  email text not null,
  phone text not null,
  college text,
  grad_date date,
  position text,
  linkedin text,
  experience text,
  resume_path text not null unique,
  cover_letter_path text
);
alter table public.applicants enable row level security;
revoke all on public.applicants from anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('resumes','resumes',false,5242880,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.careers_limits (
  fingerprint text not null,
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key(fingerprint,window_start)
);
alter table public.careers_limits enable row level security;
revoke all on public.careers_limits from anon, authenticated;

create or replace function public.consume_careers_limit(p_fingerprint text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare allowed boolean;
begin
 if length(p_fingerprint) != 64 then return false; end if;
 insert into public.careers_limits(fingerprint,window_start,attempts)
 values (p_fingerprint,date_trunc('hour',now()),1)
 on conflict (fingerprint,window_start)
 do update set attempts = public.careers_limits.attempts + 1
 where public.careers_limits.attempts < 5
 returning true into allowed;
 return coalesce(allowed,false);
end;
$$;
revoke all on function public.consume_careers_limit(text) from public,anon,authenticated;
grant execute on function public.consume_careers_limit(text) to service_role;

-- The Edge Function handles validation, rate limiting, private uploads and inserts.
-- Do not add anonymous storage upload/read or applicant INSERT permissions.
