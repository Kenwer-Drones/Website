# Kenwer careers: new Supabase production cutover

**Project:** `imoulrezdhgbqtzfvsxx` (`https://imoulrezdhgbqtzfvsxx.supabase.co`).

## Status
Staged in draft PR #4. **Do not merge before completing setup and a successful test.** The private database/storage are not provisioned automatically by these GitHub commits.

## Setup
1. Run `supabase/careers-schema.sql` in the **new project's** Supabase SQL Editor. The bucket remains private and RLS is enabled without anonymous write or read policies.
2. In Vercel project settings → Environment Variables, configure:
   - `SUPABASE_SECRET_KEY`: a **newly rotated** Supabase secret key for this project, accessible **server-side only**. Do not put it in the repository, browser, screenshots or chat.
   - `CAREERS_SIGNING_SECRET`: a random secret of at least 32 bytes, accessible server-side only, e.g. generated on your own machine with `openssl rand -hex 32`.
   - `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile secret, server-side only.
3. Create a Cloudflare Turnstile widget for `kenwerdrones.com` and `www.kenwerdrones.com`. Put its **public site key** in `TURNSTILE_SITE_KEY` in `js/script.js` (replacing the `REPLACE_WITH_TURNSTILE_SITE_KEY` placeholder).
4. Vercel's root `api/careers.js` must be deployed as a Node.js serverless function with `/api/careers` available. Test from the actual hostnames before merging.
5. Test with synthetic data and a small dummy PDF, confirm the file is private and that an `applicants` row exists. Verify replays do not create a duplicate. Also test file validation, a wrong CAPTCHA, and failure to reach Supabase.
6. Merge PR #4 only after all checks succeed and Vercel environment variables are set in Production. Retire old project only after any old applications have been safely exported.

## Flow
The browser sends metadata and a Turnstile challenge to `POST /api/careers` with `action=start`. The server verifies the challenge and issues Supabase signed upload tokens for random unique paths in the private `resumes` bucket. The browser uploads the files using those tokens and then calls the server with a signed time-limited receipt (`action=complete`). The server checks the objects exist and writes the applicant record using a server-only credential.

## Security
- No public storage bucket or anonymous INSERT policy. Never expose secret keys.
- Turnstile reduces but does not eliminate abuse. Add server-side IP throttling and monitoring before high-volume public recruitment.
- The serverless function assumes a Node.js environment and Supabase's current signed-upload API.
- No direct Supabase project access was available from this session, so SQL and production credentials have not been applied or validated.
