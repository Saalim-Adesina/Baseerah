CREATE TABLE public.billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_id text,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT true,
  polar_subscription_id text,
  polar_customer_id text,
  external_customer_id text,
  polar_product_id text,
  matched_user_id uuid,
  matched_email text,
  mapped_plan text,
  mapped_seats integer,
  mapping_source text,
  outcome text NOT NULL,
  notes text,
  applied_row jsonb,
  payload jsonb
);

GRANT SELECT ON public.billing_webhook_events TO authenticated;
GRANT ALL ON public.billing_webhook_events TO service_role;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook audit"
  ON public.billing_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX billing_webhook_events_received_at_idx ON public.billing_webhook_events (received_at DESC);

ALTER TABLE public.team_members
  ADD COLUMN invite_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN invited_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE POLICY "Members read their own seat"
  ON public.team_members FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.accept_team_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.team_members;
  uid uuid := auth.uid();
  uemail text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  SELECT * INTO m FROM public.team_members WHERE invite_token = _token;
  IF m.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;
  IF lower(m.email) <> lower(coalesce(uemail, '')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch', 'invited_email', m.email);
  END IF;
  UPDATE public.team_members
     SET status = 'active', accepted_at = coalesce(accepted_at, now()), member_user_id = uid
   WHERE id = m.id;
  RETURN jsonb_build_object('ok', true, 'owner_id', m.owner_id, 'role', m.role);
END; $$;

CREATE OR REPLACE FUNCTION public.team_invite_preview(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'email', tm.email,
    'role', tm.role,
    'status', tm.status,
    'owner_name', coalesce(p.firm_name, p.full_name, p.email)
  )
  FROM public.team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.owner_id
  WHERE tm.invite_token = _token
$$;

GRANT EXECUTE ON FUNCTION public.accept_team_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_invite_preview(text) TO anon, authenticated;