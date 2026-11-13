# New Kenwer Supabase careers migration

Target project: `imoulrezdhgbqtzfvsxx` (URL `https://imoulrezdhgbqtzfvsxx.supabase.co`).

1. In the **new** project's SQL Editor run `supabase/careers-schema.sql`. This creates an `applicants` table and private `resumes` bucket.
2. Obtain the **new project's publishable key** from the Supabase dashboard. The old project's publishable key does not work against the new project. Replace `REPLACE_WITH_NEW_SUPABASE_PUBLISHABLE_KEY` in `js/script.js` before publishing.
3. **Security prerequisite:** The existing web form uploads directly from the browser and then inserts a row. The schema intentionally does NOT permit anonymous uploads or table inserts. Before merging, add a server-side submission endpoint with validation, rate limits and bot protection, using server-only credentials in Vercel environment variables. Do not solve the issue by making resumes public or by allowing anonymous downloads.
4. Test using synthetic applicant information and a sample document: confirm private file storage, a single database row, failures, and that no public read is possible.
5. Only then merge/deploy and retire the old project. Any older applications must be exported separately if still accessible.

**Status:** This is a staging migration, NOT a working production cutover. Do not merge it until steps 2–4 are complete.
