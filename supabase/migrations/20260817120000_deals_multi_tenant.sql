-- Move deals, thesis and chat threads out of browser localStorage and into
-- Postgres, scoped to an account so every seat holder on the same account sees
-- the same pipeline.
--
-- Tenancy model (matches the existing seats model): an account is identified by
-- its owner's user id. Every user owns their own account and holds a self seat
-- row in team_members; joining someone else's account means an active
-- team_members row with member_user_id = you and owner_id = them.

/* ---------------- account resolution ---------------- */

-- The account the caller reads and writes through. A member of someone else's
-- account works inside that account; everyone else works inside their own.
CREATE OR REPLACE FUNCTION public.current_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT tm.owner_id
      FROM public.team_members tm
      WHERE tm.member_user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.owner_id <> auth.uid()
      ORDER BY tm.accepted_at DESC NULLS LAST
      LIMIT 1
    ),
    auth.uid()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_account_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_account_id() TO authenticated, service_role;

/* ---------------- deals ---------------- */

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  company text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  one_liner text NOT NULL DEFAULT '',
  sector text NOT NULL DEFAULT '',
  geography text NOT NULL DEFAULT '',
  round text NOT NULL DEFAULT 'Seed',
  raising text NOT NULL DEFAULT '',
  valuation text NOT NULL DEFAULT '',
  traction text NOT NULL DEFAULT '',
  unit_economics text NOT NULL DEFAULT '',
  competition text NOT NULL DEFAULT '',
  founders jsonb NOT NULL DEFAULT '[]'::jsonb,
  meeting_notes text NOT NULL DEFAULT '',
  personal_bias text NOT NULL DEFAULT '',
  deck_text text NOT NULL DEFAULT '',
  deck_file_name text NOT NULL DEFAULT '',

  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','analyzed','shortlist','passed')),
  analysis jsonb,
  memo text,
  pass_email jsonb,

  -- Set when the deal was imported from a connected mailbox; used to dedupe.
  gmail_message_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deals_account_created_idx ON public.deals (account_id, created_at DESC);
CREATE UNIQUE INDEX deals_account_gmail_message_idx
  ON public.deals (account_id, gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members read deals" ON public.deals
  FOR SELECT TO authenticated USING (account_id = public.current_account_id());
CREATE POLICY "Account members create deals" ON public.deals
  FOR INSERT TO authenticated WITH CHECK (account_id = public.current_account_id());
CREATE POLICY "Account members update deals" ON public.deals
  FOR UPDATE TO authenticated
  USING (account_id = public.current_account_id())
  WITH CHECK (account_id = public.current_account_id());
CREATE POLICY "Account members delete deals" ON public.deals
  FOR DELETE TO authenticated USING (account_id = public.current_account_id());

CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------- thesis (one per account) ---------------- */

CREATE TABLE public.theses (
  account_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fund_name text NOT NULL DEFAULT '',
  partner_name text NOT NULL DEFAULT '',
  statement text NOT NULL DEFAULT '',
  preferred_industries text NOT NULL DEFAULT '',
  anti_portfolio text NOT NULL DEFAULT '',
  stage_focus text NOT NULL DEFAULT '',
  check_size text NOT NULL DEFAULT '',
  model_instructions text NOT NULL DEFAULT '',
  temperature numeric NOT NULL DEFAULT 0.35 CHECK (temperature >= 0 AND temperature <= 2),
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.theses TO authenticated;
GRANT ALL ON public.theses TO service_role;
ALTER TABLE public.theses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members manage thesis" ON public.theses
  FOR ALL TO authenticated
  USING (account_id = public.current_account_id())
  WITH CHECK (account_id = public.current_account_id());

CREATE TRIGGER theses_updated_at BEFORE UPDATE ON public.theses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------- chat threads ---------------- */

CREATE TABLE public.deal_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'New discussion',
  -- UI message list, stored as sent by the AI SDK.
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deal_threads_deal_idx ON public.deal_threads (deal_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_threads TO authenticated;
GRANT ALL ON public.deal_threads TO service_role;
ALTER TABLE public.deal_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members read threads" ON public.deal_threads
  FOR SELECT TO authenticated USING (account_id = public.current_account_id());
CREATE POLICY "Account members create threads" ON public.deal_threads
  FOR INSERT TO authenticated WITH CHECK (account_id = public.current_account_id());
CREATE POLICY "Account members update threads" ON public.deal_threads
  FOR UPDATE TO authenticated
  USING (account_id = public.current_account_id())
  WITH CHECK (account_id = public.current_account_id());
CREATE POLICY "Account members delete threads" ON public.deal_threads
  FOR DELETE TO authenticated USING (account_id = public.current_account_id());

CREATE TRIGGER deal_threads_updated_at BEFORE UPDATE ON public.deal_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------- one-time import bookkeeping ---------------- */

-- Existing users still hold their pipeline in localStorage. The browser pushes
-- it once on first load after the deploy; this row stops it re-importing.
CREATE TABLE public.local_import_marks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  imported_at timestamptz NOT NULL DEFAULT now(),
  deal_count integer NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT ON public.local_import_marks TO authenticated;
GRANT ALL ON public.local_import_marks TO service_role;
ALTER TABLE public.local_import_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own import mark" ON public.local_import_marks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users record own import mark" ON public.local_import_marks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
