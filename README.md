# MedNeo Doctor Learning Portal — Password-Only Edition

This project preserves the existing Alembic/MedNeo sign-in design, article content, dashboards, quiz modules, analytics and admin export workflows. Doctor registration and sign-in use **email + a password chosen by the doctor**. The app has no Twilio, SMS OTP or phone-verification dependency.

## What is included

- Self-service doctor registration: name, email, mobile number, degree, city, state/UT, password and password confirmation.
- Degree dropdown with common qualifications and an **Other** option.
- Optional welcome confirmation email through Resend. No password is emailed.
- Doctor and administrator email/password sign-in with role checks and rate limits. Admin-created doctors receive an expiring, one-time invitation link to choose their own password.
- Salted scrypt password hashes stored in Supabase. The app never stores or returns a readable password.
- Admin doctor records and CSV / Excel-readable XLS / JSON exports. Doctor exports exclude password hashes.
- Existing article and module content, live usage analytics, session duration/device/browser/OS data, per-question answers, registration archive and private backups. Dashboard doctor counts are computed from actual Supabase doctor records; no random demo users/counts are seeded.
- Responsive registration, inline validation, show/hide password, password-strength feedback, text-size controls, high-contrast control and optional sound feedback.

## Important security note

The mobile number is collected as profile information but is **not verified**, because SMS OTP has been removed. Email is also not verified by the direct-registration flow. The optional welcome email is a notification, not proof of email ownership. If identity verification is required, add a secure email verification-link flow or administrator approval before launch. Do not tell users that a phone number or email has been verified.

The password is saved only as a salted scrypt hash (`password_hash`) in Supabase; plaintext is not written to any database field or log, and it is never sent by email. The admin dashboard and exports must not expose password hashes.

## Requirements

- Node.js 20+
- Supabase project with the REST API enabled
- Vercel (or another host that supports the included serverless API route structure)
- Optional: Resend API key and verified sender to deliver welcome emails

## Project structure

```text
./
  index.html                         Main login / registration page
  indexbad.html, indexbadapi.html    Preserved legacy landing-page variants
  doctor-dashboard.html              Doctor learning dashboard
  set-password.html                  Branded first-password setup page
  admin-dashboard.html               Admin and live analytics dashboard
  api/auth/login.js                  Role-checked password sign-in
  api/auth/register.js               Password-only self-service registration
  api/auth/password-setup.js         Consumes single-use admin invitation link
  api/auth/me.js, logout.js          Server session endpoints
  api/admin/                         Admin doctors, analytics, exports, backups, module editor and answer history
  api/auth/forgot-password.js         Rate-limited password reset request
  api/auth/reset-password.js          One-time reset token validation and password update
  api/quiz-answer.js                  Server-verifies and records each answer immediately
  api/admin/question-answers.js       Admin view of each recorded answer event
  api/doctor/                        Doctor profile endpoints
  api/track.js                       Usage / interaction tracking (not answer-key validation)
  server/lib/                        Shared server-only utilities (not public API routes)
  js/auth.js                         Main-page sign-in behavior
  js/registration.js                 Registration and accessibility interactions
  js/legacy-auth.js                  Legacy page sign-in behavior
  js/data.legacy.js                  Original content source (preserved)
  supabase.sql                       Main database schema
  supabase-registration-migration.sql Additive registration schema migration
  scripts/seed.mjs                   Insert-only initial seed
  scripts/backup-before-migration.mjs Local pre-migration backup
```

## 1. Configure environment variables

Copy `.env.example` to `.env` for local configuration and configure the same values in Vercel Project Settings → Environment Variables. Never put server secrets in browser JavaScript.

Required server variables:

```dotenv
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET
GML_SESSION_SECRET=GENERATE_AT_LEAST_32_RANDOM_BYTES
APP_ORIGIN=https://YOUR-VERCEL-DOMAIN.vercel.app
SEED_ADMIN_EMAIL=admin@yourdomain.com
SEED_ADMIN_PASSWORD=USE_A_LONG_UNIQUE_ADMIN_PASSWORD
```

Optional welcome-email delivery:

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=MedNeo <onboarding@your-verified-domain.com>
```

Generate a session secret with Node:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep the Supabase secret key and session secret server-side. Do not prefix these secrets with `VITE_` or embed them in HTML/JS. A `.env` file must not be committed or uploaded to public hosting.

## 2. Deployment fix for `Request failed (405)`

That response generally means the browser reached a host/path that is not running the serverless handler. This release is packaged with the actual app files at the ZIP root, so Vercel can discover `/api` functions without a nested `public/` root. Deploy the extracted folder to Vercel as the project root. Do **not** deploy only the HTML/CSS/JS as a static upload or use Firebase Hosting alone for this bundle: those hosts will not execute these Node API handlers.

After deployment, open `https://YOUR-DEPLOYMENT/api/health`. A working API should return JSON similar to `{"ok":true,"service":"medneo-api","time":"..."}`. If `/api/health` itself returns 405/404 or HTML, correct the deployment Root Directory / serverless functions before testing account registration. The registration form now shows this setup-specific explanation instead of an opaque error.

## 3. Install and check the project

```bash
npm install
npm run check
```

`npm run check` validates JavaScript syntax and key architecture safeguards. It does not replace a browser acceptance test or a live Supabase test.

## 4. Back up before schema changes

Before applying SQL to an existing production project:

```bash
npm run backup:before-migration
```

Confirm that the backup file exists, is readable, and is stored privately. Keep an additional independent copy outside the deployment artifact. The backup script needs its server-side Supabase environment variables to be available in the shell. Do not upload private backups into any web-served directory or commit them to source control.

## 5. Set up Supabase

For a brand-new database, run `supabase.sql` in the Supabase SQL Editor. For an existing database that already has the original main schema, first create and verify a backup, then run the latest `supabase-module-live-reset-migration.sql`. That migration is additive and covers the live module slots, individual answer events, password reset, registration archive and backup metadata. If you have never applied the earlier `supabase-registration-migration.sql`, it can remain as a historical migration; the latest migration also creates/repairs the required registration fields and tables. Do not apply only an old migration and assume the new answer-recording feature is ready.

The registration migration is additive. It adds these profile fields if absent:

- `password_set_at`
- `welcome_email_opt_in`
- `welcome_email_status`
- `phone_verified`

It also creates `registration_attempts`, which stores HMAC digests of registration email and IP identifiers for server-side rate limiting, and `password_setup_tokens`, which stores hashed, single-use invitation tokens. It does not store passwords, raw IP addresses or OTPs. The migration does **not** drop or recreate user, article, quiz, analytics or content tables.

If an older deployment has `registration_challenges` or OTP audit tables from a previous version, they are no longer used by this release and are intentionally left in place to avoid deleting historical data. No Twilio credentials or SMS OTP APIs are used by this application version.

Make sure Row Level Security is enabled on the private application tables. Application reads/writes are made through server APIs using the server-only Supabase secret. Do not create broad anonymous read/write policies on `users`, `logs`, `analytics_events`, `quiz_attempts`, `registration_attempts`, `password_setup_tokens`, or backup metadata.

Create a **private** Supabase Storage bucket named `backups` for server-created snapshots. The private `modules` bucket is also created/enforced by the migration for presentations uploaded by administrators.

## 6. Seed the administrator safely

Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the local environment before running:

```bash
cd public
npm run seed
```

The seeder bootstraps the administrator and initial content when appropriate. It does not overwrite the current admin credentials or replace `app_content/main` if that content already exists. Published article content is not deleted by seeding. Verify the admin login in Preview before production deployment.

## 7. How doctor registration works

1. The doctor opens **Create account** and completes all required profile fields. Administrators can also create a doctor profile from the admin dashboard.
2. The browser checks required fields and password confirmation; the server independently repeats validation.
3. The server applies registration rate limits using hashed identifiers and checks for an existing email/mobile number.
4. The server hashes the password with a random salt using scrypt and inserts the doctor record in Supabase. It stores `phone_verified = false` because no SMS/email verification is part of this flow.
5. The server records a registration event and basic device/browser/OS details. The location on the profile comes from the city/state the doctor entered; the app does not silently request GPS.
6. If the doctor checked the optional welcome-email box and Resend is configured, the app sends a confirmation message. Mail delivery status is stored for admin visibility. The password is never included in the email.
7. The server creates an HttpOnly session cookie and redirects the doctor to `doctor-dashboard.html`. For administrator-created doctor profiles, the system sends a single-use password setup link by email through Resend. The link expires after 24 hours; only a hash of the token is stored. No separate messaging-provider integration is required.

## 8. How sign-in works

Doctors and administrators sign in using email and password. The server checks the requested role and active status, compares the password against the stored scrypt hash, applies login attempt limits, records a login event and issues a signed HttpOnly session cookie. The client does not store the session token in localStorage.

Doctor self-registration is open to anyone with the registration page URL, unless your deployment adds an invitation gate or administrator approval. Admin-created profiles remain unable to sign in until the invitee sets a password using the one-time invitation link. For a medical education programme, consider requiring admin approval if access should be limited to a vetted doctor list. A signup form alone does not prove professional credentials.

## 9. Admin data and exports

From the administrator dashboard, doctor records and usage data are read from Supabase. Export formats include:

- CSV (`.csv`)
- Excel-readable HTML workbook (`.xls`, not native `.xlsx`)
- JSON (`.json`)

Exports include profile and activity information as permitted by the selected dataset, while excluding password hashes and authentication secrets. Admin records can show that a password has been set and whether the entered phone number has been verified; this release marks self-registered phones as unverified.

## 10. Publish the three learning modules and edit question banks

The portal identifies three live module slots (`m1`, `m2`, `m3`). The SQL migration appends module metadata only if an `m1`, `m2`, or `m3` slot is missing, then marks those three slots active. Existing module objects, articles, slide decks, quiz banks and all other content are preserved. A module can be marked Published before its PPT is uploaded; it will display a clear “source presentation has not been uploaded yet” message until an administrator uploads the approved source file.

1. Sign in as an administrator and open **Content Modules**.
2. For each of Modules 1, 2 and 3, upload the approved `.ppt`, `.pptx`, or `.pdf` source (maximum 100 MB). The file is stored in the **private** Supabase Storage bucket `modules`; doctors open it through a short-lived signed URL.
3. Expand **Manage assessment questions and answers**. Paste the approved question bank as JSON and click **Save assessment bank**. The bank is saved to `app_content.main.payload.quizzes` and the corresponding module becomes active.
4. Check the question text, answer options, correct option index and optional explanation against the original programme deck before publishing. The correct option index is zero-based (`0` = first option, `1` = second option, etc.). No questions are invented by the application.

Question-bank JSON structure (replace this template with questions and answer keys taken from your approved slides; the empty array below is deliberately not a demo bank):

```json
{
  "title": "Module 2 Knowledge Check",
  "passingScore": 70,
  "duration": 15,
  "questions": []
}
```

Example of the structure for one genuine question once it has been authored and reviewed:

```json
{
  "title": "Module 2 Knowledge Check",
  "passingScore": 70,
  "duration": 15,
  "questions": [
    {
      "id": "m2_q1",
      "question": "Insert the approved question from the module PPT",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 1,
      "explanation": "Optional approved teaching explanation"
    }
  ]
}
```

I checked the files available in this conversation and the uploaded project archive; no source PPT/PPTX/PDF files were present in the materials provided here. Therefore Modules 2 and 3 are enabled in the module list, but their real presentations and assessment banks must be uploaded/pasted from your decks in the admin screen. Do not use placeholder text as a real medical question bank.

### Question and answer records in the admin dashboard

For each option selected by a doctor, `/api/quiz-answer` reads the authoritative answer key from Supabase, verifies the selected option on the server, and writes an `analytics_events` row with the question, selected answer, correct answer, correctness, module, time, doctor, session and device dimensions. The browser does not receive every correct answer key in the initial data payload. Completed submissions are also verified and saved in `quiz_attempts` with the entire answer set and score. The Analytics page shows both **Assessment attempts and answers** and **Individual question-answer events**; the latter includes every option the doctor selected, the complete option list, the correct answer and the result—even if the doctor leaves before submitting the full quiz. Use **Export attempts** or **Export all answers** to download records. A question is only logged once a doctor selects an option; unanswered questions are not treated as answered records.

## 11. How to change module content and code safely

For normal course updates, use **Admin → Content Modules** instead of editing HTML or JavaScript: upload the approved PPT/PPTX/PDF for each module, then paste its reviewed assessment questions and answer key into that module's JSON editor and save. The presentation upload supports files up to 100 MB and retains only private Supabase Storage paths in the database. The module cards can be active before an actual file is uploaded; doctors will see a clear pending-content message rather than fabricated teaching materials.

Use these source files only when changing application behavior or design:

- `js/doctor.js` and `css/doctor.css` — doctor learning experience and quiz interactions.
- `js/admin.js`, `admin-dashboard.html` and `css/admin.css` — admin data tables, analytics and content editor.
- `api/quiz-answer.js` — server-side answer validation and immediate event recording. Keep answer keys server-side; do not send `correct` fields in the initial doctor bootstrap.
- `api/quiz-attempt.js` — completed assessment validation and scoring.
- `api/admin/question-answers.js` and `api/admin/export.js` — admin question-answer history and exports.
- `api/auth/forgot-password.js`, `api/auth/reset-password.js`, `js/password-reset.js` and `reset-password.html` — email password reset flow.
- `supabase.sql` and the additive migration — database fields/tables and safe schema upgrades.

`js/data.legacy.js` is the original bundled starter content. On an initialized production database, the insert-only seed deliberately skips `app_content/main`; editing that file alone will not overwrite the live database. Use the module editor or an intentional reviewed database content migration for production course changes. Never replace the existing articles or question banks with placeholder/sample content.

## 12. Live analytics and caching

Authenticated routes record registration/login, sessions, duration heartbeats, module/article views, clicks, quiz attempts and available device/browser/OS dimensions. Analytics are live data and start empty when no activity has occurred; they are not populated with demonstration figures. Some fields, such as advertisement clicks, require the actual rendered ad/content element to carry the correct analytics data attributes.

The project uses `Cache-Control: no-store` on APIs and Vercel response headers to reduce stale results. The browser can still cache fonts or other third-party static resources according to the third party's own behavior; there is no guarantee that “no cache anywhere” is possible. Server API secrets and password inputs must never be placed in public cached resources.

## 13. Backups and preservation

Every newly created doctor gets a separate snapshot row in `registration_audit` through a database trigger. The migration also backfills existing doctors in that archive without duplicates. The project includes a local pre-migration backup and private Supabase snapshot endpoint/scheduled backup. Nightly snapshots include both `users` and `registration_audit` tables, as well as modules, quiz attempts, quiz answer events, reset tokens and application content. Vercel Cron is configured for a nightly run at 02:00 UTC (07:30 IST). A full database backup every second is not appropriate: it is expensive, creates redundant sensitive copies and can overload the database. For stronger recovery, use Supabase's managed backup/PITR options where available and keep a separate encrypted off-platform copy with documented restore testing.

Do not run `DROP TABLE`, `TRUNCATE`, or destructive reseeding against production. The article bundle `js/data.legacy.js` is preserved as supplied, and the seed is insert-only for the existing main content key.

## 14. Deploy to Vercel

1. Deploy this extracted folder as the Vercel project root (leave Root Directory blank or set it to `.`). The project root must contain `index.html`, `api/`, `server/`, `package.json` and `vercel.json`.
2. Add all required server environment variables to Preview and Production.
3. Ensure the private Supabase `backups` bucket exists and is not public.
4. Run `npm run check`, then deploy a Preview build.
5. Test doctor registration with an unused test email and mobile number, then sign in with that email/password.
6. Test administrator sign-in, doctor record visibility, CSV/JSON export, activity event recording and backup creation.
7. Only then promote the Preview build to Production.

The original content file is part of this project and should not be replaced during this authentication update. The project archive does not include live credentials, a pre-populated production database, or the module PPT/PPTX/PDF decks; upload your approved decks through the admin module editor after applying the migration.

## Troubleshooting

**Registration reports an existing account:** try signing in with that email, use the existing account recovery process, or ask the admin for help. Since this build does not include email ownership verification, use a mailbox you control.

**Registration API returns 500:** verify `SUPABASE_URL`, the server-only Supabase secret, `GML_SESSION_SECRET`, and that both SQL files were applied in the intended order. Review Vercel function logs for the server-side cause; the browser message intentionally avoids exposing secrets.

**Registration rate limited:** wait for the hourly window to pass. Do not delete rate-limit rows casually in production.

**Welcome email not sent:** registration still succeeds. Configure a valid Resend key and verified sender. Check the admin email status field. The email is optional and delivery is not identity verification.

**Doctor login says invalid email/password:** confirm the account is active, the email is exactly the one used for registration, and the registration request completed successfully. The original password is never visible to admin. For admin-created accounts that have not yet set a password, choose “Send setup link” in the doctor list to email a new single-use link. A doctor who forgets a password should use “Forgot password?” and open the email reset link. Resend must be configured for production mail delivery.

**Admin exports fail:** apply the latest additive migration, then retry. Use `question-answers` to export each question response, including in-progress quizzes. Keep exports in an access-controlled location because they contain personal and usage data.

**Forgot password email is not arriving:** set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` to a verified sender, and `APP_ORIGIN` to the actual HTTPS deployment URL. The reset link expires in 30 minutes and can be used once. For local-only testing, set `DEV_SHOW_RESET_LINK=true` in `.env`, restart your local Node server, submit the reset form, and open the returned local link. Never enable this flag in Vercel/production. Production forgot-password requires a verified Resend sender; without it, the API deliberately returns the same generic response to avoid account enumeration.

**A published module has no slides or assessment:** upload its approved PPT/PPTX/PDF in Admin → Content Modules, then add its approved question bank in JSON and save it. The active status makes the module available in the doctor dashboard, but it does not create missing source content.

**Individual answers are missing from the answer-event table:** ensure doctors are using the updated `js/doctor.js` and `/api/quiz-answer` endpoint, and that the `analytics_events` table has the latest additive migration. Completed attempts are also retained separately in `quiz_attempts`.

## Privacy and operational checklist

- [ ] HTTPS enabled for deployed pages and API routes.
- [ ] Server-only Supabase secret and session secret set in Vercel.
- [ ] Admin password is long and unique; no demo credentials remain enabled.
- [ ] No Twilio/SMS OTP configuration is required by active code.
- [ ] Resend email sending is tested for welcome, first-password setup and forgot-password flows; no messaging-provider credentials are required.
- [ ] Phone and email are clearly treated as unverified until a verification flow is added.
- [ ] RLS enabled; no anonymous read/write policies on sensitive tables.
- [ ] Backups stored privately and tested with a restore procedure.
- [ ] Exports are protected and password hashes are excluded.
- [ ] Welcome-email sender is verified if email is enabled.
- [ ] Published articles and quiz content remain intact after migration and seed.

