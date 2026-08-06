UPDATE public.subscriptions SET plan = 'angel_trial' WHERE plan = 'trial';

ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'angel_trial';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  itype public.investor_type;
BEGIN
  itype := COALESCE((NEW.raw_user_meta_data ->> 'investor_type')::public.investor_type, 'angel');

  INSERT INTO public.profiles (id, email, full_name, firm_name, investor_type)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'firm_name',
    itype
  ) ON CONFLICT (id) DO NOTHING;

  -- Trials are an angel-only offer. Every other investor type pays in full
  -- before access, so their subscription starts with no active plan.
  IF itype = 'angel' THEN
    INSERT INTO public.subscriptions (user_id, plan, status, current_period_end)
    VALUES (NEW.id, 'angel_trial', 'trialing', now() + interval '14 days')
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.subscriptions (user_id, plan, status, current_period_end)
    VALUES (NEW.id, 'angel_trial', 'canceled', NULL)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;