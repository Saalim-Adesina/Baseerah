# CASA Tier 2 / Google API Services User Data Policy — readiness audit

**Scope:** Baseerah (TanStack Start + Supabase + Azure AI), pre-submission review for Google OAuth
verification of the restricted scope `https://www.googleapis.com/auth/gmail.readonly`.

**Reviewed at:** working tree on `main`, 22 August 2026. Build verified with `npx vite build`.

**Method:** manual source review of the Gmail/OAuth path, the crypto helpers, every service-role
call site, the RLS policy set in `supabase/migrations/*.sql`, all zod validators on server
functions, plus a client-bundle grep of the produced Vercel output and `npm audit --omit=dev`.

**Verdict up front: NOT ready to submit.** One Critical and four High findings must land first.
Nothing found is a cross-tenant data-access bug — the tenancy model is genuinely sound — but the
data-lifecycle and third-party-transfer story around Gmail data will not survive an assessor's
questions in its current state.

---

## 1. Data flow map for Gmail-derived data

### 1.1 Credential acquisition

| # | Hop | Code | What moves |
|---|-----|------|------------|
| 1 | Browser → app | `src/lib/gmail.functions.ts:27-40` | Authenticated user asks for a consent URL. State is HMAC-signed with the app secret (`src/server/oauthState.ts:21-24`). |
| 2 | Browser → Google | `src/server/googleOAuth.server.ts:42-61` | `scope=userinfo.email userinfo.profile gmail.readonly`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`. |
| 3 | Google → app | `src/routes/oauth.gmail.return.tsx:46` | `code` + `state` land in the browser's URL, then are POSTed to `completeGmailConnect`. |
| 4 | App → Google | `src/server/googleOAuth.server.ts:94-112` | Code exchange over TLS to `oauth2.googleapis.com/token`. Client secret from env. |
| 5 | App → Postgres | `src/server/appUserConnections.server.ts:4-22` | Refresh token AES-256-GCM encrypted (`src/server/connectionKeyCrypto.ts:13-18`) and upserted into `app_user_connections.connection_key_ciphertext`, keyed `(user_id, connector_id='google_mail')`. |
| 6 | App → Google | `src/server/gmail.server.ts:47-53` | `users/me/profile` for the mailbox address, stored in cleartext as `app_user_connections.account_label` (`src/lib/gmail.functions.ts:65`). |

Access tokens are minted on demand and cached **in process memory**, keyed by the plaintext refresh
token, in a module-level `Map` (`src/server/googleOAuth.server.ts:117-136`).

### 1.2 Mailbox read → third party → storage

| # | Hop | Code | What moves | Retained where |
|---|-----|------|------------|----------------|
| 7 | App → Gmail | `src/server/gmail.server.ts:86-91` | `users/me/messages?q=` with the fixed query at `:22-23` (`has:attachment`, deck extensions only, `newer_than:365d`, `-in:spam -in:trash`). | Nothing persisted. |
| 8 | App → Gmail | `src/server/gmail.server.ts:97-102` | `messages/{id}?format=full` — **full message payload including all headers and body parts**, not `metadata` format. | In-memory only; only Subject/From/internalDate/snippet are carried forward (`:113-123`). |
| 9 | App → Gmail | `src/server/gmail.server.ts:126-129` | First supported attachment downloaded as base64. | In-memory only. |
| 10 | **App → Azure Document Intelligence** | `src/server/gmail.server.ts:131` → `src/lib/azure.server.ts:90-105` | **The raw attachment bytes**, base64, POSTed to `{AZURE_DOC_INTELLIGENCE_ENDPOINT}/documentintelligence/documentModels/prebuilt-layout:analyze`. | Microsoft-side: the analyze operation result is retrievable at `operation-location` for 24h. Not persisted by us. |
| 11 | App → browser | `src/lib/gmail.functions.ts:100-103` | The whole `GmailDealCandidate[]` — subject, sender address and name, snippet, filename, **full extracted deck text** — is returned to the client for every candidate in the scan, whether or not the user imports it. | Browser memory (`src/components/gmail-scan-dialog.tsx:128-145`). |
| 12 | Browser → Postgres | `src/components/gmail-scan-dialog.tsx:91-117` → `src/lib/deals.functions.ts:166-188` | On explicit import only: `deck_text` (extracted text), `one_liner` (= Subject), `company` (derived from sender display name / domain), `deck_file_name`, `gmail_message_id`. | `public.deals` (`supabase/migrations/20260817120000_deals_multi_tenant.sql:40-77`), indefinitely. |
| 13 | **App → Azure OpenAI** | `src/lib/deal-ai.functions.ts:133-139`, `:158-184`, `:200-221` → `src/lib/prompts.server.ts:40-41` | Deck text (first 60 000 chars) plus every other deal field, in the prompt, to `{AZURE_FOUNDRY_ENDPOINT}/openai/deployments/{deployment}`. | Microsoft-side, see H1. Model output stored in `deals.analysis` / `deals.memo` / `deals.pass_email`. |
| 14 | **App → Azure OpenAI (chat)** | `src/routes/api/chat.ts:38-70` | Same dossier, plus the free-text conversation, streamed. | Transcript saved to `deal_threads.messages` (`src/lib/deals.functions.ts:379-403`). |

**Retention summary.** Gmail-derived content lives in four places once imported: `deals.deck_text`,
`deals.analysis`, `deals.memo`, and `deal_threads.messages`. All four are account-scoped and
cascade-delete with the owning `auth.users` row. The Gmail *credential* does not — see C1.

### 1.3 What is logged

There is no analytics or APM SDK in the tree, and `src/lib/client-error-reporting.ts:35` only calls
an optional `window.__reportClientError` sink that is never wired up. Good. But:

- `src/lib/error-capture.ts:52-63` monkey-patches the global `console.error` to expand any `Error`
  argument into message + stack + the **full `cause` chain**, truncated at 8 000 characters
  (`:15-31`), and that string goes to stdout — i.e. to Vercel's log drain.
- `src/server/gmail.server.ts:42` builds error messages as
  `` `Gmail request failed [${res.status}]: ${text.slice(0, 400)}` `` — 400 bytes of the raw Gmail
  API response body.
- `src/lib/azure.server.ts:109` and `:130` embed `await submit.text()` / `await poll.text()` — the
  raw Document Intelligence response — into thrown errors.

These bodies are normally structured API errors, not mail content, so this is not a confirmed leak
of Gmail message data into logs. It is, however, an unbounded path from a third-party response into
the host log with no redaction, and the 8 000-char expander guarantees the whole chain is printed.
See M9.

**No code path writes deck text, subjects, snippets or sender addresses to a log.** I checked every
`console.*` call site (26 of them); the only ones on the Gmail path are
`src/hooks/use-gmail.ts:30` and `src/components/gmail-connection.tsx:41`, both client-side and both
logging a connection-status error object, not message data.

---

## 2. Findings

### CRITICAL

#### C1 — The Gmail refresh token and the Google grant survive account deletion

- **Where:** `supabase/migrations/20260816203744_86ad6791-1b6c-40dd-ab3c-e0239650ecf9.sql:1-13`
  (table definition), `src/lib/admin.functions.ts:246-248` (the delete path),
  `src/routes/privacy.tsx:220-224` (the published claim).
- **What:** `app_user_connections.user_id` is declared `uuid NOT NULL` with **no
  `REFERENCES auth.users(id) ON DELETE CASCADE`** — unlike `deals`, `theses`, `deal_threads`,
  `profiles`, `subscriptions`, `onboarding_responses` and `user_roles`, which all cascade.
  `deleteOrganization` deletes `team_members` and then calls `supabaseAdmin.auth.admin.deleteUser`.
  Every other table drains via cascade; `app_user_connections` does not. The encrypted refresh
  token stays in the database forever, and `revokeGoogleToken` is never called, so **Google's side
  of the grant also stays live**. The row is now orphaned — no user id resolves to it, so no
  product surface can ever clean it up.
- **Why an assessor flags it:** this is a direct failure of the Google API Services User Data
  Policy's deletion requirement for restricted-scope data, and it contradicts the app's own
  published privacy policy, which states at `src/routes/privacy.tsx:222-224` that account data is
  removed within 30 days. An assessor who asks "show me what happens to the Gmail token when a user
  deletes their account" gets a demonstrably wrong answer. CASA Tier 2 also asks for evidence of a
  documented, working deletion path for user data.
- **Fix:**
  1. Migration: `ALTER TABLE public.app_user_connections ADD CONSTRAINT app_user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`
     and delete existing orphans (`DELETE FROM public.app_user_connections c WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id);`).
  2. In `deleteOrganization` (`src/lib/admin.functions.ts:230-248`), before `deleteUser`, fetch the
     token via `getConnectionKeyForUser` and call `revokeGoogleToken` — the DB cascade removes our
     copy but only an explicit revoke drops Google's. Reuse the exact sequence already correct in
     `disconnectGmail` (`src/lib/gmail.functions.ts:106-123`).
  3. Add the same revoke-then-delete to a self-service "delete my account" action (see L9).

---

### HIGH

#### H1 — The Azure transfer is disclosed but not yet *defensible*: default abuse monitoring means 30-day prompt retention and Microsoft human review

- **Where:** `src/lib/azure.server.ts:39-57` (Azure OpenAI provider), `:90-105` (Document
  Intelligence submit), consumed at `src/server/gmail.server.ts:131` and
  `src/lib/deal-ai.functions.ts:133-139`; the claim being made is at
  `src/routes/privacy.tsx:164-192`.
- **What:** Gmail attachment bytes go to Document Intelligence and the extracted text goes to an
  Azure OpenAI deployment. Azure OpenAI's **default** configuration retains prompts and completions
  for up to 30 days for abuse monitoring, and allows authorised Microsoft personnel to review
  content flagged by that system. The privacy policy at `src/routes/privacy.tsx:164-168` asserts
  "No human at Baseerah reads your Google user data" — technically true and technically narrow —
  and at `:188-191` asserts Azure OpenAI "does not use customer data submitted through the service
  to train or improve any Microsoft or third-party models", which *is* true. Neither statement
  addresses the retention-and-human-review question, which is the one Limited Use actually turns on.
- **Why an assessor flags it:** Limited Use restricts *transfers* and human reading of restricted-
  scope data, and it binds service providers, not just the developer. "We send restricted-scope
  mail content to a third-party AI service" is the single highest-risk sentence in this submission.
  The assessor will ask three things: (a) is the transfer necessary to provide the user-facing
  feature; (b) does the processor retain it, and for how long; (c) can any human at that processor
  read it. (a) is a clear yes — you cannot screen a PDF deck without extracting it, and the feature
  is user-initiated and optional (`src/routes/privacy.tsx:94-96` correctly says so). (b) and (c)
  currently have no documented answer.
- **Fix:**
  1. Apply for and obtain Azure OpenAI **modified abuse monitoring / no-data-logging** approval for
     the deployment behind `AZURE_FOUNDRY_ENDPOINT`. Keep the approval letter as an assessment
     artefact — this is the concrete evidence that closes (b) and (c).
  2. Execute and retain the Microsoft DPA / Product Terms as your sub-processor documentation, and
     confirm the Document Intelligence retention posture in writing (the analyze result is
     retrievable via `operation-location` for 24h; input documents are not persisted).
  3. Pin both endpoints to a known region and state that region in the policy. Today the region is
     whatever the operator put in `AZURE_FOUNDRY_ENDPOINT` / `AZURE_DOC_INTELLIGENCE_ENDPOINT` —
     there is no assertion anywhere in the code or docs about where the data lands.
  4. Amend `src/routes/privacy.tsx` — see §3 for the exact wording gaps.

#### H2 — `.env` is committed to the repository, and a live Polar access token is in git history

- **Where:** `.gitignore:38` ignores only `.env.local`; `git ls-files` shows `.env` **tracked**, and
  it currently has uncommitted local modifications staged for the next commit.
- **What:** the `.env` at `HEAD` holds only Supabase URL / project id / publishable key — not
  secrets. But commit `cb65049` ("Add POLAR_SANDBOX_ACCESS_TOKEN to .env file") added a 53-character
  `POLAR_SANDBOX_ACCESS_TOKEN` value, which is still recoverable from history. More importantly,
  the file being tracked at all means the next secret an operator adds locally is one `git commit -a`
  away from being published. `vite.config.ts:40-41` loads `.env` for local development, which is
  exactly the workflow that encourages putting real values there.
- **Why an assessor flags it:** CASA Tier 2 explicitly checks for credentials in source control, and
  the ADA scan/questionnaire asks about secret management. A reviewer who runs `git log -p -- .env`
  and finds a bearer token fails the control regardless of whether it is a sandbox token.
- **Fix:** rotate `POLAR_SANDBOX_ACCESS_TOKEN` in the Polar dashboard. `git rm --cached .env`, add
  `.env` to `.gitignore`, and move the local defaults into `.env.example` (which is already correct
  and secret-free). If the repository is or will be public, purge the blob from history with
  `git filter-repo`. Confirm production values come only from the Vercel environment.

#### H3 — No HTTP security response headers anywhere

- **Where:** nothing in the tree sets them. No `vercel.json`; `src/routes/__root.tsx` sets `<head>`
  meta only; `src/start.ts:28-31` registers only `errorMiddleware` and `csrfMiddleware`;
  `vite.config.ts:74-86` configures nitro with a `maxDuration` and nothing else.
- **What:** the deployed app serves no `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy` or
  `Permissions-Policy`.
- **Why an assessor flags it:** CASA Tier 2's automated scan checks response headers directly, and
  this is one of the most commonly-cited findings in the whole programme. Missing `frame-ancestors`
  is also a clickjacking finding against an app that renders another party's mailbox contents.
  Separately, the privacy policy claims at `src/routes/privacy.tsx:229` that "All traffic is
  encrypted in transit with TLS" — true on Vercel, but without HSTS there is no enforcement.
- **Fix:** add a `vercel.json` `headers` block (or a nitro route rule) applying, at minimum:
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and a CSP with
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, and `connect-src` limited to
  `'self'` plus the Supabase project origin. Start CSP in `Content-Security-Policy-Report-Only` if
  you need to shake out the Vite/React inline-script requirements first, but ship the enforcing
  header before submission.

#### H4 — AES-256-GCM implementation: correct primitives, weak key hygiene

`src/server/connectionKeyCrypto.ts` (28 lines) — reviewed line by line.

**What is right, and I want to be explicit about it:**
- `randomBytes(12)` per encryption at `:14` — a fresh 96-bit IV every time, from the CSPRNG. No
  counter, no reuse, no derivation from the plaintext. This is the single most important property
  of GCM and it is correct.
- Layout `iv(12) || tag(16) || ct` at `:17`, unpacked with matching offsets at `:22-24`. The tag is
  `setAuthTag`'d before `final()` at `:26-27`, so a tampered ciphertext throws rather than
  returning garbage. `src/server/gmail-oauth.test.ts:62` asserts exactly this.
- No custom padding, no ECB, no static IV, no home-rolled MAC.

**What is wrong:**

1. **No key-length validation** (`:7-11`). `Buffer.from(raw, "base64")` silently discards invalid
   base64 characters and truncates. A mis-pasted or truncated `APP_USER_CONNECTION_KEY_SECRET`
   either throws "Invalid key length" at first use — a 500 in production, not at boot — or, if it
   happens to decode to 32 bytes, is accepted as a low-entropy key with no complaint.
   *Fix:* `const k = Buffer.from(raw, "base64"); if (k.length !== 32) throw new Error("APP_USER_CONNECTION_KEY_SECRET must decode to exactly 32 bytes");`
   and call it once at startup so misconfiguration fails loudly and early.
2. **The same secret is the AES key *and* the HMAC key.** `src/server/oauthState.ts:11-15` reads the
   identical env var and feeds it to `createHmac("sha256", …)`. Using one key material for two
   distinct cryptographic purposes is a textbook key-separation violation, and an assessor reviewing
   crypto controls will call it. It also couples the two rotation stories: rotating to fix one
   breaks the other.
   *Fix:* derive two sub-keys with HKDF-SHA256 from the master secret —
   `hkdfSync("sha256", master, salt, "baseerah:connection-key:v1", 32)` and
   `…"baseerah:oauth-state:v1", 32` — and use each for one purpose only. This is backwards-
   compatible if you gate it behind a version prefix (see 4).
3. **The ciphertext is not bound to its row.** GCM supports additional authenticated data and none
   is used. The blob for user A decrypts perfectly if it is written into user B's row. Any path
   that can write `app_user_connections` — a service-role key leak, a future admin tool, an
   injection into a service-role query — becomes a *mailbox takeover*, not just a data leak,
   because B would then scan A's mailbox with A's grant.
   *Fix:* `cipher.setAAD(Buffer.from(\`${userId}:${connectorId}\`))` on both sides and thread the
   two identifiers through `encryptConnectionKey` / `decryptConnectionKey` from
   `src/server/appUserConnections.server.ts:15` and `:34`.
4. **No key version, so rotation is all-or-nothing.** The comment at `:5-6` accepts this ("Rotating
   it invalidates every stored provider token"). Forcing every user to re-consent to a restricted
   scope is an unattractive incident-response option.
   *Fix:* prefix the stored blob with a one-byte version, keep a small map of key versions, decrypt
   with the version in the blob and re-encrypt with the current one on read.

---

### MEDIUM

#### M1 — Plaintext refresh tokens accumulate in an unbounded in-process cache
`src/server/googleOAuth.server.ts:117-136`. `accessTokenCache` is keyed by the **plaintext refresh
token** and entries are never evicted — `:120-121` only skips a stale entry, it does not delete it,
and nothing sweeps the map. On a warm serverless instance this grows without bound and holds every
recently-used user's long-lived Google credential in the heap in cleartext, where it lands in any
crash dump or memory-profiling artefact. `revokeGoogleToken` at `:140` does delete the right entry
on disconnect, so that path is fine. *Fix:* key the map by a SHA-256 hash of the refresh token
rather than the token itself, and evict on read when `expiresAt` has passed plus cap the map size.

#### M2 — `/api/chat` is an authenticated, unmetered, unvalidated proxy to Azure OpenAI
`src/routes/api/chat.ts:30-74`. Authentication is correct and deliberate (`:21-28`, with a good
comment explaining why it cannot use the middleware). But: `body.messages` is checked only with
`Array.isArray` at `:31` and then cast to `UIMessage[]` at `:69` — no zod, no count cap, no length
cap, in contrast to every server function in the codebase. `body.deal` and `body.thesis` are cast
without validation at `:35-36`. There is no request-size limit and no quota check —
`assertAndRecordScreening` runs only in `analyzeDeal` (`src/lib/deal-ai.functions.ts:126-127`), and
the comment there explains the deliberate choice, but the consequence is that any authenticated
account can drive unlimited Azure spend through this route. It is also outside the CSRF middleware,
whose filter is `ctx.handlerType === "serverFn"` (`src/start.ts:25`); that is acceptable in practice
because the route requires an `Authorization` header a cross-site form cannot set, but it should be
a stated decision rather than an accident. *Fix:* add a zod schema for `messages`/`deal`/`thesis`
with element and total-length caps, and meter or rate-limit the route.

#### M3 — `extractDocument` accepts an unbounded upload
`src/lib/deal-ai.functions.ts:231-255`. `dataUrl: z.string()` has no `.max()`. The 15 MB check is
client-side only (`src/routes/_authenticated/deals.new.tsx:80-83`) and therefore not a control. A
crafted request buffers an arbitrarily large base64 string in the function and forwards it to a
billed Azure endpoint. *Fix:* `z.string().max(28_000_000)` (≈20 MB after base64 expansion) and
reject early.

#### M4 — Unauthenticated account enumeration
`src/lib/account-link.functions.ts:22-42`. `checkEmailForSignup` has **no** `requireSupabaseAuth`
middleware — correctly, since it runs pre-signup — and returns `hasAppAccount: true` plus
"An account already exists for this email" for any address, and additionally reveals whether that
address has a Polar subscription and on which plan (`:75-82`). This is a clean oracle over the
entire user base, with no rate limiting. *Fix:* return a uniform response and move the branch
decision behind the email-verification step, or at minimum put a strict per-IP rate limit in front
of it. If the UX genuinely requires the distinction, document the accepted risk for the assessor.

#### M5 — Client-controlled `origin` becomes the Polar checkout success URL
`src/lib/billing.functions.ts:8` (`origin: z.string().url()`) and `:28`
(`successUrl: \`${data.origin}/billing?checkout_id={CHECKOUT_ID}\``). Any URL passes `z.string().url()`,
including `https://attacker.example`. The user is then redirected off-platform after payment, with
the checkout id in the query string. *Fix:* ignore the client value and build the URL from
`process.env.PUBLIC_APP_URL`, exactly as `appOrigin()` already does at
`src/lib/gmail.functions.ts:14-20` — or allow-list against it.

#### M6 — No rate limiting on any endpoint
`grep -ri "ratelimit|throttle" src/` returns nothing. `scanGmailInbox` will drive up to 100 Gmail
reads and 100 Document Intelligence analyses per invocation with no per-account ceiling beyond the
user's own scan-size setting, and it can be re-invoked immediately. Supabase Auth provides its own
limits for the auth endpoints, so the sign-in path is covered; nothing else is. *Fix:* a per-user
token bucket on `scanGmailInbox`, `extractDocument`, `analyzeDeal`, `generateMemo`,
`generatePassEmail` and `/api/chat`. CASA Tier 2 asks about resource-exhaustion controls directly.

#### M7 — The legacy-pipeline migration parks Gmail-derived deck text in `localStorage` forever
`src/lib/store.ts:112-120`. After a successful server-side import, the entire legacy pipeline —
including `deckText` for deals that originated as Gmail attachments — is re-written to
`localStorage` under `screener.migrated.v1` "in case anything went wrong", and never removed. The
three original keys are cleaned up at `:121-123`; the archive copy is not. It survives sign-out,
persists on shared machines, and is not covered by any deletion path or by the privacy policy.
*Fix:* delete the parked copy after the next successful hydration, or drop it entirely — the server
copy is the source of truth by that point.

#### M8 — Known-vulnerable production dependency
`npm audit --omit=dev` reports one **high** advisory: `nanoid < 3.3.18`, GHSA-2v37-7h3g-55p8
(infinite loop with a zero size in custom generators). It is transitive and low practical impact
here, but a Tier 2 scan reports dependency advisories verbatim and you will be asked about it.
*Fix:* `npm audit fix`, then re-run and keep the clean output as evidence.

#### M9 — Third-party response bodies flow unredacted into logs via a global error expander
`src/lib/error-capture.ts:52-63` replaces `console.error` globally so that every `Error` argument is
expanded to message + stack + the entire `cause` chain, 8 000 characters (`:15-16`). The Gmail
helper embeds 400 bytes of raw response body into its error message
(`src/server/gmail.server.ts:42`) and the Azure helpers embed the full response text
(`src/lib/azure.server.ts:109`, `:130`). Today those bodies carry API error JSON, not mail content,
so I did not find an actual content leak — but there is no redaction layer between a third-party
response and the host log, and the failure mode if a provider ever echoes request content back is
silent. *Fix:* cap embedded bodies hard (64 chars) or drop them from the message and log a
correlation id instead; add a redaction pass in `describeError`.

---

### LOW

- **L1 — OAuth `state` has no one-time-use guarantee.** `src/server/oauthState.ts:26-38` verifies
  signature, user binding and a 15-minute TTL, but the nonce at `:22` is never recorded, so the same
  state can be replayed within the window. Impact is small — `completeGmailConnect` still requires
  the same authenticated session (`src/lib/gmail.functions.ts:55`) and Google's authorization code
  is single-use — but a strict reviewer expects single-use state. *Fix:* record consumed nonces in a
  short-lived table or signed cookie.
- **L2 — No PKCE, and `include_granted_scopes=true`.** `src/server/googleOAuth.server.ts:57-58`.
  PKCE is not mandatory for a confidential web client holding a client secret, but Google recommends
  it and assessors ask. `include_granted_scopes=true` means the issued token can carry scopes
  granted earlier to the same client, which works against the "minimum necessary scopes" narrative.
  *Fix:* add PKCE (`code_challenge` S256, verifier carried in the signed state); drop
  `include_granted_scopes` unless you have a specific incremental-auth need.
- **L3 — The granted scope is never verified.** `exchangeGoogleCode`
  (`src/server/googleOAuth.server.ts:94-112`) reads `refresh_token` but ignores `payload.scope`,
  which the `TokenResponse` type already declares at `:67`. If a user unticks `gmail.readonly` on
  the consent screen, the connection is stored and every later scan fails with an opaque error.
  *Fix:* assert `gmail.readonly` is present and fail the connect with a clear message.
- **L4 — `has_role` accepts an arbitrary user id.** Granted to `authenticated`
  (`supabase/migrations/20260804213245_*.sql:2`), `SECURITY DEFINER`, signature
  `has_role(_user_id uuid, _role app_role)`. Any signed-in user can probe whether a given uuid holds
  `developer`. The authorization checks themselves are safe — `assertDeveloper` passes
  `context.userId` from the validated JWT, not from the request body
  (`src/lib/admin.functions.ts:41-47`, `src/lib/webhook-audit.functions.ts:31-37`) — so this is
  disclosure only. *Fix:* add `AND _user_id = auth.uid()` or drop the parameter.
- **L5 — `skipMessageIds` strings are unbounded.** `src/lib/gmail.functions.ts:91` caps the array at
  500 entries but each `z.string()` has no `.max()`. *Fix:* `z.string().max(64)`.
- **L6 — `team_invite_preview` is executable by `anon`.**
  `supabase/migrations/20260809141715_*.sql:8`. It returns the invitee's email address and the
  inviting firm's name for a valid token. Tokens are 24 random bytes
  (`supabase/migrations/20260804220910_*.sql:29`), so they are not enumerable; this is defence in
  depth only. *Fix:* rate-limit, or require authentication.
- **L7 — Privacy policy slightly over-states what is stored.** `src/routes/privacy.tsx:120-122`
  says "the message's subject, sender and identifier are saved". In fact the import at
  `src/components/gmail-scan-dialog.tsx:96-115` stores the subject (as `one_liner`), the message id,
  and a *derived* company name from the sender's display name or domain
  (`src/components/gmail-scan-dialog.tsx:24-27`) — the sender's email address itself is not
  persisted. Over-disclosure is harmless legally, but an assessor comparing the text to the schema
  will note the mismatch and it costs you credibility on the parts that matter.
- **L8 — `profiles.deal_inbox_email`** (`supabase/migrations/20260804104808_*.sql:9`) is a legacy
  column from the pre-OAuth forwarding design, unused by any current code path. Drop it so the
  schema you hand the assessor matches the data-flow diagram.
- **L9 — No in-product account deletion.** `src/routes/privacy.tsx:220-224` directs users to email
  `privacy@baseerah.dev`. That is permissible, but Google's verification form asks how users delete
  their data, and a self-serve button (which, per C1, must revoke the Google grant) is a materially
  stronger answer. The developer-only `deleteOrganization` is not a user-facing path.

---

### INFORMATIONAL — verified correct, no action needed

I want these on the record so the assessment does not re-litigate them.

- **The PostgREST `.or()` escaping is sufficient.** `src/lib/webhook-audit.functions.ts:46-49`
  escapes `\` then `"` and wraps the term in double quotes before interpolating it into the `or=`
  filter at `:78-80`. Inside a PostgREST double-quoted value the structural characters `,` `(` `)`
  and `.` are literal, and only `\` and `"` remain special — both of which are escaped, in the
  correct order (backslash first, so the quote-escape's own backslash is not double-escaped). I
  tried to construct a breakout using `"`, `\`, `,`, `)`, `.` and a trailing lone backslash; none
  escapes the quoted literal. The remaining behaviour is that a user-supplied `%` or `_` acts as an
  `ilike` wildcard — a search-semantics quirk, not an injection, on a developer-only endpoint. The
  input is additionally capped at 120 characters by the validator at `:58`. **This is fixed
  correctly.**
- **Every service-role call site is properly scoped.** I checked all of them for a missing or
  spoofable predicate:
  - `src/lib/seats.functions.ts` — `loadAccount` filters `.eq("owner_id", userId)` at `:56`, `:88`;
    `assignSeat` inserts with `owner_id: context.userId` at `:146`; `updateSeatRole` and
    `removeSeat` both do a **read-back scoped by `.eq("owner_id", context.userId)`** before the
    write (`:165-167`, `:189-192`) *and* repeat the predicate on the write itself (`:175-176`,
    `:200-201`). The client-supplied `id` is a validated uuid and can never reach a row on another
    account. The owner-seat protections at `:169-171` and `:194-196` compare against
    `context.userId`, not against request data.
  - `src/lib/admin.functions.ts` — every mutation is preceded by `assertDeveloper(context)`
    (`:124`, `:160`, `:232`, `:267`, `:326`), which runs `has_role` on the caller's **RLS-bound**
    client with `context.userId` from the JWT. `deleteOrganization` additionally requires a matching
    confirmation email (`:241-244`) and forbids self-deletion (`:232`). `buildOrgs` reads whole
    tables, which is the intended behaviour of a developer console; notably it reads only
    `profiles`, `subscriptions` and `team_members` — **no admin surface exposes `deals`,
    `deal_threads` or any Gmail-derived content**, which is what makes the "no human at Baseerah
    reads your Google user data" claim defensible.
  - `src/lib/webhook-audit.functions.ts` — `assertDeveloper` at `:64`, then a global read of the
    billing audit table. Correct for its purpose.
  - `src/lib/screening-quota.server.ts` — `.eq("user_id", userId)` on the select at `:41`, the
    insert at `:50` and the update at `:77`. `userId` comes from `context.userId` in
    `analyzeDeal` (`src/lib/deal-ai.functions.ts:127`). The design note at `:1-6` is right: the
    meter must not be client-writable, and `subscriptions` grants `SELECT` only to `authenticated`
    (`supabase/migrations/20260804104808_*.sql:28-31`).
  - `src/server/appUserConnections.server.ts` — all four helpers filter on both `user_id` and
    `connector_id` (`:29-30`, `:42-43`, `:54-55`, `:63-64`).
  - `src/lib/account-link.functions.ts:131-134` — `.eq("user_id", context.userId)`.
  - `src/routes/api/public/polar-webhook.ts:252-255` — scoped by `decision.userId`, which comes from
    the **signature-verified** payload (`:174-185`), not from an unauthenticated body.
  **No missing predicate found.**
- **Bearer authentication is implemented once and correctly.**
  `src/integrations/supabase/request-auth.ts:90-111` rejects a missing header, a non-`Bearer`
  scheme, an empty token and a non-three-segment token, then validates via
  `supabase.auth.getClaims(token)` and requires `sub`. Errors are deliberately vague (`:78-84`).
  `clientForToken` (`:61-70`) binds the caller's JWT so PostgREST evaluates RLS as that user, and
  `createSupabaseFetch` (`:19-39`) strips the SDK's default `Authorization` when the publishable key
  is one of the new opaque `sb_publishable_` keys — without that the caller's token would be
  overwritten. Both the middleware path (`auth-middleware.ts:14-19`) and the raw-handler path
  (`src/routes/api/chat.ts:22`) funnel through the same function.
- **RLS coverage is complete and the tenancy model is sound.** Every table in `public` has
  `ENABLE ROW LEVEL SECURITY`. `deals`, `theses` and `deal_threads` are scoped by
  `account_id = public.current_account_id()` for all four verbs
  (`supabase/migrations/20260817120000_deals_multi_tenant.sql:83-92`, `:118-121`, `:146-155`);
  `current_account_id()` (`:14-33`) resolves from `team_members`, is `SECURITY DEFINER` with a
  pinned `search_path`, and is revoked from `anon`/`public` at `:35-36`. `subscriptions` grants
  `SELECT` only. `team_members` writes are server-side only — the permissive `FOR ALL` policy was
  deliberately dropped in `20260805051320_*.sql:9-14`. `app_user_connections` has RLS enabled with
  **no policies at all** and grants only to `service_role`
  (`20260816203744_*.sql:12-13`) — deny-by-default, which is the right shape for a credential table:
  even a leaked publishable key cannot read a ciphertext. There is even an in-migration RLS
  self-test at `20260804112814_*.sql`.
- **Server-only code does not reach the browser — verified, not assumed.**
  `vite.config.ts:63-67` sets `importProtection` to `error` for `**/server/**`. That glob does *not*
  cover `src/lib/*.server.ts`, and `src/lib/deal-ai.functions.ts:4-10` statically imports
  `./azure.server` and `./prompts.server` at module top level from a file that nominally ships to
  the client — unlike every other `.functions.ts`, which uses `await import()` inside the handler.
  I ran the production build and grepped `.vercel/output/static` for `AZURE_FOUNDRY_API_KEY`,
  `AZURE_DOC_INTELLIGENCE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `APP_USER_CONNECTION_KEY_SECRET`, `POLAR_WEBHOOK_SECRET`, `documentintelligence`, `openai.azure`,
  `prebuilt-layout`, `createOpenAICompatible` and `HOUSE_RULES`: **zero hits in every case.** The
  Start compiler strips the handler bodies and tree-shakes the imports. No leak. Still worth
  extending the `importProtection` glob to `**/*.server.ts` so the guarantee is enforced by the
  build rather than by the compiler's current behaviour.
- **CSRF protection is present and deliberately re-registered.** `src/start.ts:24-26`, with the
  comment explaining that defining `src/start.ts` opts out of Start's automatic installation.
- **Token revocation on disconnect is correct.** `src/lib/gmail.functions.ts:106-123` fetches the
  token, calls Google's revoke endpoint, swallows a failure there with a correct comment, and
  deletes the row unconditionally. `revokeGoogleToken` also clears the process cache
  (`src/server/googleOAuth.server.ts:140`). This is the model C1 should copy.
- **zod validators are broadly good.** Every server function except the four noted in M2/M3/M5/L5
  has a `.parse()` validator with explicit `.max()` bounds — `src/lib/deals.functions.ts:116-149`
  bounds every deal field including `deckText` at 400 000 chars;
  `src/lib/onboarding.functions.ts:62-92` uses `.strict()` with a good comment explaining why
  (the parsed object is spread straight into an upsert); `src/lib/admin.functions.ts:146-158` uses
  `z.enum` against the plan/status constants and `z.string().uuid()` for ids.
- **The Polar webhook verifies signatures before trusting anything**
  (`src/routes/api/public/polar-webhook.ts:172-185`), and logs the rejection to the audit table.
- **`src/server/gmail-oauth.test.ts`** already covers state round-trip, cross-user rejection,
  signature tampering, TTL expiry, ciphertext tampering, the authorize URL's scopes, and the
  refresh-token-missing failure. Point the assessor at this file.

---

## 3. Limited Use: is the Azure transfer defensible, and what must the policy say

**Is the transfer defensible?** Yes in principle, and the code supports the argument, but the
paperwork is missing.

The four Limited Use tests, answered against this codebase:

| Test | Answer | Evidence |
|---|---|---|
| Used for advertising? | **No.** No ad SDK, no analytics, no tracking pixel anywhere in the tree. | `grep` across `src/`; `src/lib/client-error-reporting.ts:35` is an unwired optional sink. |
| Sold or transferred for others' purposes? | **No.** The only egress is to Azure, and only to render the feature the user invoked. | `src/server/gmail.server.ts:131`, `src/lib/deal-ai.functions.ts:133`. |
| Read by humans? | **Not by Baseerah staff** — no admin surface reads `deals`/`deal_threads`; `buildOrgs` (`src/lib/admin.functions.ts:60-64`) touches only billing tables. **Unresolved at Microsoft** — see H1. | — |
| Usable to train generalized AI models? | **Not by Baseerah** — nothing writes training data, and the model is a hosted Azure deployment behind `createOpenAICompatible` (`src/lib/azure.server.ts:44-56`) with no fine-tuning path. **Contractually not by Microsoft** either, but you must be able to produce the terms. | `src/lib/azure.server.ts`, `src/lib/deal-ai.functions.ts`. |

The transfer also satisfies the necessity test cleanly, and the code makes that easy to demonstrate:
the mailbox connection is optional and the product works without it
(`src/routes/privacy.tsx:94-96` says so and it is true); the scan is user-initiated; the Gmail
query is narrowly scoped to deck-bearing messages rather than the whole mailbox
(`src/server/gmail.server.ts:22-23`); and a PDF cannot be screened without first being converted to
text. That is a strong necessity argument. **Do not weaken it** by broadening `DEAL_QUERY`.

**One nuance to get ahead of:** extraction happens for *every* scanned candidate at
`src/server/gmail.server.ts:131`, before the user decides whether to import it — not only on import.
So attachments from messages the user never turns into a deal are still transferred to Azure. This
is disclosed (the third-party section at `src/routes/privacy.tsx:182-187` says Document Intelligence
"receives deck attachments, including those downloaded from a connected mailbox"), but an assessor
tracing the flow will notice the timing and ask. Say it plainly rather than being asked.

### What the privacy policy must add to be accurate

The current draft at `src/routes/privacy.tsx` is unusually good — it is written from the code, the
Limited Use paragraph at `:144-156` uses the required affirmative wording with the correct link, and
the scope-by-scope breakdown at `:98-108` matches `GMAIL_SCOPES` exactly. These gaps remain:

1. **Retention at the processors** (H1). Add, to the Azure OpenAI bullet at `:188-191`: how long
   Microsoft retains prompts, and whether abuse-monitoring human review is disabled for this
   deployment. As written the page implies zero retention without saying so.
2. **Reconcile `:164-168` with `:188-191`.** "No human at Baseerah reads your Google user data" is
   true and narrow. State the processor position explicitly rather than leaving it to inference.
3. **Timing of extraction.** Amend `:110-116` to say attachments are extracted during the scan, for
   every matching message, not only for messages you import.
4. **The full storage list.** `:118-123` mentions deck text and message metadata. Add that the
   screening analysis, generated memos, generated pass emails and deal chat transcripts also contain
   Gmail-derived content and are retained for the life of the deal
   (`deals.analysis`, `deals.memo`, `deals.pass_email`, `deal_threads.messages`).
5. **Deletion, once C1 is fixed.** `:220-224` currently promises 30-day account deletion that the
   code does not deliver for the Gmail credential. Fix the code first, then keep the sentence.
6. **Data location.** Name the Azure region(s) once you pin them.
7. **Correct `:120-122`** — the sender's address is not stored (L7).
8. **Drop the "Draft pending legal review" banner at `:53-59`** before submission. An assessor
   reading a policy that disclaims its own authority will treat it as not published.

Also add a link to `/privacy` from the OAuth consent screen configuration and from the app footer if
it is not already there — Google checks that the policy is reachable from the homepage and hosted on
the same domain as the OAuth client.

---

## 4. Verdict and prioritised remediation

**Not ready to submit.**

The architecture is in better shape than most apps at this stage: multi-tenancy is enforced in the
database rather than in application code, every service-role call site is correctly scoped, the
bearer path is centralised, the GCM primitives are used correctly, the recently-added PostgREST
escaping is genuinely sufficient, and the privacy policy was clearly written from the code. What is
missing is the **data-lifecycle and third-party-assurance layer** — which is precisely what a
restricted-scope review is about.

### Blockers — must be done before you submit

1. **C1** — add the `ON DELETE CASCADE` FK to `app_user_connections`, purge existing orphans, and
   revoke the Google grant in `deleteOrganization`. *Half a day. This is the one that fails you.*
2. **H1** — obtain Azure OpenAI modified-abuse-monitoring approval and the Microsoft DPA; pin the
   regions. *Lead time is external — start this first, today.*
3. **H2** — rotate the Polar token, untrack `.env`, purge it from history.
4. **H3** — ship the security headers via `vercel.json`.
5. **§3 items 1-8** — update `src/routes/privacy.tsx`, and remove the draft banner.

### Should be done before you submit

6. **H4** — key-length validation, HKDF separation of the AES and HMAC keys, AAD binding to
   `(user_id, connector_id)`, key-version prefix.
7. **M8** — `npm audit fix`; keep the clean report as evidence.
8. **M1** — hash the cache key and evict expired entries.
9. **M3, M5** — one-line fixes each; no reason to carry them into the review.

### Fix in the same cycle, not necessarily before submission

10. **M2** — validate and meter `/api/chat`.
11. **M6** — per-user rate limits on the Gmail and AI endpoints.
12. **M4** — close the signup enumeration oracle.
13. **M7** — stop parking Gmail-derived deck text in `localStorage`.
14. **M9** — cap and redact third-party response bodies before they reach `console.error`.
15. **L9** — self-service account deletion, wired to the same revoke-then-delete sequence as C1.

### Housekeeping

16. **L1, L2, L3, L5** — OAuth hardening: single-use state, PKCE, scope verification, string bounds.
17. **L4, L6** — tighten `has_role` and `team_invite_preview`.
18. **L7, L8** — policy wording, and drop the unused `profiles.deal_inbox_email` column so the
    schema matches the diagram you hand the assessor.
19. Extend `importProtection` in `vite.config.ts:63-67` from `**/server/**` to also cover
    `**/*.server.ts`, so the (currently correct) client/server split is enforced by the build.
