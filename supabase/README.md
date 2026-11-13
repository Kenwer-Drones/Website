# Kenwer careers submission system

**Production Supabase project:** `imoulrezdhgbqtzfvsxx`

## Architecture
- Existing `Join Kenwer` form builds `FormData` in `js/script.js`.
- Browser sends the form directly to `https://imoulrezdhgbqtzfvsxx.supabase.co/functions/v1/careers-submit`.
- Supabase Edge Function source is version controlled in `supabase/functions/careers-submit/index.ts` and deployed with JWT verification disabled **because this is a public job application endpoint**. It enforces origin validation, a honeypot, file size/type/signature checks and an atomic per-IP rate limit.
- The Edge Function uses Supabase-managed server-only credentials (never sent to the browser) to upload to the private `resumes` bucket, then insert the `applicants` record. It deletes uploaded objects if the database write fails.
- Form submissions have a stable client-generated UUID (`submissionId`) and a database uniqueness constraint to prevent duplicate applications on network retries.

## Database
- `supabase/careers-schema.sql` describes deployed schema, private bucket and rate-limiting RPC. Changes were applied and verified on November 13, 2026.
- The applicant table is protected with RLS and no anonymous policies. RLS security advisor reports informational `rls_enabled_no_policy`, which is intentional in this server-only access design.

## Tests performed
- Real public Edge Function request rejected wrong content type with HTTP 415.
- Synthetic multipart PDF application returned HTTP 201 and produced private storage object + applicant row.
- Idempotency test produced exactly one row and one object for a repeated test request.
- All QA applicant rows and test objects were removed (verified counts 0).

## Operations
- Review rate-limit activity and Edge Function error logs in Supabase.
- To review applicants, use the Supabase Table Editor with appropriate admin privileges. Download resumes using authenticated/admin-authorized private storage access; do not change the bucket to public.
- Older applicant records from the previous Supabase project are not automatically migrated.
- No Vercel server-side environment secrets are required by this submission path. An unused `CAREERS_SIGNING_SECRET` from a previous design may be removed from Vercel settings.
- The Edge Function is subject to upload/compute and rate limits. Consider adding a dedicated managed CAPTCHA and email confirmations if recruitment volume grows.
