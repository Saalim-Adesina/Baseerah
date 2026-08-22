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

Requires Node.js 20+ and [Bun](https://bun.sh) (or npm).

```sh
git clone <this-repository-url>
cd deal-oracle-00
bun install
cp .env.example .env.local   # fill in the values
bun run dev
```

`vite.config.ts` loads `.env.local` then `.env` into the server process, so
server functions see the same variables they get in hosting.

## Database

`supabase/migrations/` is the schema source of truth. Apply it to a fresh
project with the Supabase CLI:

```sh
supabase link --project-ref <project-ref>
supabase db push
```

Regenerate types after schema changes:

```sh
supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts
```

## Deploy

```sh
bun run build    # nitro emits .vercel/output
vercel deploy
```

Set every variable from `.env.example` in the Vercel project (Production and
Preview), and point `PUBLIC_APP_URL` at the deployed domain.

See `MIGRATION.md` for the one-time cutover checklist off Lovable Cloud.
