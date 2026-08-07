-- Recreate app_role with a platform-level superadmin tier
DROP POLICY IF EXISTS "Admins read webhook audit" ON public.billing_webhook_events;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

CREATE TYPE public.app_role_new AS ENUM ('superadmin', 'admin', 'member');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new
  USING (CASE WHEN role::text = 'admin' THEN 'superadmin' ELSE role::text END)::public.app_role_new;

DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

CREATE POLICY "Superadmins read webhook audit"
ON public.billing_webhook_events
FOR SELECT
TO authenticated
USING (public.is_superadmin(auth.uid()));