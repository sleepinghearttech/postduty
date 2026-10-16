-- Secure checkout supplement. Generated variants substitute  only.
-- Apply AFTER the corresponding commerce base migration. Additive: preserves historic rows.
-- Approval required before production application. Never copy production customer data to preview.
BEGIN;
CREATE TABLE IF NOT EXISTS public.checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_order_id text UNIQUE,
  storefront text NOT NULL CHECK (storefront IN ('general','christmas')),
  items jsonb NOT NULL CHECK (jsonb_typeof(items)='array' AND jsonb_array_length(items)>0),
  subtotal integer NOT NULL CHECK (subtotal>=0),
  gift_charge integer NOT NULL DEFAULT 0 CHECK (gift_charge>=0),
  discount_amount integer NOT NULL DEFAULT 0 CHECK (discount_amount>=0),
  total_amount integer NOT NULL CHECK (total_amount>=100),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency='INR'),
  coupon_code text,
  is_gift boolean NOT NULL DEFAULT false,
  gift_message text,
  customer jsonb,
  is_test boolean NOT NULL,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','awaiting_payment','captured','confirmed','awaiting_customer','reconciliation_required')),
  reconciliation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_amount=subtotal+gift_charge-discount_amount)
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_intent_id uuid REFERENCES public.checkout_intents(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS storefront text DEFAULT 'general';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
-- NULL means legacy/unknown, not verified live revenue.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_mode text CHECK (payment_mode IN ('test','live'));
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_intent_unique ON public.orders(checkout_intent_id) WHERE checkout_intent_id IS NOT NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS personalization jsonb;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creator_earning_paise integer CHECK (creator_earning_paise>=0);
-- NULL on old records means no reliable allocation snapshot, never inferred zero.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_discount_amount integer CHECK (line_discount_amount>=0);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS commission_amount integer CHECK (commission_amount>=0);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS earnings_creator_id uuid REFERENCES public.creators(id);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS earnings_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'awaiting_acceptance';
CREATE TABLE IF NOT EXISTS public.checkout_payments (
  provider_payment_id text PRIMARY KEY,
  provider_order_id text UNIQUE NOT NULL,
  intent_id uuid UNIQUE NOT NULL REFERENCES public.checkout_intents(id),
  order_id uuid UNIQUE REFERENCES public.orders(id),
  amount integer NOT NULL CHECK (amount>=100),
  currency text NOT NULL CHECK (currency='INR'),
  status text NOT NULL DEFAULT 'captured' CHECK(status='captured'),
  is_test boolean NOT NULL,
  provider_verified_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE TABLE IF NOT EXISTS public.payment_notification_jobs (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','suppressed_test','attempting','attempted_unconfirmed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz
);
ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_notification_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_intents,public.checkout_payments,public.payment_notification_jobs FROM anon,authenticated;
GRANT ALL ON public.checkout_intents,public.checkout_payments,public.payment_notification_jobs TO service_role;

-- Only the server calls this after fetching and validating CAPTURED provider payment.
-- One transaction serializes callback/webhook retries AND locks inventory shared by buyers.
CREATE OR REPLACE FUNCTION public.finalize_checkout_payment(
  p_intent_id uuid,p_payment_id text,p_provider_order_id text,p_amount integer,p_currency text,p_test_mode boolean,p_customer jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_intent public.checkout_intents%ROWTYPE;
  v_payment public.checkout_payments%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_line record;
  v_variant jsonb;
  v_order_id uuid;
  v_customer jsonb;
  v_problem text;
  v_variants jsonb;
BEGIN
  IF p_payment_id !~ '^pay_[A-Za-z0-9_]+$' OR p_provider_order_id !~ '^order_[A-Za-z0-9_]+$' THEN RAISE EXCEPTION 'invalid_payment_reference'; END IF;
  SELECT * INTO STRICT v_intent FROM public.checkout_intents WHERE id=p_intent_id FOR UPDATE;
  IF v_intent.provider_order_id IS DISTINCT FROM p_provider_order_id OR v_intent.total_amount IS DISTINCT FROM p_amount OR v_intent.currency IS DISTINCT FROM p_currency OR v_intent.is_test IS DISTINCT FROM p_test_mode THEN RAISE EXCEPTION 'payment_mismatch'; END IF;

  INSERT INTO public.checkout_payments(provider_payment_id,provider_order_id,intent_id,amount,currency,is_test)
  VALUES(p_payment_id,p_provider_order_id,p_intent_id,p_amount,p_currency,p_test_mode) ON CONFLICT DO NOTHING;
  SELECT * INTO v_payment FROM public.checkout_payments WHERE intent_id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_payment.provider_payment_id<>p_payment_id OR v_payment.provider_order_id<>p_provider_order_id OR v_payment.amount<>p_amount OR v_payment.currency<>p_currency OR v_payment.is_test IS DISTINCT FROM p_test_mode THEN RAISE EXCEPTION 'payment_already_bound'; END IF;
  IF v_payment.order_id IS NOT NULL THEN RETURN jsonb_build_object('status','confirmed','order_id',v_payment.order_id,'created',false); END IF;
  UPDATE public.checkout_intents SET status='captured',updated_at=now() WHERE id=p_intent_id;
  -- Never recreate an unbound legacy order or mutate its historical values.
  IF EXISTS(SELECT 1 FROM public.orders WHERE razorpay_payment_id=p_payment_id OR razorpay_order_id=p_provider_order_id) THEN v_problem:='legacy_order_requires_reconciliation'; END IF;
  v_customer:=COALESCE(v_intent.customer,p_customer);
  IF v_customer IS NULL OR jsonb_typeof(v_customer)<>'object' OR length(COALESCE(v_customer->>'name',''))<2 OR length(COALESCE(v_customer->>'email',''))<3 OR length(COALESCE(v_customer->>'phone',''))<8 OR length(COALESCE(v_customer->>'address',''))<10 THEN
    UPDATE public.checkout_intents SET status='awaiting_customer',reconciliation_reason='customer_details_required',updated_at=now() WHERE id=p_intent_id;
    UPDATE public.checkout_payments SET reason='customer_details_required' WHERE intent_id=p_intent_id;
    RETURN jsonb_build_object('status','awaiting_customer','created',false);
  END IF;
  UPDATE public.checkout_intents SET customer=v_customer WHERE id=p_intent_id AND customer IS NULL;
  -- Deterministic lock order prevents competing multi-item baskets deadlocking.
  PERFORM id FROM public.products WHERE id IN (SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(v_intent.items)) ORDER BY id FOR UPDATE;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1 LOOP
    SELECT * INTO v_product FROM public.products WHERE id=v_line.product_id;
    IF NOT FOUND OR v_product.is_active IS NOT TRUE OR COALESCE((v_product.commerce->>'archived')::boolean,false) OR v_product.stock IS NULL OR v_product.stock<v_line.quantity THEN v_problem:='inventory_unavailable'; EXIT; END IF;
  END LOOP;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT * INTO v_product FROM public.products WHERE id=v_line.product_id;
    SELECT value INTO v_variant FROM jsonb_array_elements(COALESCE(v_product.commerce->'variants','[]'::jsonb)) WHERE value->>'id'=v_line.variant_id;
    IF v_variant IS NULL OR COALESCE((v_variant->>'stock')::integer,0)<v_line.quantity THEN v_problem:='variant_inventory_unavailable'; EXIT; END IF;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.coupons WHERE code=v_intent.coupon_code FOR UPDATE;
    IF NOT FOUND OR (v_coupon.max_uses IS NOT NULL AND COALESCE(v_coupon.times_used,0)>=v_coupon.max_uses) THEN v_problem:='coupon_capacity_reached'; END IF;
  END IF;
  IF v_problem IS NOT NULL THEN
    UPDATE public.checkout_intents SET status='reconciliation_required',reconciliation_reason=v_problem,updated_at=now() WHERE id=p_intent_id;
    UPDATE public.checkout_payments SET reason=v_problem WHERE intent_id=p_intent_id;
    RETURN jsonb_build_object('status','reconciliation_required','reason',v_problem,'created',false);
  END IF;
  INSERT INTO public.orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status,razorpay_order_id,razorpay_payment_id,coupon_code,discount_amount,is_gift,gift_message,checkout_intent_id,storefront,is_test,payment_mode)
  VALUES(v_customer->>'name',v_customer->>'email',v_customer->>'phone',v_customer->>'address',v_intent.total_amount,'paid',p_provider_order_id,p_payment_id,v_intent.coupon_code,v_intent.discount_amount,v_intent.is_gift,v_intent.gift_message,p_intent_id,v_intent.storefront,p_test_mode,CASE WHEN p_test_mode THEN 'test' ELSE 'live' END) RETURNING id INTO v_order_id;
  INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,variant_id,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items);
  UPDATE public.products p SET stock=p.stock-q.quantity,updated_at=clock_timestamp() FROM (SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb((variant->>'stock')::integer-v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants FROM public.products p CROSS JOIN LATERAL jsonb_array_elements(p.commerce->'variants') WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    UPDATE public.products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN UPDATE public.coupons SET times_used=COALESCE(times_used,0)+1 WHERE code=v_intent.coupon_code; END IF;
  UPDATE public.checkout_payments SET order_id=v_order_id,reason=NULL WHERE intent_id=p_intent_id;
  UPDATE public.checkout_intents SET status='confirmed',reconciliation_reason=NULL,updated_at=now() WHERE id=p_intent_id;
  INSERT INTO public.payment_notification_jobs(order_id,status) VALUES(v_order_id,CASE WHEN p_test_mode THEN 'suppressed_test' ELSE 'pending' END);
  RETURN jsonb_build_object('status','confirmed','order_id',v_order_id,'created',true);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) TO service_role;
COMMIT;
