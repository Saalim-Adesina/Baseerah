# Agent notes

This project is self-hosted: own Supabase project, own Google OAuth client,
Azure AI Foundry for models, Vercel for hosting. It is no longer connected to
Lovable — do not re-add `@lovable.dev/*` packages, the AI gateway, or the
connector gateway.

- Backend: Supabase (`supabase/migrations/` is the source of truth for schema).
- Auth: Supabase Auth. Google provider and SMTP are configured in the Supabase
  dashboard, not in code.
- AI: Azure AI Foundry (`src/lib/azure.server.ts`). Document extraction via
  Azure AI Document Intelligence.
- Gmail: own Google OAuth client (`src/server/googleOAuth.server.ts`); refresh
  tokens are encrypted at rest in `public.app_user_connections`. The connection
  and the per-scan message ceiling (`profiles.gmail_scan_limit`) are managed on
  `/settings`; scanning walks the mailbox in batches (`src/lib/gmail-scan.ts`)
  because one request cannot outlast the hosting function timeout.
- Deals, thesis and chat threads live in Postgres — tables `deals`, `theses`,
  `deal_threads` and `local_import_marks`, reached through
  `src/lib/deals.functions.ts` under RLS. `src/lib/store.ts` is an in-memory
  read cache that writes through to those server functions; it touches
  localStorage only for the one-time import of pipelines built before the move
  server-side (`importLegacyLocalPipeline`).
- Every server function that reaches a model or the database runs behind
  `requireSupabaseAuth`. Raw route handlers cannot take server-function
  middleware, so `/api/chat` validates the bearer token itself through
  `authenticateRequest` (`src/integrations/supabase/request-auth.ts`) — the one
  place that decides what a valid session looks like.
- Screening is metered per plan: `screeningQuota` on the `Plan` type
  (`src/lib/plans.ts`), the decision in `screeningAllowed` /
  `screeningQuotaForPlan` (`src/lib/billing-rules.ts`), enforced server-side by
  `assertAndRecordScreening` (`src/lib/screening-quota.server.ts`) at the top of
  `analyzeDeal` only — memos, pass emails and chat are follow-ups on a deal that
  has already been metered.
- Server-only modules must stay out of the browser bundle: keep them in
  `src/server/**` or `*.server.ts` and import them lazily from server functions.

See `MIGRATION.md` for the remaining manual cutover steps.
