# Google OAuth Verification — Submission Package

**App:** Baseerah (deal screening for angel investors and VCs)
**Domain:** `baseerah.dev`
**Publishing status target:** External → In production
**Restricted scope requested:** `gmail.readonly`
**Prepared:** 2026-08-22

> **How to read this document.** Everything stated about *our own code* is quoted from the
> repository and is verifiable by opening the cited file. Everything stated about *Google's
> policy, review process, CASA pricing or turnaround time* is a summary written from prior
> experience and is explicitly flagged — those numbers move, and every one of them must be
> re-confirmed against Google's current published documentation before you rely on it in a
> plan or a budget. Where a claim is unverifiable from this repo it says so inline.

---

## 0. What the app actually does with Gmail (the factual basis for everything below)

Reviewers will compare our written justification against observed behaviour, so this section is
the ground truth the rest of the document is built on. All of it comes from four files:

| File | Role |
| --- | --- |
| `src/lib/gmail.functions.ts` | Server functions: `startGmailConnect`, `completeGmailConnect`, `getGmailStatus`, `scanGmailInbox`, `disconnectGmail` |
| `src/server/gmail.server.ts` | `GMAIL_SCOPES`, `DEAL_QUERY`, `scanGmailForDecks`, `gmailProfile` |
| `src/server/googleOAuth.server.ts` | Authorize URL, code exchange, refresh, revoke |
| `src/lib/gmail-scan.ts` | Client-side batching (`SCAN_BATCH_SIZE = 10`) |

**Scopes requested** — `GMAIL_SCOPES` in `src/server/gmail.server.ts:11-15`, verbatim:

```
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/gmail.readonly
```

**The only Gmail search we ever issue** — `DEAL_QUERY` in `src/server/gmail.server.ts:22-23`,
verbatim:

```
has:attachment (filename:pdf OR filename:pptx OR filename:ppt OR filename:docx) newer_than:365d -in:spam -in:trash
```

This string is a module-level constant. It is not templated, not user-editable, and not
concatenated with anything at runtime — `scanGmailForDecks` URL-encodes it and passes it as the
`q` parameter, and there is no other code path that lists messages.

**Gmail REST endpoints called** (the complete set — grep for `gmail<` in `gmail.server.ts`):

1. `GET /gmail/v1/users/me/profile` — once, at connect time, only to read `emailAddress` so the
   UI can show *which* mailbox is connected (`completeGmailConnect` stores it as
   `account_label`; failure is swallowed because the label is cosmetic).
2. `GET /gmail/v1/users/me/messages?maxResults=…&q=<DEAL_QUERY>` — the filtered list.
3. `GET /gmail/v1/users/me/messages/{id}?format=full` — for messages the query returned.
4. `GET /gmail/v1/users/me/messages/{id}/attachments/{attachmentId}` — the attachment body.

There are no `send`, `modify`, `labels`, `drafts`, `settings`, `watch` or `history` calls
anywhere in the codebase.

**Per-message data used** (`scanGmailForDecks`, lines 113-123): `Subject` header, `From` header
(split into name + address), `internalDate`, `snippet`, the first attachment whose filename or
MIME type is supported, and that attachment's decoded bytes. The bytes go to Azure AI Document
Intelligence (`analyzeDocumentLayout`, `src/lib/azure.server.ts`) which returns markdown text.

**Volume ceilings, in code:**

- `MAX_SCAN_MESSAGES = 100` (`gmail.server.ts:19`), enforced again by the Zod validator on
  `scanGmailInbox` (`.max(100)`) and mirrored by a DB check constraint on
  `profiles.gmail_scan_limit`.
- User-selectable scan size: `SCAN_LIMIT_CHOICES = [50, 75, 100]`, default `50`
  (`src/lib/settings.functions.ts:12-13`).
- Client walks the mailbox in batches of `SCAN_BATCH_SIZE = 10` and passes `skipMessageIds`
  forward so already-imported messages are never re-read (`src/lib/gmail-scan.ts`).

**Storage and deletion:**

- The refresh token is encrypted with `aes-256-gcm` before it is written
  (`src/server/connectionKeyCrypto.ts:15`). Access tokens are held in a process-local `Map`
  only (`googleOAuth.server.ts`), never persisted.
- Message content is **not** stored unless the user clicks *Import* on a specific candidate, at
  which point the extracted deck text, subject, sender and message id become a deal row
  (`gmail-scan-dialog.tsx` → `createDeal`).
- `disconnectGmail` calls `https://oauth2.googleapis.com/revoke` and then deletes the stored
  row (`gmail.functions.ts:106-123`).

**OAuth parameters we send** (`googleAuthorizeUrl`, `googleOAuth.server.ts`):
`response_type=code`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`,
plus a signed `state` (HMAC-SHA256 over user id + timestamp + nonce, 15-minute TTL,
`src/server/oauthState.ts`).

**Redirect URI path:** `/oauth/gmail/return` — the constant `GMAIL_RETURN_PATH` in
`src/lib/gmail.functions.ts:7`, handled by `src/routes/oauth.gmail.return.tsx`. Google matches
this byte for byte, so the production value must be exactly:

```
https://baseerah.dev/oauth/gmail/return
```

---

## 1. Scope justification

Write these into the consent screen's per-scope justification boxes. Keep the wording close to
this — every claim here is checkable against the code, which is what a reviewer does.

### 1.1 `https://www.googleapis.com/auth/gmail.readonly` (RESTRICTED)

**What the feature is.** Angel investors receive pitch decks as email attachments. Baseerah's
core function is to read those decks, extract their text, score them against the investor's
written thesis, and present a ranked pipeline. Without access to the attachment *bodies* there
is no product.

**Why this scope is necessary.** The feature requires two things from Gmail that only
`gmail.readonly` provides:

1. **The attachment payload itself.** `scanGmailForDecks` calls
   `GET /gmail/v1/users/me/messages/{id}/attachments/{attachmentId}` and base64-decodes the
   result into a PDF/PPTX/PPT/DOCX byte stream, which is then run through document layout
   analysis to recover the deck's text, headings and tables. This is the entire value of the
   product: a deck's contents — team, traction, round size, unit economics — exist only inside
   the file.
2. **A server-side search over the mailbox.** The `q` parameter with `DEAL_QUERY` is what keeps
   the integration cheap and narrow. Google performs the filtering; we never enumerate the
   mailbox ourselves.

**Why narrower alternatives do not work:**

| Candidate scope | Why it is insufficient |
| --- | --- |
| `https://www.googleapis.com/auth/gmail.metadata` | This scope returns headers, labels and thread structure **only**. It cannot return `payload.body.data`, and the `messages.attachments.get` endpoint is not available under it — so the PDF/PPTX/DOCX bytes are unreachable. It also does not permit the `q` search parameter, so we could not even apply `DEAL_QUERY` server-side. Under this scope Baseerah would know a message has an attachment called `deck.pdf` and nothing whatsoever about what is in it. The product would return zero screened deals. |
| `https://www.googleapis.com/auth/gmail.addons.current.message.readonly` | This scope only grants access to the single message a **Google Workspace Add-on** is currently open on, inside the Gmail UI, for the duration of that interaction. Baseerah is not a Workspace Add-on; it is a standalone web application that runs an asynchronous, batched scan across up to 100 recent messages from its own backend, including when the user is not looking at Gmail. There is no "current message" context for this scope to resolve against. |
| `https://www.googleapis.com/auth/gmail.modify` / `gmail.compose` / `mail.google.com` | All *wider* than what we need. We never write, label, archive, send or delete. `readonly` is the narrowest scope in the Gmail family that satisfies the requirement, and choosing it over `modify` is itself an application of minimum necessary access. |
| Ask the user to forward decks to us instead | This was the previous design and it was removed (see `MIGRATION.md`). It requires the investor to manually forward or configure auto-forwarding for every inbound deck, which defeats the purpose for a user receiving hundreds a month, and it results in us receiving *more* mail data, not less, with no filtering. |
| Ask the user to upload each deck by hand | Supported today and still available (`/deals/new`). It is not a substitute: the entire premise of the product is triaging inbound volume the investor has no time to handle manually. Gmail connection is strictly optional — the app is fully usable without it (stated in the privacy policy and true in the code: every Gmail entry point is gated on `getGmailStatus().connected`). |

**Minimum necessary access — the argument to make explicitly.** Holding `gmail.readonly` is not
the same as reading the mailbox. Our access is bounded four ways, all in code:

- **By query.** Every list call carries
  `has:attachment (filename:pdf OR filename:pptx OR filename:ppt OR filename:docx) newer_than:365d -in:spam -in:trash`.
  A message with no attachment is never returned to us. A message whose attachments are all
  images, spreadsheets or archives is never returned to us. Anything older than 365 days is
  never returned to us. Spam and trash are excluded.
- **By count.** Hard ceiling of `MAX_SCAN_MESSAGES = 100` per scan, enforced in three places
  (constant, Zod validator, DB check constraint). The user picks 50 / 75 / 100 in Settings;
  the default is 50.
- **By trigger.** Scans are user-initiated only. There is no cron job, no `users.watch`
  subscription, no Pub/Sub push, no background polling. `scanGmailInbox` runs only in response
  to the user opening the scan dialog or pressing *Scan again*.
- **By retention.** Scan results live in browser state. Nothing is written to our database
  until the user presses *Import* on a specific candidate.

**Body text.** We do read `snippet` and message headers for matching messages, to label the
candidate in the UI (sender, subject, date, filename). We do not read, store or process the
message body of non-matching mail, because non-matching mail is never returned to us.

### 1.2 `https://www.googleapis.com/auth/userinfo.email` (sensitive)

**Necessary because** the user must be able to see and trust *which* mailbox is connected. A user
with a personal Gmail and a fund Gmail needs to know which one Baseerah is scanning before they
let it read anything. `completeGmailConnect` reads the address and stores it as the connection's
`account_label`; `GmailConnectionPanel` renders it in monospace next to the *Disconnect* button,
and the pipeline header shows it too.

**Why nothing narrower works:** there is no narrower way to learn the connected address. Note
that in our implementation the address actually comes back from
`GET /gmail/v1/users/me/profile`, which `gmail.readonly` alone would cover — so if the reviewer
pushes back on `userinfo.email`, we can drop it without losing functionality. It is requested
because it is the correct, purpose-declared scope for identity, rather than harvesting identity
out of a Gmail data scope. Flag this as a fallback position, not as a fight worth having.

### 1.3 `https://www.googleapis.com/auth/userinfo.profile` (sensitive)

**Necessary because** Baseerah also offers Google as a sign-in method (Supabase Auth,
`supabase.auth.signInWithOAuth({ provider: "google" })` in `src/routes/auth.tsx:128-129`), where
the display name and avatar populate the account UI. For the Gmail connection path specifically,
profile data is not load-bearing.

**Honest position:** this is the weakest of the three requests. If the reviewer challenges it,
the correct answer is to remove it from `GMAIL_SCOPES` rather than to argue — the Gmail feature
does not consume any field it provides. Decide before submitting whether the sign-in path
genuinely needs it, because a scope you cannot defend in one sentence slows down the whole
review.

> **Action before submitting:** re-read `GMAIL_SCOPES` at submission time and make sure the
> consent screen's scope list matches it exactly. A mismatch between declared scopes and
> requested scopes is one of the most common rejection reasons.

---

## 2. Demo video script

Google requires an **unlisted (not private) YouTube video** demonstrating the real OAuth flow
for every restricted and sensitive scope. Verify the current requirements against Google's own
OAuth verification documentation before recording — the specifics below reflect what the review
process has historically demanded, and I cannot verify them from this repository.

### 2.1 Hard requirements to satisfy on camera

- The video shows the **production application on the verified domain** (`https://baseerah.dev`).
  **Localhost, `127.0.0.1`, a Vercel preview URL, or `test.baseerah.dev` will get the submission
  bounced.** This is the single most common cause of a re-record.
- The **OAuth client ID must be legible in the URL bar** on the consent screen. Google states
  this explicitly. Practically: when the browser is sitting on
  `accounts.google.com/o/oauth2/v2/auth?...`, the `client_id=` parameter must be readable. Since
  our authorize URL is long, click into the address bar so the full URL expands, and either zoom
  the browser to ~150% or record at 1080p+ so it is not a smear of pixels.
- The consent screen must be shown **in full**, including the app name, the scope descriptions
  Google renders, and the "unverified app" interstitial if it appears while still in Testing.
- English narration or English subtitles.
- Unlisted, and left unlisted for as long as the app is in production. Do not delete it after
  approval.

### 2.2 Recording setup

- Clean browser profile, no extensions in the toolbar, no other tabs, no bookmarks bar with
  personal links.
- A Google test account whose mailbox contains **3-5 real-looking pitch deck emails** with PDF
  and PPTX attachments dated within the last 365 days — otherwise `DEAL_QUERY` returns nothing
  and the video shows an empty dialog.
- Settings scan size left at the default 50 so the on-screen copy matches the docs.
- Screen recording at 1080p minimum, cursor visible, no cuts across the OAuth handoff (the
  redirect must be continuous and unedited — a cut there reads as a fabricated flow).

### 2.3 Shot list

**Shot 1 — Identify the app (0:00-0:15)**
URL bar: `https://baseerah.dev/`
Landing page visible with the heading "Screen your deal inbox instead of drowning in it."
Narration: *"This is Baseerah, at baseerah.dev. It screens inbound pitch decks for angel
investors. I'll show the Gmail connection this verification request is about."*

**Shot 2 — Privacy policy (0:15-0:35)**
Click the footer *Privacy* link → URL bar reads `https://baseerah.dev/privacy`.
Scroll slowly to the **"Google user data"** and **"Limited Use"** sections so the Limited Use
paragraph is legible on screen for at least three seconds.
Narration: *"Our privacy policy is hosted on the same domain and states our Limited Use
commitment for Google user data."*

**Shot 3 — Sign in (0:35-0:50)**
URL bar: `https://baseerah.dev/auth`. Sign in with email + password (**not** Google sign-in —
using Google sign-in here muddles two different OAuth flows in one video and invites confusion
about which client is being reviewed).
Land on `https://baseerah.dev/pipeline`.

**Shot 4 — Where the connection starts (0:50-1:05)**
URL bar: `https://baseerah.dev/settings`.
Show the "Deal inbox" panel in its disconnected state, including the on-screen copy: *"Connect
the mailbox your deals arrive in. Baseerah reads recent messages with deck attachments and turns
them into scored deals."*
Narration: *"Connecting Gmail is optional. The app works without it — this is the only place it
is offered."*

**Shot 5 — Click Connect Gmail (1:05-1:15)**
Click the **Connect Gmail** button. Do not cut. The button calls `startGmailConnect`, which
returns the authorize URL, and `window.location.href` sends the browser to Google.

**Shot 6 — The consent URL, client ID visible (1:15-1:40) — CRITICAL SHOT**
Browser is now on `accounts.google.com`. Click into the address bar so the full URL expands and
pause. The URL must show:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=<YOUR-CLIENT-ID>.apps.googleusercontent.com
  &redirect_uri=https%3A%2F%2Fbaseerah.dev%2Foauth%2Fgmail%2Freturn
  &response_type=code
  &scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly
  &state=<signed-state>
  &access_type=offline
  &prompt=consent
  &include_granted_scopes=true
```

(Real URL is a single line; the parameters are exactly those set in `googleAuthorizeUrl`.)
Narration: *"The OAuth client ID is visible here, along with the redirect URI on our verified
domain and the three scopes we request."*
Zoom or highlight the `client_id` value. Hold for 3+ seconds.

**Shot 7 — Account chooser and consent (1:40-2:20)**
Pick the test account. If the app is still in Testing, the "Google hasn't verified this app"
interstitial appears — **show it, do not edit it out**, click *Advanced* → *Go to Baseerah
(unsafe)* and narrate: *"This warning appears because the app is still unverified, which is what
this submission is to resolve."*
Then the consent screen itself. Show, without cutting:
- The app name and logo as Google renders them.
- The line "Read, compose, send and permanently delete all your email from Gmail" — this is
  Google's own rendering, **not** what we can do. Narrate over it: *"Google shows its standard
  description for the Gmail read-only scope. Baseerah requests `gmail.readonly` only; we have no
  write, send or delete access."*
- Scroll to show *all three* scope checkboxes / rows.
Click **Continue / Allow**.

**Shot 8 — The redirect back (2:20-2:35)**
Browser lands on `https://baseerah.dev/oauth/gmail/return?state=…&code=…` (visible in the URL
bar for a moment), showing "Finishing the Gmail connection…", then the route calls
`completeGmailConnect` and navigates with `replace: true` to `https://baseerah.dev/pipeline`.
A toast appears: **"Gmail connected as <address>"**.
Narration: *"Google redirects to `/oauth/gmail/return`, the registered redirect URI on our
verified domain. We exchange the code server-side and store the refresh token encrypted."*

**Shot 9 — Connection state (2:35-2:50)**
Back to `https://baseerah.dev/settings`. Show the connected panel: the mailbox address in
monospace, the "Connected" badge, and the copy *"Baseerah reads deck attachments from this
mailbox. Read-only — nothing is sent, deleted or modified."*
Also show the "Messages per scan" selector at 50.

**Shot 10 — The scope in use (2:50-3:40) — the "why we need it" shot**
Go to `https://baseerah.dev/pipeline`, click **Scan inbox**. The dialog opens and runs
`scanInBatches`. On camera:
- Progress line: *"Scanned N of up to 50 messages"*.
- Candidates appearing with company name, subject, and `filename · sender` in monospace.
Narration, spoken over the running scan: *"Every scan is filtered by one fixed Gmail query —
messages that have an attachment, where the attachment is a PDF, PPTX, PPT or DOCX, from the
last 365 days, excluding spam and trash. Nothing else is returned to us."*

**Shot 11 — Attachment body is the payload (3:40-4:10) — the metadata-is-not-enough shot**
Click **Import** on one candidate. It moves to the pipeline. Open that deal at
`https://baseerah.dev/deals/<id>` and scroll to the extracted deck text and the score.
Narration: *"This is the reason `gmail.readonly` is required rather than the metadata scope. The
team, traction and round details shown here were extracted from the attachment's contents.
Metadata access returns only headers and would produce none of this."*
Let the extracted text sit on screen for several seconds — this single shot is the strongest
argument in the whole submission.

**Shot 12 — Revocation (4:10-4:35)**
Return to `https://baseerah.dev/settings`, click **Disconnect**. Toast: "Gmail disconnected",
panel returns to the disconnected state.
Then open a new tab to `https://myaccount.google.com/permissions` and show Baseerah is gone from
the list.
Narration: *"Disconnecting revokes the token with Google and deletes our stored copy. Users can
also revoke directly from their Google account."*

**Shot 13 — Close (4:35-4:45)**
Back to the pipeline, showing the imported deal still present.
Narration: *"Imported deals stay in the user's account until they delete them; no other mailbox
data is retained. That is the full extent of Baseerah's use of Google user data."*

Target length: 4-5 minutes. Do not pad it.

---

## 3. Consent screen configuration checklist

Google Cloud Console → APIs & Services → OAuth consent screen / Branding.

| Field | Required value | Status | Blocker? |
| --- | --- | --- | --- |
| User type | **External** | Set to External; currently in **Testing** | Yes — must be published to Production as part of submission |
| App name | `Baseerah` — must match the name users see in the app and on the site | Not verifiable from repo | **Yes.** A mismatch between the consent screen name and the site is an automatic rejection |
| User support email | A monitored address on `baseerah.dev` (e.g. `support@baseerah.dev`). Must be the developer's address or a Google group they own | Not verifiable from repo | **Yes.** Must actually receive mail — Google emails it during review |
| App logo | 120×120 px, PNG/JPG/BMP, ≤1 MB, square, no rounded corners baked in, no copyrighted or third-party marks. Uploading a logo **triggers brand verification** in addition to scope verification | **Not done** — `public/` contains only `favicon.ico` (26 KB) and `robots.txt`. No 120×120 PNG exists anywhere in the repo | **Yes.** Confirm the exact dimension/format constraints in the Console's own uploader at submission time, since Google has changed them before |
| Application home page | `https://baseerah.dev/` | Live, HTTP 200 | No |
| Application privacy policy link | `https://baseerah.dev/privacy` | **Route exists in source** (`src/routes/privacy.tsx`, with a "Google user data" section and an explicit Limited Use statement) but **returns 404 on the live site** — the deployed build predates it | **Yes.** Must be publicly reachable, on the authorized domain, before submitting |
| Application terms of service link | `https://baseerah.dev/terms` | Same: `src/routes/terms.tsx` exists in source, **404 live** | Not strictly required by Google, but expected and trivially fixed by the same deploy |
| Privacy policy linked from the homepage | Google's reviewers look for a visible link on the home page | **Not done.** `grep` for `to="/privacy"` finds links only inside `privacy.tsx` and `terms.tsx` — nothing in `__root.tsx` or `index.tsx` links to them, so there is no footer link on the landing page | **Yes.** Cheap fix, common rejection reason |
| Authorized domains | `baseerah.dev` | Must be listed; the entry is only accepted once the domain is verified in Search Console under the same Google account | **Yes** — see §4 |
| Developer contact information | At least one email address; this is where all verification correspondence goes | Not verifiable from repo | **Yes.** Use an address that is checked daily; the review thread is email-only and stalls if unanswered |
| Scopes | Exactly the three in `GMAIL_SCOPES`, no more | Must be added on the Data Access / Scopes screen with per-scope justifications from §1 | **Yes** |
| Test users | Irrelevant once published to Production, but keep the reviewer's needs in mind while still in Testing | — | No |

**Other console items that are not on the consent screen but block the flow:**

- **Gmail API enabled** — APIs & Services → Library → Gmail API. Without it every call 403s.
- **Authorized redirect URI** on the OAuth client must be exactly
  `https://baseerah.dev/oauth/gmail/return`. Google matches byte for byte; a trailing slash
  breaks it. Add `https://test.baseerah.dev/oauth/gmail/return` too once staging exists, and
  keep the localhost entry for development.
- **Authorized JavaScript origins** — `https://baseerah.dev`.
- **`PUBLIC_APP_URL`** in the production environment must be `https://baseerah.dev`, because
  `redirectUri()` in `src/lib/gmail.functions.ts:22-24` builds the redirect from it. Note:
  `.env.local` currently sets `PUBLIC_APP_URL=https://test.baseerah.dev`, and that host does not
  resolve (see §4) — so the redirect URI the app would send today points at a non-existent
  origin. Fix before recording the video.

---

## 4. Domain ownership verification

Google will only accept `baseerah.dev` as an authorized domain if the **same Google account that
owns the Cloud project** has verified it in Google Search Console.

### 4.1 Current DNS state — corrections to the brief

Two assumptions in the task brief do not match what the DNS actually says. Both were checked on
2026-08-22 against the local resolver, Google's DoH resolver (`dns.google`) and Cloudflare's
(`cloudflare-dns.com`), with agreement across all three.

**(a) A `google-site-verification` TXT record already exists.** The brief states there is none.
There is:

```
baseerah.dev.  TXT  "google-site-verification=OIgkA7PJClRXfvYQkKfS51wu9U2TSKlKGR-4PCqm47s"
```

This is the *only* TXT record on the apex. So the open question is not "add the record" but
**"which Google account does this token belong to?"** A verification token proves ownership to
whichever account generated it — most likely the Google Workspace admin account for the domain,
possibly created during Workspace setup rather than for this Cloud project. Action:

1. Sign in to Search Console **as the account that owns the Google Cloud project** and check
   whether `baseerah.dev` appears as a verified property.
2. If it does — done, nothing to change.
3. If it does not, either (a) add the Cloud project's account as an owner/user of the existing
   Search Console property, which is the cleaner path, or (b) generate a second
   `google-site-verification` token for that account and add it as an **additional** TXT record.
   Multiple `google-site-verification` TXT records on the same name are valid and independent —
   **do not overwrite the existing one**; doing so may unverify Workspace or Search Console for
   the current owner.

**(b) DNS is not hosted at Cloudflare.** The authoritative nameservers are Name.com:

```
baseerah.dev.  NS  ns1hwy.name.com. / ns2fln.name.com. / ns3fqs.name.com. / ns4jnz.name.com.
```

Cloudflare *is* in the path — `https://baseerah.dev/` responds with `Server: cloudflare` and a
`__cf_bm` cookie — but as an edge in front of the origin, not as the authoritative DNS provider.
So **the TXT record is edited in the Name.com DNS panel, not the Cloudflare dashboard.** If you
open Cloudflare expecting to find the zone, you will not find it.

**(c) `test.baseerah.dev` does not exist.** `dns.google` returns `Status: 3` (NXDOMAIN) with an
SOA in the authority section. Consistent with "staging not yet deployed" — noted so nobody
registers it as a redirect URI expecting it to work.

**(d) The live site is a stale build.** `https://baseerah.dev/` serves 200, but `/privacy`,
`/terms`, `/settings` and `/oauth/gmail/return` all return **404**. The deployment predates the
entire Gmail OAuth feature and the policy pages. **This is the largest blocker in this document:
the demo video must show the production app on the verified domain, and the production app
currently does not contain the feature being verified.** Deploy before recording.

### 4.2 Steps (if a new token is needed for the project's account)

1. Sign in to <https://search.google.com/search-console> as the Google account that owns the
   Cloud project.
2. *Add property* → **Domain** (not URL prefix — the Domain property is the one that uses DNS
   TXT and covers all subdomains including `test.baseerah.dev`).
3. Enter `baseerah.dev`. Search Console shows a token of the form
   `google-site-verification=<token>`.
4. In **Name.com** → Domains → `baseerah.dev` → DNS Records: add a record of type `TXT`, host
   `@` (or blank, for the apex), value `google-site-verification=<token>`, TTL 300 for a fast
   first check. Leave the existing token record in place.
5. Wait for propagation. Confirm from a shell before clicking Verify:
   ```sh
   curl -s -H "accept: application/dns-json" \
     "https://dns.google/resolve?name=baseerah.dev&type=TXT" | grep -o 'google-site-verification=[^"]*'
   ```
   Expect both tokens to be listed.
6. Click **Verify** in Search Console.
7. Google Cloud Console → OAuth consent screen → Authorized domains → add `baseerah.dev`. It
   will be rejected until step 6 succeeds.
8. Raise the TTL back to something normal afterwards, and never delete either TXT record —
   Google re-checks periodically and removal silently unverifies the domain.

---

## 5. CASA Tier 2

### 5.1 What triggers it

Requesting a **restricted** scope — `gmail.readonly` is one — commits the app to Google's
additional security assessment on top of the normal OAuth verification. The assessment is run
under the **App Defense Alliance** (<https://appdefensealliance.dev>), which took over the CASA
program from Google. "CASA" is Cloud Application Security Assessment; it is built on the OWASP
Application Security Verification Standard (ASVS).

**Tier 2** is the self-scan-plus-lab-validation tier that has typically applied to web
applications handling restricted scopes: the developer runs an approved static/dynamic scan of
the application, submits the results and a remediation record to an **authorized lab**, and the
lab reviews the evidence and issues a **Letter of Validation (LoV)** to Google. Higher tiers
involve a full independent penetration test; lower tiers are self-attestation only for the
lowest-risk cases.

> I cannot verify the current tier definitions, the current tier assignment rules, or which
> tier Google will actually assign to this app from anything in this repository. Confirm on
> appdefensealliance.dev and in the Cloud Console's own verification workflow — Google assigns
> the tier, you do not choose it.

### 5.2 Sequence

1. Submit for OAuth verification in the Cloud Console. Google reviews scopes, branding, the
   video and the privacy policy first.
2. If the scope justification is accepted, Google emails a requirement to complete the security
   assessment and points at the App Defense Alliance.
3. Choose an **authorized lab** from the list published on appdefensealliance.dev. You contract
   with the lab directly; Google is not a party to it and does not pay for it.
4. Run the required scan against the application. Practically this means giving the lab a
   working, credentialed test environment — a reachable deployment with a test account that can
   exercise the Gmail flow end to end. For us that is `test.baseerah.dev`, **which does not
   exist yet** (§4). Standing that up is on the critical path.
5. Remediate every finding at or above the severity floor the lab applies, and evidence the
   fixes.
6. Lab issues the Letter of Validation to Google.
7. Google completes verification and the app can be published to Production without the
   unverified-app interstitial.

### 5.3 Cost and timeline

> **Read this as an order-of-magnitude planning input, not a quote.** These figures come from
> general familiarity with the program, not from anything in this repository, and lab pricing
> is negotiated per engagement. Get written quotes from two or three authorized labs before
> committing to any number in a plan or a budget, and confirm the current process on
> appdefensealliance.dev.

- **Cost:** Tier 2 engagements have commonly been quoted in the **low four figures USD**, with
  the range varying substantially by lab, by application complexity, and by how many findings
  need re-validation. Some labs have offered lower-cost paths for small applications. Treat
  anything under $1,000 or over $10,000 as worth questioning rather than assuming.
- **Timeline, honestly:** **weeks to months, end to end.** The OAuth review itself has often
  taken several weeks with multiple email rounds, each round costing days of latency because
  correspondence is asynchronous and a single unclear answer restarts the clock. The CASA
  assessment adds its own scan, remediation and validation cycle. A realistic planning
  assumption is **4-8 weeks if everything is clean on the first pass, and 3-6 months if the
  scope justification is challenged, the video needs re-recording, or the scan surfaces
  findings that need real code changes.** Do not plan a launch date that depends on this
  finishing quickly.
- **Do not start the CASA engagement before the OAuth review accepts the scope.** If Google
  pushes back and you end up dropping or narrowing a scope, you may have paid for an assessment
  you no longer need.

### 5.4 Annual renewal

Verification is **not permanent**. The security assessment must be **re-done annually** to keep
restricted-scope access, and the recurring cost recurs with it. Google also re-reviews when the
app materially changes — new scopes, a new OAuth client, a changed privacy policy, or a
significant change in how user data is handled. Budget for this as an annual line item, not a
one-off, and put a calendar reminder ~10 months out so the renewal is not discovered by an
outage. Confirm the exact renewal cadence in Google's current documentation.

---

## 6. Pre-submission checklist

Status is what I could verify from the repository and from live DNS/HTTP checks on 2026-08-22.
"Cannot verify" means the answer lives in the Google Cloud Console or a person's inbox, not in
this codebase — someone must check those by hand.

### Code and product

- [x] **Only the three declared scopes are requested.** `GMAIL_SCOPES` contains exactly
      `userinfo.email`, `userinfo.profile`, `gmail.readonly`.
- [x] **No write access anywhere.** No `send`, `modify`, `labels`, `drafts`, `settings`,
      `watch` or `history` calls in the codebase.
- [x] **A single, fixed, narrowing search query.** `DEAL_QUERY` is a module constant, not
      user-editable, and is the only `q` we ever send.
- [x] **Volume is bounded.** `MAX_SCAN_MESSAGES = 100`, enforced by constant + Zod validator +
      DB check constraint; user-selectable 50/75/100.
- [x] **Scans are user-initiated only.** No cron, no Pub/Sub, no background polling.
- [x] **Refresh tokens encrypted at rest.** `aes-256-gcm` in `connectionKeyCrypto.ts`. Access
      tokens are in-process only.
- [x] **Disconnect actually revokes.** `disconnectGmail` calls Google's revoke endpoint before
      deleting the row.
- [x] **OAuth state is signed and time-limited.** HMAC-SHA256, 15-minute TTL, user-id bound.
- [x] **Gmail is optional.** Every entry point is gated on connection status; manual deal entry
      works without it.
- [x] **Privacy policy content is written and correct.** `src/routes/privacy.tsx` has a "Google
      user data" section describing the real query and real data flow, plus an affirmative
      Limited Use statement referencing the Google API Services User Data Policy.
- [ ] **Homepage links to the privacy policy.** Not done — no link to `/privacy` or `/terms`
      exists outside those two pages themselves. Add a footer link in `__root.tsx`.
- [ ] **Decide the fate of `userinfo.profile`.** Keep it only if Google sign-in genuinely needs
      it; otherwise remove it from `GMAIL_SCOPES` before submitting (§1.3).

### Deployment

- [ ] **Production build on `baseerah.dev` contains the Gmail feature.** **Not done — this is
      the top blocker.** `/settings`, `/privacy`, `/terms` and `/oauth/gmail/return` all return
      404 on the live site. The demo video cannot be recorded until this ships.
- [ ] **`PUBLIC_APP_URL=https://baseerah.dev` in the production environment.** Not done —
      `.env.local` currently points at `https://test.baseerah.dev`, which does not resolve.
- [ ] **`test.baseerah.dev` exists and is deployed.** Not done — NXDOMAIN. Needed for the CASA
      lab's credentialed scan (§5.2 step 4).
- [x] **`https://baseerah.dev/` is live over HTTPS with HSTS.** 200, `Strict-Transport-Security:
      max-age=31536000; includeSubDomains`.
- [ ] **A test Google account with 3-5 realistic deck emails** matching `DEAL_QUERY`
      (PDF/PPTX attachments, within 365 days, not in spam). Cannot verify — set up by hand.

### Domain

- [x] **A `google-site-verification` TXT record exists** on `baseerah.dev`
      (`…=OIgkA7PJClRXfvYQkKfS51wu9U2TSKlKGR-4PCqm47s`), confirmed on three resolvers.
- [ ] **That verification belongs to the Cloud project's Google account.** Cannot verify from
      DNS — the token is opaque. Check Search Console while signed in as the project owner (§4.1).
- [ ] **`baseerah.dev` added under Authorized domains** in the consent screen. Cannot verify.
- [x] **Know where DNS is edited:** Name.com, not Cloudflare.

### Google Cloud Console

- [ ] **Gmail API enabled** on the project. Cannot verify.
- [ ] **Authorized redirect URI is exactly `https://baseerah.dev/oauth/gmail/return`.** Cannot
      verify.
- [ ] **Authorized JavaScript origin `https://baseerah.dev`.** Cannot verify.
- [ ] **App name matches the site** (`Baseerah`). Cannot verify.
- [ ] **120×120 logo uploaded.** Not done — no such asset exists in the repo (`public/` has only
      `favicon.ico` and `robots.txt`). Confirm current size/format rules in the Console uploader.
- [ ] **User support email set and monitored.** Cannot verify.
- [ ] **Developer contact email set and monitored daily.** Cannot verify — review correspondence
      is email-only and stalls without prompt replies.
- [ ] **Per-scope justifications entered** from §1. Cannot verify.
- [ ] **Consent screen scope list matches `GMAIL_SCOPES` exactly.** Cannot verify.

### Video

- [ ] **Recorded against `https://baseerah.dev`**, not localhost, not a preview URL. Blocked on
      the deployment item above.
- [ ] **`client_id` legible in the consent URL.** Google requires it explicitly.
- [ ] **Consent screen shown in full**, including the unverified-app interstitial and all three
      scopes.
- [ ] **Attachment-extraction shot included** (§2.3 Shot 11) — the strongest evidence that
      metadata scope is insufficient.
- [ ] **Uploaded as unlisted**, English narration or subtitles, link ready to paste.
- [ ] **Left unlisted permanently** after approval.

### CASA

- [ ] **Do not engage a lab until the scope justification is accepted** (§5.3).
- [ ] Quotes from 2-3 authorized labs on appdefensealliance.dev.
- [ ] Credentialed test environment ready for the lab.
- [ ] Annual renewal reminder set ~10 months after approval.

---

## 7. Most likely rejection reasons, ranked

1. **Demo video shows a non-production URL, or the production site lacks the feature.** Ours
   currently would — the live build 404s on `/settings`. Fix first.
2. **Privacy policy not reachable at the URL given, or not on the authorized domain.** Ours is
   404 live despite being written. Fix with the same deploy.
3. **`client_id` not legible in the consent URL in the video.** Re-record, weeks lost.
4. **Scope justification that describes the feature but not why narrower scopes fail.** §1.1
   addresses this head-on; keep the metadata-scope comparison in the submitted text.
5. **A scope requested that the demo never exercises** — `userinfo.profile` is our exposure.
6. **Consent screen app name / logo / support email inconsistent with the site.**
7. **Slow replies to the review thread.** Each unanswered email adds days.
