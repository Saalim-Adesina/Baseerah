-- Rename the platform-level role from "superadmin" to "developer".
-- Renaming the enum value keeps every existing user_roles row valid, so nobody
-- loses access; only the label changes.

ALTER TYPE public.app_role RENAME VALUE 'superadmin' TO 'developer';

-- The audit policy depends on the old function, so it goes first.
DROP POLICY IF EXISTS "Superadmins read webhook audit" ON public.billing_webhook_events;
DROP FUNCTION IF EXISTS public.is_superadmin(uuid);

CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'developer'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_developer(uuid) FROM anon, authenticated, public;

CREATE POLICY "Developers read webhook audit"
ON public.billing_webhook_events
FOR SELECT
TO authenticated
USING (public.is_developer(auth.uid()));
