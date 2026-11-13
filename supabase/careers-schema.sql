-- Kenwer careers: run in the NEW Supabase project's SQL Editor.
-- Creates the applicant schema and a PRIVATE storage bucket.
-- Anonymous users are NOT granted direct write/read privileges.
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null,
  college text,
  grad_date date,
  position text,
  linkedin text,
  experience text,
  resume_path text not null,
  cover_letter_path text
);
alter table public.applicants enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 5242880,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- IMPORTANT: No anon insert policies are created here. For production,
-- submit files and application data via a rate-limited server endpoint
-- with server-side validation. Never expose a Supabase secret/service-role
-- key in js/script.js or any public page.
