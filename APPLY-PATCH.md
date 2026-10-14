# MedNeo Learning — Vercel Hobby Function-Limit Fix (package.json-safe revision)

## What this patch does

The supplied source snapshot contains 10 API handlers plus four shared helpers. This patch consolidates the public API entry points into **one Vercel catch-all function** at `api/[...path].js`. It moves the existing endpoint handler code to `server/api/routes/` and shared helper modules to `server/api/_lib/`. The router dispatches the same existing URLs to their original handlers, including `/api/health`, `/api/data`, `/api/auth/*`, `/api/admin/*`, `/api/module/:id`, and `/api/whatsapp/webhook`.

This is more definitive than merely moving helpers: only one JavaScript entry file remains under `api/`, beneath the Hobby plan's 12-function ceiling. Vercel documents API files as function entry points and supports wildcard/catch-all routing; see the Vercel function and routing docs linked in the final response.

## Supabase and content safety

- No Supabase table/row is deleted or updated by applying the patch.
- No SQL file or migration is run or included.
- `supabase.sql`, published content, PDFs, quiz data, HTML dashboards, stylesheets and browser-side scripts are not replaced.
- `package.json`, `package-lock.json`, and `vercel.json` are not changed. A customized `package.json` is accepted; API handlers and `vercel.json` must still match this patch version.
- `.env`, `.env.local`, `.git`, `node_modules`, Supabase keys and other secrets are not included in this patch ZIP.
- Existing handler implementations are moved, not rewritten; their only source edits are relative import paths. The catch-all dispatches requests to those same handlers.

## Apply the patch

1. Commit your current code or make a separate project-folder backup first.
2. Extract the ZIP contents into the **project root** — the same folder containing `api/`, `package.json`, and `vercel.json`. In the supplied project archive this folder was named `public/`.
3. Open a terminal in that project root and run:

   ```bash
   node apply-patch.mjs
   ```

4. The script intentionally does not fingerprint or modify `package.json`, so custom scripts and dependencies are preserved. It still checks `vercel.json` and every existing API/helper file against the inspected snapshot before making changes. If an API file or `vercel.json` differs, it stops without changing your project.
5. On success, inspect `git status` and `git diff`. The script creates a rollback backup beside your project folder, not inside the repository. After a successful apply, it removes its own staging files so they are not accidentally committed; only the application changes remain.
6. Commit and push to Git, then deploy on Vercel.

## Verify after deploy

Check these URLs/actions on your Vercel preview before promoting to production:

- `/api/health` should return `{ "ok": true, ... }`.
- Login/logout and `/api/auth/me` should continue to use the existing session cookie.
- Admin doctor list/status/invite endpoints should still require an admin session.
- `/api/module/<existing-public-id>` should continue to require a session and enforce the existing owner/admin check.
- `/api/whatsapp/webhook` should keep its existing verification and status callback behavior.

No Supabase reset is needed. If Vercel environment variables are already configured, leave them unchanged.
