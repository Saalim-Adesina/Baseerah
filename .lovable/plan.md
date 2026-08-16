# Connect a Gmail account to the deal inbox

Today the inbox is a forwarding address (`deals-xxxx@inbox.baseerah.dev`) that users
have to set up manually in their mail client. This adds a proper "Connect Gmail"
option so each investor links their own Google account and Baseerah pulls decks
straight out of their mailbox.

## What the user gets

1. **Onboarding "Connect your deal inbox" step** gains a primary
   *Connect Gmail* button next to the existing forwarding-address option.
   Forwarding stays as the fallback for non-Gmail users.
2. **Pipeline inbox card** shows connection state: Connected as
   `name@gmail.com`, with *Scan inbox now* and *Disconnect* actions, or a
   Connect button when nothing is linked.
3. **Scanning** reads recent messages that look like deal flow (attachments +
   pitch-style subjects, restricted by a Gmail search query), pulls PDF/PPTX
   attachments, and files each one as a new deal that then runs through the
   existing Azure screening pipeline. Duplicate Gmail message IDs are skipped.
4. Each user connects their own mailbox — nobody sees anyone else's mail.

## Setup required from you

Baseerah must be registered once as a Google OAuth client for the Gmail
App User Connector. I will open the connector setup card; you approve/create the
client, and add
`https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`
as an authorized redirect URI in the Google Cloud console.

## Technical outline

- **Connector**: App User Connector `google_mail`, scopes
  `userinfo.email`, `userinfo.profile`, `gmail.readonly`.
- **Storage**: new `public.app_user_connections` table (user_id, connector_id,
  encrypted connection key, unique per pair), service-role only, RLS on. The
  `lovack_*` key is AES-GCM encrypted with `APP_USER_CONNECTION_KEY_SECRET`.
- **Server helpers**: `src/lib/appUserConnector.ts` (gateway start/exchange/call
  helpers per the TanStack App User Connector pattern), plus
  `src/server/appUserConnections.server.ts` and `connectionKeyCrypto.ts`.
- **Server functions** in `src/lib/gmail.functions.ts`, all behind
  `requireSupabaseAuth`:
  - `startGmailConnect` — begins consent, returns the authorize URL.
  - `finishGmailConnect` — exchanges the one-time code, stores the key.
  - `getGmailStatus` — connected flag + account email.
  - `scanGmailInbox` — lists messages via
    `/gmail/v1/users/me/messages?q=...`, downloads attachments, creates deals.
  - `disconnectGmail` — gateway disconnect + row delete.
- **Callback route**: `src/routes/gmail/callback.tsx` handles the redirect back
  and returns the user to onboarding or pipeline.
- **Deals**: reuse the existing manual-upload path so screening, scoring and
  memos work unchanged; store the Gmail message id on the deal to dedupe.

## Out of scope for this pass

Real-time push (Gmail watch/Pub-Sub) and auto-reply passes from the connected
mailbox — scanning is on demand plus on page load. Both can follow once the
connection is working.
