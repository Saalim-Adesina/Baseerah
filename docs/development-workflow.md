# Development workflow

A one-person cycle for this repo. Written for the constraints that actually
exist here — Vercel, Supabase, Polar's sandbox/production split, and a Google
OAuth client whose redirect URIs are registered per origin.

The guiding rule: **automate the gate, not the process.** A solo developer does
not need review queues or sprint ceremony. What they do need is something that
refuses to let a broken build reach a domain Google is verifying.

---

## Environments

Three, and no more. A fourth adds config surface without adding safety.

| | Local | Staging | Production |
|---|---|---|---|
| Runs on | `npm run dev`, port 3000 | Vercel | Vercel |
| URL | `http://localhost:3000` | `test.baseerah.dev` | `www.baseerah.dev` |
| Git | working tree | `staging` branch | `main` branch |
| `APP_ENV` | `preview` | `preview` | `production` |
| Database | staging Supabase project | staging Supabase project | `dhlqnfwloziaptiwrtjp` |
| Polar | sandbox | sandbox | live |
| Purpose | build it | prove it works on a real host | serve users |

`APP_ENV` is the single switch. It selects the Polar organisation, its
credentials and its product ids together, so the API host and the token it is
used with can never disagree. Anything other than `production` — including
unset — resolves to `preview`, which means a forgotten variable falls back to
the sandbox rather than charging a real card.

The apex `baseerah.dev` permanently redirects to `www.baseerah.dev`, so the
canonical production origin is the `www` one. Google matches OAuth redirect URIs
byte for byte, so that is the host that must be registered.

Staging and testing are the same environment here — `test.baseerah.dev`. There
is no separate QA tier.

Work lands on `staging`, which Vercel deploys to `test.baseerah.dev`. Merging
`staging` into `main` deploys production. Each environment builds against its own
environment variables, which is what makes it safe to point them at different
Supabase projects later.

**Cloud-integrated features are tested on staging, never on localhost.** That is
a deliberate policy, not a limitation:

| Tested locally | Tested on staging only |
|---|---|
| Screening, memos, deal chat | Gmail connect and inbox scan |
| Sign-in, password reset, onboarding | Polar checkout and webhooks |
| Pipeline, thesis, settings UI | Anything Google must reach |

The reason is that OAuth callbacks and webhooks require an origin the outside
world can reach and that Google and Polar have registered in advance. Tunnelling
localhost to satisfy that produces a URL that changes every session, which means
re-registering endpoints constantly and testing a topology that does not match
production. A deployed staging origin is stable, registered once, and is the
thing users will actually hit.

The code enforces this: `assertOAuthOriginUsable` in `src/server/appOrigin.ts`
refuses a Gmail connect from a loopback origin with an instruction to use
staging, rather than letting it fail at Google's consent screen with a bare
`redirect_uri_mismatch`. Set `ALLOW_LOCAL_OAUTH=true` in `.env.local` to opt
back in, having first registered `http://localhost:3000/oauth/gmail/return`.

Everything not in the right-hand column should be caught before you push.

---

## The loop

```
   ┌─ code ─→ gate ─→ push staging ─→ test.baseerah.dev ─→ smoke ─┐
   │                                                              │
   └─────── merge staging → main ─→ baseerah.dev ◄────────────────┘
```

**1. Code.** On `staging`. Cut a short-lived branch off it only when a change is
risky enough that you want staging itself to stay deployable while you iterate.

**2. Gate — run before every push:**

```sh
npm run typecheck && npm test && npx eslint . && npm run env:check
```

Non-negotiable, because there is no reviewer to catch what you miss. See
"Making the gate automatic" below.

**3. Push `staging`.** Vercel deploys it to `test.baseerah.dev` automatically.

**4. Smoke staging.** Not a full regression pass — the path you touched, plus
anything that talks to an external service. This is also the *only* place Gmail
connect and Polar webhooks can be exercised at all. Five minutes.

**5. Ship.** `git switch main && git merge staging && git push`. Vercel deploys
production.

Rollback is Vercel → Deployments → the previous production build → *Promote to
Production*. Seconds, no git archaeology. Do that first and diagnose afterwards.

---

## The gap you should close first: no staging database

There is **one** Supabase project. Staging and production both point at it, so a
migration is tested against live user data, and a bad one takes production down
with it. This is the single largest risk in the current setup.

It has already caused a real incident: `20260818090000_rename_superadmin_to_developer.sql`
was applied to the database out of band and never recorded in the migration
history, so the next `supabase db push` tried to re-run
`ALTER TYPE ... RENAME VALUE 'superadmin'` — which fails, because the value no
longer existed — and blocked every migration behind it. It needed a manual
`supabase migration repair` to unblock.

Two ways out.

**Option A — a second Supabase project (recommended).** Create `BaseerahStaging`,
apply the schema with `supabase db push`, and point staging at it. Costs a free
tier slot. Staging traffic stops touching real accounts, and migrations get
rehearsed somewhere that doesn't matter.

This matters more under the staging-testing policy above, not less. Every Gmail
scan and every Polar checkout you exercise now runs on staging — and while
staging and production share one database, those test runs write real rows to
the production `deals` table and store a real refresh token against a real
account. Splitting the database is what makes staging safe to actually use.

**Option B — Supabase branching.** Ephemeral database branches per git branch.
Less to maintain, but a paid feature and more machinery than a solo project
usually needs.

Take A unless you are already paying for branching.

---

## Migration discipline

Schema is the one thing here with no undo button. Four rules:

1. **Never change the database by hand.** Not in the SQL editor, not "just this
   once". Every change is a file in `supabase/migrations/`. The incident above
   is what hand-editing costs.
2. **Check drift before pushing:** `npx supabase migration list` shows local
   versus remote. Mismatched columns mean something changed out of band; fix the
   history with `supabase migration repair` before pushing anything new.
3. **Additive first.** Add a column, backfill, switch the code, drop the old
   column in a *later* deploy. A migration and the code that needs it should
   never be required to land in the same second — they won't.
4. **Write migrations to be re-runnable.** `IF NOT EXISTS`, `DROP ... IF EXISTS`
   before `CREATE`. Cheap to write, saves an outage when a push half-applies.

After any schema change: `npm run db:types`, and commit the regenerated
`types.ts` with the migration. Stale types are how untyped `as never` casts creep
back in.

---

## Environment variables

`.env` is untracked and `.env.local` always was. `.env.example` is the key list —
when you add a variable, add its name and a comment there in the same commit, or
the next environment silently lacks it.

Set these per environment in Vercel (Project → Settings → Environment
Variables), because they genuinely differ. Vercel's environment scopes are named
Production and Preview — "Preview" is the one that applies to
`test.baseerah.dev`:

| Variable | Production | Staging (Vercel calls this Preview) |
|---|---|---|
| `APP_ENV` | `production` | `preview` |
| `PUBLIC_APP_URL` | allowlist, production first | same allowlist |
| `POLAR_PRODUCTION_ACCESS_TOKEN` | live token | — |
| `POLAR_PRODUCTION_WEBHOOK_SECRET` | live endpoint secret | — |
| `POLAR_PRODUCTION_PRODUCT_*` | optional override | — |
| `POLAR_SANDBOX_ACCESS_TOKEN` | — | sandbox token |
| `POLAR_SANDBOX_WEBHOOK_SECRET` | — | sandbox endpoint secret |
| `POLAR_SANDBOX_PRODUCT_*` | — | **required** |
| `SUPABASE_*` | production project | staging project |

Each environment reads only its own Polar variables — there is no fallback
between them, and the retired `POLAR_SERVER` / `POLAR_ACCESS_TOKEN` /
`POLAR_WEBHOOK_SECRET` names are no longer read at all. If one is still set
while its replacement is missing, the app says so by name rather than quietly
using it.

The sandbox product ids are **required** because sandbox is a separate catalogue
with different ids and there is deliberately no fallback to the live ones. That
fallback is what previously let a sandbox deploy send live product ids to the
sandbox API, where checkout failed with "product doesn't exist" and nothing
surfaced the cause until someone tried to pay.

Two ways to check what a deployment actually resolved:

```sh
npm run env:check                    # this environment
npm run env:check -- --env=production
```

and the developer-only **`/environment`** page, which additionally fetches every
product id from the Polar organisation in use, so a configured-but-wrong id
shows up as a failed row. It also flags whether each webhook endpoint's signing
secret matches the one this deployment holds.

`PUBLIC_APP_URL` is an **allowlist**, comma-separated, production first:

```
PUBLIC_APP_URL="https://www.baseerah.dev,https://test.baseerah.dev"
```

The same value works in both environments — the request's own hostname decides
which entry is used, so each gets a redirect URI Google will match. An
unrecognised Host falls back to the first entry rather than being echoed back,
so a forged header cannot produce an unregistered redirect URI. Both origins
must be registered in the Google console.

The `VITE_*` values are **inlined into the client bundle at build time**
(`vite.config.ts`). If they are missing during a build the build still succeeds
and ships a frontend with no Supabase config, which fails silently in the
browser. Confirm they exist in Vercel before trusting a green build.

---

## Making the gate automatic

Right now nothing runs the gate for you. There is no CI and no git hook, so
"remember to run the tests" is the whole safety net. Two options, not exclusive:

**A pre-push hook** — instant feedback, zero infrastructure:

```sh
cat > .git/hooks/pre-push <<'EOF'
#!/bin/sh
npm run typecheck && npm test || {
  echo "Gate failed — push aborted. Override with --no-verify if you mean it."
  exit 1
}
EOF
chmod +x .git/hooks/pre-push
```

Note `.git/hooks/` is not version-controlled, so this lives on one machine only.

**GitHub Actions** — runs on a clean checkout, catches "works on my machine",
and is free for private repos within the monthly minutes allowance. Worth adding
once the hook starts feeling insufficient.

Both is best: the hook for speed, Actions for truth.

---

## External services

These have no staging equivalent and no undo. Treat them as production always.

**Polar.** Sandbox and production are separate accounts with separate tokens,
products and webhook secrets. The webhook endpoint is registered per environment —
`npm run webhooks:list` shows what is currently pointed where.

Which organisation a command talks to comes from `APP_ENV`. Override it for a
single command with `--env=`:

```sh
npm run webhooks:list -- --env=sandbox
npm run webhooks:sync -- --env=production https://www.baseerah.dev/api/public/polar-webhook
```

Use the flag rather than an `APP_ENV=... npm run ...` prefix — that form does not
work in PowerShell, and this repo is developed on Windows. Every command prints
the organisation and API host it resolved before doing anything, because syncing
the wrong one is otherwise silent and the endpoints look identical.

Two things about `webhooks:sync` that are easy to get wrong:

- It matches an existing endpoint **by URL**, not by name. Syncing to a new URL
  therefore *creates a second endpoint* rather than moving the first. Delete the
  old one afterwards with `npm run webhooks:delete -- <id>`, or Polar will keep
  delivering to both.
- It tries to pin the endpoint's signing secret to the one this app holds, but
  **Polar regenerates the secret** on both create and on `PATCH .../secret` and
  ignores the value sent. So after any sync you must read the endpoint's new
  secret from the Polar dashboard and update `POLAR_SANDBOX_WEBHOOK_SECRET` or
  `POLAR_PRODUCTION_WEBHOOK_SECRET` in `.env.local` and in Vercel. Until you do,
  every delivery fails signature verification with a 401 and subscription changes
  silently stop applying. The `/environment` page shows a `secret matches` column
  per endpoint, which is the quickest way to confirm you got it right.

**Google OAuth.** Every origin you use needs its redirect URI registered in
advance. Under the staging-testing policy that is just the two deployed origins —
`https://test.baseerah.dev/oauth/gmail/return` and
`https://www.baseerah.dev/oauth/gmail/return` — the `www` host, since the apex
redirects to it and Google matches byte for byte. A localhost URI is not needed, and
leaving it off keeps the list clean for verification review. While the consent screen
is in Testing, only listed test users can connect at all — and refresh tokens for
`gmail.readonly` expire after 7 days, so connected mailboxes break weekly until
the app is published.

**Azure.** One resource, shared by every environment. Staging traffic spends the
same quota as production. Worth a separate deployment if staging usage ever grows
past incidental.

**Secrets.** Rotating means *deleting the old credential*, not just issuing a new
one. A token that is still valid is still a live credential regardless of whether
anything uses it. This repo learned that the hard way: a Polar access token
reached `origin/main` through a tracked `.env`, and issuing a replacement left the
original working.

---

## What to skip

You are one person. Skip these until a second developer exists:

- Pull request review of your own work — the automated gate is the reviewer
- Release branches and tags — `staging` and `main` are the whole model, and
  GitFlow on top of that is pure overhead
- A separate QA or UAT tier — `test.baseerah.dev` is staging and testing both
- Release branches, tags, changelogs — Vercel's deployment list is your history
- Issue templates, project boards, estimation

Add ceremony when a second person makes coordination cost more than the ceremony
does. Not before.
