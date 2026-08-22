# Cutover off Lovable Cloud

The code no longer depends on Lovable. What remains is account work: standing up
your own Supabase project, Google OAuth client, SMTP sender and Vercel project,
then flipping the environment variables.

Do the steps in order. Nothing here is reversible once step 8 runs, so verify
step 7 first.

## 0. Facts that shape the plan

- Deals, thesis and chat threads are stored in **browser localStorage**
  (`src/lib/store.ts`), not in Postgres. They never lived in Lovable Cloud and
  are unaffected by the migration.
- Tables actually in use: `profiles`, `subscriptions`, `onboarding_responses`,
  `team_members`, `user_roles`, `billing_webhook_events`, `app_user_connections`.
- No storage buckets, no realtime, no edge functions, no cron jobs.
- `supabase/migrations/` reproduces the whole schema from scratch, so the export
  is only needed for **rows**, not structure.

## 1. Export the Lovable Cloud database — do this first

Lovable tab → **Cloud → Overview → Advanced settings → Export data → Database →
Export**. Lovable emails you when the dump is ready; download it from
**Cloud → Storage**.

- Cap is 5 GB, one export per 24 hours.
- **Exports cannot be downloaded after Cloud is removed.** Get the file on disk
  before touching anything else.
- Lovable's docs say passwords do not survive in usable form and to plan for a
  reset round. The `pg_dump` in practice does contain `auth.users` rows with
  `encrypted_password`. Open the dump and check before you promise users no
  reset: if the hashes are there, importing them into Supabase Auth keeps
  passwords working, since both sides are stock GoTrue bcrypt.

## 2. Create your own Supabase project

1. New project in your own org. Note the project ref, URL and keys
   (Settings → API): publishable key and service role key.
2. Apply the schema:
   ```sh
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   `supabase/config.toml` still carries the old Lovable project ref; `supabase
link` rewrites it.
3. Import the exported rows. Restore `auth.users` before `public.*` — every
   app table has a foreign key to it, and `on_auth_user_created` fires on
   insert, so either disable that trigger during the load or let it upsert
   `profiles` and skip the `profiles` rows from the dump.
4. Re-seed the admin: `20260804213210_*.sql` grants the `admin` role by email
   at migration time. If your user id changed, insert the `user_roles` row by
   hand.

## 3. Auth settings on the new project

- **Authentication → Providers → Google**: create a Google OAuth client (or
  reuse the one from step 5) and paste the client id/secret. Supabase shows the
  callback URL to register — `https://<project-ref>.supabase.co/auth/v1/callback`.
- **Authentication → URL Configuration**: set the site URL to your domain and
  add every redirect URL you use — production origin, preview origins and
  `http://localhost:3000` — otherwise `signInWithOAuth` bounces.
- The old Lovable OAuth broker is gone; `src/routes/auth.tsx` now calls
  `supabase.auth.signInWithOAuth` directly, localhost included.

## 4. Email (Resend SMTP)

Auth mail is the only mail this app sends: signup confirmation, password reset,
team invite, email change. It comes from Supabase Auth, so the switch is
dashboard-only.

1. Resend → add and verify your sending domain (SPF + DKIM records).
2. Resend → SMTP credentials.
3. Supabase → **Authentication → Emails → SMTP Settings**: host
   `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender
   address on the verified domain.
4. Raise **Rate Limits → Emails** past the built-in 2/hour, which only exists
   for the default Supabase sender.
5. Send yourself a password reset from `/auth` and confirm delivery + that the
   link lands on `/reset-password`.

## 5. Google OAuth client for the Gmail deal inbox

1. Google Cloud console → enable **Gmail API**.
2. Credentials → **OAuth client ID → Web application**.
3. Authorized redirect URIs: `<PUBLIC_APP_URL>/oauth/gmail/return` plus
   `http://localhost:3000/oauth/gmail/return` for local work.
4. OAuth consent screen: add scopes `userinfo.email`, `userinfo.profile`,
   `gmail.readonly`.
   `gmail.readonly` is **restricted** — while the app is in Testing only listed
   test users can connect. Publishing needs Google's verification review, which
   takes weeks; start it early if outside users will connect mailboxes.
5. Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
6. Generate the token encryption key: `openssl rand -base64 32` →
   `APP_USER_CONNECTION_KEY_SECRET`. This also signs the OAuth `state`.

Stored Lovable connection keys in `app_user_connections` are dead — the column
now holds Google refresh tokens. Clear the table so users reconnect cleanly:

```sql
delete from public.app_user_connections where connector_id = 'google_mail';
```

Note: the Gmail server functions have no UI caller yet — the feature was
half-built when the migration started. `startGmailConnect`, `scanGmailInbox`
and the `/oauth/gmail/return` route are wired end to end and ready for the
pipeline/onboarding buttons described in
`docs/plans/connect-a-gmail-account-to-the-deal-inbox-2026-08-16.md`.

## 6. Hosting on Vercel

1. Import the repo in Vercel. Build command `bun run build` (or `npm run
build`); Nitro's `vercel` preset writes `.vercel/output`, which Vercel picks
   up without extra config.
2. Add every variable from `.env.example` to Production and Preview.
   `PUBLIC_APP_URL` must equal the deployed origin.
3. Point Polar's webhook at `https://<domain>/api/public/polar-webhook`
   (`bun scripts/polar-webhooks.ts sync <url>`), and re-check
   `POLAR_WEBHOOK_SECRET`.
4. Move the domain's DNS off `*.lovable.app`.

To host somewhere else instead, set `NITRO_PRESET` — `node-server` for a VPS,
`cloudflare-module` for Workers.

## 7. Verify before removing Cloud

Run against the new stack with the old one still alive:

- [ ] Sign up with email → confirmation mail arrives → `/onboarding` loads.
- [ ] Password reset mail arrives and sets a new password.
- [ ] Google sign-in works on the deployed domain **and** localhost.
- [ ] An existing migrated user can sign in (password or reset).
- [ ] Deal upload → Azure screening returns a score.
- [ ] `/api/chat` streams a reply.
- [ ] Billing page loads, Polar sync links the subscription, webhook rows land
      in `billing_webhook_events`.
- [ ] Admin and developer surfaces still gate correctly.
- [ ] Gmail connect completes and `scanGmailInbox` returns candidates.

## 8. Remove Lovable Cloud

Only after step 7 passes and the export file is safe on disk. Lovable tab →
**Cloud → Overview → Advanced settings → Remove Lovable Cloud**: tick both
warnings, type the project name. Irreversible — the instance, its auth and its
exports are deleted.

Then disconnect the GitHub repo from the Lovable project so pushes stop syncing.

## What changed in code

| Removed                                        | Replacement                                    |
| ---------------------------------------------- | ---------------------------------------------- |
| `@lovable.dev/cloud-auth-js` OAuth broker      | `supabase.auth.signInWithOAuth` in `auth.tsx`  |
| `src/lib/ai-gateway.server.ts` (was unused)    | Azure AI Foundry, already in `azure.server.ts` |
| `src/integrations/lovable/appUserConnector.ts` | `src/server/googleOAuth.server.ts`             |
| `connector-gateway.lovable.dev` calls          | Gmail REST API with own refresh tokens         |
| `src/lib/lovable-error-reporting.ts`           | `src/lib/client-error-reporting.ts`            |
| `@lovable.dev/vite-tanstack-config`            | explicit plugin list in `vite.config.ts`       |
| Lovable-managed `LOVABLE_API_KEY`, secrets     | `.env.example` variables you own               |
| `.lovable/plan/*`                              | `docs/plans/*`                                 |

Polar reconciliation moved from the Google sign-in handler (which no longer
returns inline, since the browser now leaves the page) to the authenticated
layout, so it still runs once per entry.
