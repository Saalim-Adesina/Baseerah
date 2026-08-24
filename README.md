# Deal Compass (Baseerah)

Investment screening software that automates screening of startup deals for
institutional investors — venture capital, incubators, private equity. Deals
land through manual upload or a connected Gmail inbox. The investment thesis and
preferred industries are customised in natural language. Output scores each
metric, supports chat with deals, IC memo generation, in-depth per-deal analysis
of what's missing and what to discuss with founders, and polite pass emails.

## Stack

| Concern          | Service                                                      |
| ---------------- | ------------------------------------------------------------ |
| Database + Auth  | Supabase (your own project)                                  |
| Models           | Azure AI Foundry (chat, screening, memos)                    |
| Document parsing | Azure AI Document Intelligence (`prebuilt-layout`)           |
| Deal inbox       | Gmail API via your own Google OAuth client                   |
| Billing          | Polar                                                        |
| Auth email       | Supabase Auth + your SMTP provider                           |
| Hosting          | Vercel (Nitro `vercel` preset; override with `NITRO_PRESET`) |

## Development

Requires Node.js 20+. `package-lock.json` is the authoritative lockfile — install with npm.

```sh
git clone <this-repository-url>
cd deal-oracle-00
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

`vite.config.ts` loads `.env.local` then `.env` into the server process, so
server functions see the same variables they get in hosting.

**Neither `.env` nor `.env.local` is tracked.** `.env.example` is the key list;
a fresh clone has no values until you fill one in. That is deliberate — a live
Polar access token reached `origin/main` through a tracked `.env` once, and the
only reliable fix for a committed credential is revoking it. Put every value in
`.env.local`, and add any new variable to `.env.example` (name and comment, no
value) so the next person knows it exists.

## Scripts

| Script                 | What it does                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| `dev`                  | Vite dev server                                                  |
| `build`                | Production build (Nitro emits `.vercel/output`)                  |
| `preview`              | Serve the production build locally                               |
| `test`                 | Run the Vitest suite once                                        |
| `test:watch`           | Vitest in watch mode                                             |
| `typecheck`            | `tsc --noEmit` — the build does not type-check on its own        |
| `lint` / `format`      | ESLint / Prettier                                                |
| `webhooks:list`        | List the Polar webhook endpoints on the account                  |
| `webhooks:sync -- <url>` | Point Polar's webhook at `<url>`, creating or updating it      |
| `webhooks:delete -- <id>` | Remove a webhook endpoint by id                               |
| `webhooks:deliveries`  | Recent webhook deliveries, for debugging missed events           |
| `db:types`             | Regenerate `src/integrations/supabase/types.ts` from the database |

The `webhooks:*` scripts run `scripts/polar-webhooks.ts` through Node's type
stripping and load `.env` then `.env.local`, so `POLAR_ACCESS_TOKEN` and
`POLAR_SERVER` come from the same files the dev server uses. `db:types` runs
against the linked project (`supabase/config.toml`) and needs the Supabase CLI
logged in and linked.

## Database

`supabase/migrations/` is the schema source of truth. `supabase/config.toml`
points at project ref `dhlqnfwloziaptiwrtjp`. Apply the schema to a fresh
project with the Supabase CLI:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

Regenerate types after schema changes:

```sh
npm run db:types
# or: supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts
```

`types.ts` is currently missing `deals`, `theses`, `deal_threads`,
`local_import_marks` and `profiles.gmail_scan_limit`. Until it is regenerated,
`deals.functions.ts` and `settings.functions.ts` address the client untyped via
a local `db()` helper — remove those casts once the types are back in step.

```sh
```

Pipeline data — deals, thesis and chat threads — lives in Postgres (`deals`,
`theses`, `deal_threads`, `local_import_marks`) behind row-level security.
`src/lib/store.ts` is a client-side read cache over those tables, not storage.

## Deal inbox

`/settings` connects a Gmail account through your own Google OAuth client and
sets how many recent messages a scan reads (`profiles.gmail_scan_limit`).
Scanning runs in batches so a single request stays inside the hosting function
timeout. `gmail.readonly` is a restricted Google scope — see `MIGRATION.md` for
the consent-screen requirements.

## Deploy

```sh
npm run build    # nitro emits .vercel/output
vercel deploy
```

Set every variable from `.env.example` in the Vercel project (Production and
Preview), and point `PUBLIC_APP_URL` at the deployed domain.

See `MIGRATION.md` for the one-time cutover checklist off Lovable Cloud.
