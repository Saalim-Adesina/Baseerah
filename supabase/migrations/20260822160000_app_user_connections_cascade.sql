-- `app_user_connections.user_id` was declared as a bare uuid with no foreign
-- key, while every other user-scoped table in this schema references
-- auth.users(id) ON DELETE CASCADE. Deleting an account therefore drained every
-- table except this one, leaving behind an encrypted Google refresh token that
-- no product surface could ever reach again — and, because the token was never
-- revoked with Google, a live grant against the user's mailbox.
--
-- That contradicts the deletion promise in the privacy policy and is exactly
-- the kind of orphaned-credential finding a CASA assessor looks for.
--
-- Safe to add directly: the table is empty at time of writing. The delete below
-- is a belt-and-braces guard so the constraint cannot fail on a row whose user
-- has already been removed.
DELETE FROM public.app_user_connections c
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id);

ALTER TABLE public.app_user_connections
  DROP CONSTRAINT IF EXISTS app_user_connections_user_id_fkey;

ALTER TABLE public.app_user_connections
  ADD CONSTRAINT app_user_connections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Deletion is by user_id in application code; the unique index on
-- (user_id, connector_id) already covers lookups, but the cascade needs the
-- leading column indexed to avoid a sequential scan per deleted user.
CREATE INDEX IF NOT EXISTS app_user_connections_user_id_idx
  ON public.app_user_connections (user_id);
