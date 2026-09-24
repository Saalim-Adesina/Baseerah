-- How many recent messages a Gmail scan should walk, set per user on the
-- settings page. Kept on `profiles` because that row already exists for every
-- user and is already RLS-scoped to its owner for both select and update.
--
-- The ceiling matches the server clamp in `src/server/gmail.server.ts`; the
-- check constraint is what stops a crafted request from asking for 100000.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gmail_scan_limit smallint NOT NULL DEFAULT 50;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gmail_scan_limit_range;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gmail_scan_limit_range
  CHECK (gmail_scan_limit BETWEEN 1 AND 100);
