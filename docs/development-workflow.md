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
| URL | `http://localhost:3000` | `test.baseerah.dev` | `baseerah.dev` |
| Git | working tree | `staging` branch | `main` branch |
| Database | staging Supabase project | staging Supabase project | `dhlqnfwloziaptiwrtjp` |
| Polar | `POLAR_SERVER=sandbox` | `sandbox` | `production` |
| Purpose | build it | prove it works on a real host | serve users |

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
npm run typecheck && npm test && npx eslint .
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
| `PUBLIC_APP_URL` | allowlist, production first | same allowlist |
| `POLAR_SERVER` | `production` | `sandbox` |
| `POLAR_ACCESS_TOKEN` | live token | sandbox token |
| `POLAR_WEBHOOK_SECRET` | live endpoint secret | sandbox endpoint secret |
| `SUPABASE_*` | production project | staging project (once it exists) |

`PUBLIC_APP_URL` is an **allowlist**, comma-separated, production first:

```
PUBLIC_APP_URL="https://baseerah.dev,https://test.baseerah.dev"
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
`npm run webhooks:list` shows what is currently pointed where. After any domain
change, re-point it: `npm run webhooks:sync -- <url>/api/public/polar-webhook`.

Note `webhooks:sync` is idempotent *by name*: it moves the single sandbox
endpoint rather than adding a second. Point it at staging and leave it there.

**Google OAuth.** Every origin you use needs its redirect URI registered in
advance. Under the staging-testing policy that is just the two deployed origins —
`https://test.baseerah.dev/oauth/gmail/return` and
`https://baseerah.dev/oauth/gmail/return`. A localhost URI is not needed, and
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
