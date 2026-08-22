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
  tokens are encrypted at rest in `public.app_user_connections`.
- Deals, thesis and chat threads live in browser localStorage (`src/lib/store.ts`),
  not in Postgres.
- Server-only modules must stay out of the browser bundle: keep them in
  `src/server/**` or `*.server.ts` and import them lazily from server functions.

See `MIGRATION.md` for the remaining manual cutover steps.
