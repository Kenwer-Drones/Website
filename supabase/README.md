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


## Email notifications to hello@kenwerdrones.com
The deployed `careers-submit` Edge Function can send applicant details and attach the resume and optional cover letter through Resend. The application is still saved when email is unconfigured or fails; consult `public.applicants.notification_status` (`pending`, `sent`, `failed`) and `notification_sent_at`.

**One-time setup (the mail sending is not enabled until this is completed):**
1. Create a Resend account at https://resend.com. Verify the sending domain `kenwerdrones.com` using its recommended DNS records. Do **not** replace inbound MX records for the existing hello@ mailbox.
2. Generate an API key with **sending-only** permissions for the verified domain.
3. In Supabase Dashboard > project `imoulrezdhgbqtzfvsxx` > Edge Functions > Secrets, configure `RESEND_API_KEY` directly. Never put the key in GitHub, chat, or public JavaScript.
4. Make a synthetic form submission and verify the message reaches `hello@kenwerdrones.com` with the attached PDF; verify the corresponding row shows `notification_status='sent'`. Test provider failures separately.

The email's sender is `Kenwer Careers <careers@kenwerdrones.com>`, recipient `hello@kenwerdrones.com`, and reply-to is the applicant's supplied email. Incoming mail remains with Kenwer's current email provider.
Email attachments are copies of the applicant's private documents; only grant mailbox access to authorized recruiting staff. Review retention and email-provider policies.
**Note:** Notifications remain pending if `RESEND_API_KEY` is absent. The current implementation does not automatically backfill or retry prior pending/failed notifications.
