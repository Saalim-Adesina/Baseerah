ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS manual_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_owner_email_uniq
  ON public.team_members (owner_id, lower(email));

-- Seat writes are enforced server-side (plan ceilings, owner-seat protection),
-- so the browser keeps read access only.
DROP POLICY IF EXISTS "Owners manage own team members" ON public.team_members;

CREATE POLICY "Owners read own team members"
  ON public.team_members FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;