ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS polar_customer_id text,
  ADD COLUMN IF NOT EXISTS polar_subscription_id text,
  ADD COLUMN IF NOT EXISTS polar_product_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_polar_subscription_id_key
  ON public.subscriptions (polar_subscription_id)
  WHERE polar_subscription_id IS NOT NULL;

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;