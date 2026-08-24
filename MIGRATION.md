# Cutover off Lovable Cloud

The code no longer depends on Lovable. What remains is account work: standing up
your own Supabase project, Google OAuth client, SMTP sender and Vercel project,
then flipping the environment variables.

Do the steps in order. Nothing here is reversible once step 8 runs, so verify
step 7 first.

## Outstanding — the three things still blocking the cutover

1. **The Polar webhook still points at Lovable.** The registered endpoint is
   `https://project--1fa70be0-c738-4be1-b75e-48f5cc21ed62-dev.lovable.app/api/public/polar-webhook`.
   Repoint it at the production origin **before** Lovable is torn down —
   otherwise every subscription state change (upgrade, cancel, payment failure)
   stops reaching Postgres and accounts silently freeze on whatever plan they
   last had:

   ```sh
   npm run webhooks:sync -- <PROD_URL>/api/public/polar-webhook
   npm run webhooks:list          # confirm the URL that came back
   ```

   Re-check `POLAR_WEBHOOK_SECRET` afterwards — a synced endpoint keeps its
   secret, a recreated one does not.

2. **`PUBLIC_APP_URL` is unset.** It pins the OAuth redirect URI Google must
   match byte for byte, so Gmail connect cannot work in production until it
   equals the production origin. Set it in the hosting environment, then
   register both redirect URIs in the Google console:
   `<PROD_URL>/oauth/gmail/return` and `http://localhost:3000/oauth/gmail/return`.

   Note that `gmail.readonly` is a **restricted** Google scope. While the OAuth
   consent screen is in Testing, only listed test users can connect a mailbox;
   publishing requires Google's verification review, which takes weeks. Start it
   early if outside users will connect mailboxes.

3. **`20260822120000_gmail_scan_limit.sql` has not been applied to the live
   database.** It adds `profiles.gmail_scan_limit`, which the settings page
   writes and the Gmail scan reads. Push it, then regenerate types:

   ```sh
   supabase db push
   npm run db:types
   ```

   `src/integrations/supabase/types.ts` is still generated from an older schema
   and does not know about `deals`, `theses`, `deal_threads` or
   `local_import_marks`, so `deals.functions.ts` addresses its client untyped
   until that regeneration runs.

## 0. Facts that shape the plan

- Deals, thesis and chat threads are stored in **Postgres** — tables `deals`,
  `theses`, `deal_threads` and `local_import_marks`, behind row-level security
  and reached through `src/lib/deals.functions.ts`. `src/lib/store.ts` is a
  client-side read cache over them, not storage; it touches localStorage only to
  import, once, a pipeline built before the data moved server-side. None of it
  ever lived in Lovable Cloud, so it is unaffected by the migration.
- Tables actually in use: `profiles`, `subscriptions`, `onboarding_responses`,
  `team_members`, `user_roles`, `billing_webhook_events`, `app_user_connections`,
  `deals`, `theses`, `deal_threads`, `local_import_marks`.
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

## 2. Create your own Supabase project — done

The project exists and `supabase/config.toml` carries its ref,
`dhlqnfwloziaptiwrtjp`. A live test pass confirmed the app reads and writes it.
Still pending on that project: the migration in **Outstanding item 3**.

For reference, or to stand up another environment:

1. New project in your own org. Note the project ref, URL and keys
   (Settings → API): publishable key and service role key.
2. Apply the schema:
   ```sh
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   `supabase link` rewrites the ref in `supabase/config.toml`.
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
  Done: the credentials are in place and were exercised in the live test pass.
- **Authentication → URL Configuration**: set the site URL to your domain and
  add every redirect URL you use — production origin, preview origins and
  `http://localhost:3000` — otherwise `signInWithOAuth` bounces. The production
  origin still has to be added once the domain is live.
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
   `http://localhost:3000/oauth/gmail/return` for local work. **Not registered
   yet — Outstanding item 2.**
4. OAuth consent screen: add scopes `userinfo.email`, `userinfo.profile`,
   `gmail.readonly`.
   `gmail.readonly` is **restricted** — while the app is in Testing only listed
   test users can connect. Publishing needs Google's verification review, which
   takes weeks; start it early if outside users will connect mailboxes.
5. Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`. Done — the
   credentials were exercised in the live test pass.
6. Generate the token encryption key: `openssl rand -base64 32` →
   `APP_USER_CONNECTION_KEY_SECRET`. This also signs the OAuth `state`.

Stored Lovable connection keys in `app_user_connections` are dead — the column
now holds Google refresh tokens. Clear the table so users reconnect cleanly:

```sql
delete from public.app_user_connections where connector_id = 'google_mail';
```

The UI exists now, so this is no longer a half-built feature. `/settings`
(`src/components/gmail-connection.tsx`) connects and disconnects the mailbox and
sets how many recent messages a scan reads;
`src/components/gmail-scan-dialog.tsx` runs the scan, batched by
`src/lib/gmail-scan.ts` so one request cannot outlast the hosting function
timeout. The scan size is stored per user in `profiles.gmail_scan_limit`
(migration `20260822120000_gmail_scan_limit.sql` — not yet applied, Outstanding
item 3).

## 6. Hosting on Vercel

1. Import the repo in Vercel. Build command `npm run build` (`npm run
build`); Nitro's `vercel` preset writes `.vercel/output`, which Vercel picks
   up without extra config.
2. Add every variable from `.env.example` to Production and Preview.
   `PUBLIC_APP_URL` must equal the deployed origin — **still unset, Outstanding
   item 2.**
3. Point Polar's webhook at `https://<domain>/api/public/polar-webhook`
   (`npm run webhooks:sync -- <url>`), and re-check `POLAR_WEBHOOK_SECRET`.
   **Still aimed at Lovable, Outstanding item 1.**
4. Move the domain's DNS off `*.lovable.app`.

To host somewhere else instead, set `NITRO_PRESET` — `node-server` for a VPS,
`cloudflare-module` for Workers.

## 7. Verify before removing Cloud

Run against the new stack with the old one still alive. A live test pass has
confirmed every external service answers: Supabase, Azure AI Foundry
(`gpt-4.1`), Azure AI Document Intelligence, Polar (sandbox) and the Google
OAuth credentials. What remains is the end-to-end pass on the production origin:

- [ ] Sign up with email → confirmation mail arrives → `/onboarding` loads.
- [ ] Password reset mail arrives and sets a new password.
- [ ] Google sign-in works on the deployed domain **and** localhost.
- [ ] An existing migrated user can sign in (password or reset).
- [x] Deal upload → Azure screening returns a score.
- [x] `/api/chat` streams a reply.
- [ ] Billing page loads, Polar sync links the subscription, webhook rows land
      in `billing_webhook_events` — needs Outstanding item 1 first.
- [ ] Admin and developer surfaces still gate correctly.
- [ ] Gmail connect completes and a scan returns candidates — needs Outstanding
      items 2 and 3 first.
- [ ] A screening past the plan's quota is refused with the upgrade message.
- [ ] An unauthenticated `POST /api/chat` and an unauthenticated call to the AI
      server functions both come back 401.

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
| localStorage pipeline in `store.ts`            | `deals` / `theses` / `deal_threads` under RLS  |
| `deals-xxxx@inbox.baseerah.dev` forwarding     | real Gmail OAuth connection on `/settings`     |
| unauthenticated AI endpoints                   | `requireSupabaseAuth` + `request-auth.ts`      |

Polar reconciliation moved from the Google sign-in handler (which no longer
returns inline, since the browser now leaves the page) to the authenticated
layout, so it still runs once per entry.

The advertised forwarding address was never real: `inbox.baseerah.dev` does not
resolve (NXDOMAIN), so nothing sent there ever arrived. It is gone, and the deal
inbox is an actual Gmail account the user authorizes.

The four AI server functions in `src/lib/deal-ai.functions.ts` (`analyzeDeal`,
`generateMemo`, `generatePassEmail`, `extractDocument`) and the `/api/chat`
route accepted anonymous requests, which made the Azure deployment an open
proxy. All five are gated now: the server functions through the
`requireSupabaseAuth` middleware, and `/api/chat` — which cannot take
server-function middleware — through `authenticateRequest` in
`src/integrations/supabase/request-auth.ts`, the shared bearer-token validator
both paths ultimately agree with.

Screening is metered per plan on top of that gate: `screeningQuota` on the
`Plan` type (`src/lib/plans.ts`), the decision in `screeningAllowed` /
`screeningQuotaForPlan` / `periodElapsed` (`src/lib/billing-rules.ts`), enforced
by `assertAndRecordScreening` (`src/lib/screening-quota.server.ts`) at the top of
`analyzeDeal` only — memos, pass emails and chat are follow-ups on a deal that
has already been metered. Trial accounts get 10 screenings per period, Angel
150, Syndicate 750, Institutional unlimited. The counter lives in
`subscriptions.deals_screened_this_period` and is written with the service-role
client, since an account must never be able to edit its own meter.
