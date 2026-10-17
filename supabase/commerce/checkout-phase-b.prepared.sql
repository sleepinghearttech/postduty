-- Checkout phase B: GST invoices, composite-supply tax, creator payouts, creator profiles and pickup addresses.
-- PREPARED ONLY. Not applied anywhere. Owner approval is required before applying to production.
--
-- Apply exactly ONE section in the matching environment, AFTER checkout-phase-a.prepared.sql:
--   * PRODUCTION section -> production project (public.* names)
--   * PREVIEW section    -> preview/sandbox tables (public.preview_* names, COMMERCE_SANDBOX=true)
-- Each section is a single transaction and is safe to re-run.
--
-- Additive and backward compatible:
--   * historical orders get no invoice number, no line_index and no courier cost (all NULL);
--   * invoice numbers are assigned inside finalize_checkout_payment, in the same transaction as the order,
--     from a per-financial-year counter row, so a rolled-back order never consumes a number (gapless);
--   * test-mode orders use a separate TEST/ series and never touch the PD/ series;
--   * public reads of creators are limited by a column grant to id, display_name, bio, photo_url, profession,
--     and by a policy to active creators whose profile the owner has published;
--   * pickup addresses live in their own table with no public access.
-- Recording a settlement as paid never moves money.
-- The two sections differ only in the preview_ prefix and the preview-only rejection of live payments.

-- ============================================================================
-- PRODUCTION SECTION (public.*)
-- ============================================================================
BEGIN;
-- 1. Invoices: gapless serial per financial year (April–March, India time), e.g. PD/2026-27/0001.
--    Test-mode orders use a separate TEST/ series so the real series contains only live supplies.
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  series text PRIMARY KEY CHECK (series ~ '^(PD|TEST)/[0-9]{4}-[0-9]{2}$'),
  last_number integer NOT NULL CHECK (last_number>=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_counters FROM anon,authenticated;
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_invoice_number_unique ON public.orders(invoice_number) WHERE invoice_number IS NOT NULL;
-- Snapshot position of each line, linking order_items to tax_breakdown.lines[line_index]. NULL for older orders.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_index integer CHECK (line_index>=0);

-- India has no daylight saving time, so a fixed +05:30 offset is exact.
CREATE OR REPLACE FUNCTION public.invoice_financial_year(p_at timestamptz) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN extract(month FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')>=4
    THEN extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int
    ELSE extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int-1 END::text
  || '-' || lpad((((CASE WHEN extract(month FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')>=4
    THEN extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int
    ELSE extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int-1 END)+1)%100)::text,2,'0')
$$;

-- Idempotent: an order keeps its first number. Only checkout-finalized paid orders are numbered.
CREATE OR REPLACE FUNCTION public.assign_invoice_number(p_order_id uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_series text;
  v_number integer;
  v_invoice text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.invoice_number IS NOT NULL THEN RETURN v_order.invoice_number; END IF;
  IF v_order.checkout_intent_id IS NULL OR v_order.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'order_not_invoiceable'; END IF;
  v_series:=CASE WHEN v_order.is_test THEN 'TEST/' ELSE 'PD/' END || public.invoice_financial_year(now());
  -- The counter row lock serializes concurrent orders; the number is consumed only if the transaction commits.
  INSERT INTO public.invoice_counters(series,last_number) VALUES(v_series,1)
    ON CONFLICT (series) DO UPDATE SET last_number=public.invoice_counters.last_number+1,updated_at=now()
    RETURNING last_number INTO v_number;
  v_invoice:=v_series || '/' || lpad(v_number::text,4,'0');
  UPDATE public.orders SET invoice_number=v_invoice,invoice_date=now() WHERE id=p_order_id;
  RETURN v_invoice;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_invoice_number(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_invoice_number(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.invoice_financial_year(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_financial_year(timestamptz) TO service_role;

-- 2. Creator payouts (extends the existing settlements ledger).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_cost_paise integer CHECK (courier_cost_paise>=0);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creator_payout_paise integer CHECK (creator_payout_paise>=0);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.settlements(id);
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS lines jsonb CHECK (lines IS NULL OR jsonb_typeof(lines)='array');
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS paid_on date;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS payment_reference text CHECK (payment_reference IS NULL OR length(payment_reference) BETWEEN 3 AND 80);
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE INDEX IF NOT EXISTS order_items_settlement_idx ON public.order_items(settlement_id);

-- One transaction: every line must belong to the creator and be unsettled; the total is the sum of the lines.
CREATE OR REPLACE FUNCTION public.create_creator_settlement(p_creator_id uuid,p_period_start date,p_period_end date,p_lines jsonb,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_id uuid:=gen_random_uuid();
  v_count integer;
  v_amount bigint;
  v_locked integer;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'settlement_lines_required'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN RAISE EXCEPTION 'invalid_settlement_period'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l WHERE jsonb_typeof(l->'payout_paise')<>'number' OR (l->>'payout_paise')::numeric<0 OR (l->>'payout_paise')::numeric<>trunc((l->>'payout_paise')::numeric) OR (l->>'order_item_id') IS NULL) THEN RAISE EXCEPTION 'invalid_settlement_line'; END IF;
  SELECT count(DISTINCT l->>'order_item_id'),sum((l->>'payout_paise')::bigint) INTO v_count,v_amount FROM jsonb_array_elements(p_lines) l;
  IF v_count<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'duplicate_settlement_line'; END IF;
  IF v_amount>2147483647 THEN RAISE EXCEPTION 'settlement_too_large'; END IF;
  PERFORM id FROM public.order_items WHERE id IN (SELECT (l->>'order_item_id')::uuid FROM jsonb_array_elements(p_lines) l) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_locked FROM public.order_items WHERE id IN (SELECT (l->>'order_item_id')::uuid FROM jsonb_array_elements(p_lines) l) AND creator_id=p_creator_id AND settlement_id IS NULL;
  IF v_locked<>v_count THEN RAISE EXCEPTION 'line_unavailable_or_already_settled'; END IF;
  INSERT INTO public.settlements(id,creator_id,amount_paise,status,period_start,period_end,note,lines)
    VALUES(v_id,p_creator_id,v_amount::integer,'pending',p_period_start,p_period_end,left(COALESCE(p_note,''),1000),p_lines);
  UPDATE public.order_items i SET settlement_id=v_id,creator_payout_paise=(l->>'payout_paise')::integer
    FROM jsonb_array_elements(p_lines) l WHERE i.id=(l->>'order_item_id')::uuid;
  INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.created','settlement',v_id::text,jsonb_build_object('creator_id',p_creator_id,'amount_paise',v_amount,'lines',v_count,'period_start',p_period_start,'period_end',p_period_end));
  RETURN jsonb_build_object('id',v_id,'amount_paise',v_amount,'lines',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.create_creator_settlement(uuid,date,date,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_creator_settlement(uuid,date,date,jsonb,text) TO service_role;

-- pending → approved → paid. Recording "paid" never moves money: the transfer is made outside the system.
CREATE OR REPLACE FUNCTION public.approve_settlement(p_settlement_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.settlements%ROWTYPE;
BEGIN
  UPDATE public.settlements SET status='approved',approved_at=now() WHERE id=p_settlement_id AND status='pending' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_settlement_transition'; END IF;
  INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.approved','settlement',p_settlement_id::text,jsonb_build_object('amount_paise',v_row.amount_paise));
  RETURN to_jsonb(v_row);
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_settlement_paid(p_settlement_id uuid,p_paid_on date,p_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.settlements%ROWTYPE;
BEGIN
  IF p_paid_on IS NULL OR p_paid_on>((now() AT TIME ZONE 'UTC') + interval '330 minutes')::date THEN RAISE EXCEPTION 'invalid_payment_date'; END IF;
  IF p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'payment_reference_required'; END IF;
  UPDATE public.settlements SET status='paid',paid_on=p_paid_on,payment_reference=btrim(p_reference),paid_at=now() WHERE id=p_settlement_id AND status='approved' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_settlement_transition'; END IF;
  INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.paid','settlement',p_settlement_id::text,jsonb_build_object('amount_paise',v_row.amount_paise,'paid_on',p_paid_on,'payment_reference',btrim(p_reference)));
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.approve_settlement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_settlement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.mark_settlement_paid(uuid,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_settlement_paid(uuid,date,text) TO service_role;

-- 3. Public creator profile: only these owner-approved columns, only for active creators the owner has published.
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS photo_url text CHECK (photo_url IS NULL OR (photo_url ~ '^https://' AND length(photo_url)<=2048));
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS profession text CHECK (profession IS NULL OR length(profession)<=80);
ALTER TABLE public.creators ADD COLUMN IF NOT EXISTS profile_published boolean NOT NULL DEFAULT false;
REVOKE ALL ON public.creators FROM anon,authenticated;
GRANT SELECT (id,display_name,bio,photo_url,profession) ON public.creators TO anon,authenticated;
DROP POLICY IF EXISTS creators_public_profile ON public.creators;
CREATE POLICY creators_public_profile ON public.creators FOR SELECT TO anon,authenticated USING (status='active' AND profile_published);

-- 4. Private pickup address per creator (owner/service role only; never readable by the public).
CREATE TABLE IF NOT EXISTS public.creator_pickup_addresses (
  creator_id uuid PRIMARY KEY REFERENCES public.creators(id),
  pickup_name text NOT NULL CHECK (length(pickup_name) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  address text NOT NULL CHECK (length(address) BETWEEN 10 AND 500),
  pincode text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  shiprocket_location text CHECK (shiprocket_location IS NULL OR shiprocket_location ~ '^[A-Za-z0-9 _-]{1,64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_pickup_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_pickup_addresses FROM anon,authenticated;
GRANT ALL ON public.creator_pickup_addresses TO service_role;

-- 5. Finalization (phase A version) now records each line's snapshot position and assigns the invoice number.
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
    IF NOT FOUND OR v_product.is_active IS NOT TRUE OR COALESCE((v_product.commerce->>'archived')::boolean,false) OR COALESCE((v_product.commerce->>'catalog_only')::boolean,false) OR v_product.stock IS NULL OR v_product.stock<v_line.quantity THEN v_problem:='inventory_unavailable'; EXIT; END IF;
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
  INSERT INTO public.orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status,razorpay_order_id,razorpay_payment_id,coupon_code,discount_amount,is_gift,gift_message,checkout_intent_id,storefront,is_test,payment_mode,shipping_amount,tax_breakdown,shipping_details)
  VALUES(v_customer->>'name',v_customer->>'email',v_customer->>'phone',v_customer->>'address',v_intent.total_amount,'paid',p_provider_order_id,p_payment_id,v_intent.coupon_code,v_intent.discount_amount,v_intent.is_gift,v_intent.gift_message,p_intent_id,v_intent.storefront,p_test_mode,CASE WHEN p_test_mode THEN 'test' ELSE 'live' END,v_intent.shipping_charge,v_intent.tax_breakdown,v_customer - 'terms_accepted_at') RETURNING id INTO v_order_id;
  INSERT INTO public.order_items(order_id,line_index,product_id,quantity,unit_price,variant_id,variant_name,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(ordinality-1)::integer,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',value->>'variant_name',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items) WITH ORDINALITY;
  UPDATE public.products p SET stock=p.stock-q.quantity,updated_at=clock_timestamp() FROM (SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb((variant->>'stock')::integer-v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants FROM public.products p CROSS JOIN LATERAL jsonb_array_elements(p.commerce->'variants') WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    UPDATE public.products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN UPDATE public.coupons SET times_used=COALESCE(times_used,0)+1 WHERE code=v_intent.coupon_code; END IF;
  UPDATE public.checkout_payments SET order_id=v_order_id,reason=NULL WHERE intent_id=p_intent_id;
  UPDATE public.checkout_intents SET status='confirmed',reconciliation_reason=NULL,updated_at=now() WHERE id=p_intent_id;
  INSERT INTO public.payment_notification_jobs(order_id,status) VALUES(v_order_id,CASE WHEN p_test_mode THEN 'suppressed_test' ELSE 'pending' END);
  -- Same transaction as the order: a rollback also rolls back the invoice counter, so the series stays gapless.
  PERFORM public.assign_invoice_number(v_order_id);
  RETURN jsonb_build_object('status','confirmed','order_id',v_order_id,'created',true);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) TO service_role;
COMMIT;

-- ============================================================================
-- PREVIEW SECTION (public.preview_*)
-- ============================================================================
BEGIN;
-- 1. Invoices: gapless serial per financial year (April–March, India time), e.g. PD/2026-27/0001.
--    Test-mode orders use a separate TEST/ series so the real series contains only live supplies.
CREATE TABLE IF NOT EXISTS public.preview_invoice_counters (
  series text PRIMARY KEY CHECK (series ~ '^(PD|TEST)/[0-9]{4}-[0-9]{2}$'),
  last_number integer NOT NULL CHECK (last_number>=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.preview_invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preview_invoice_counters FROM anon,authenticated;
GRANT ALL ON public.preview_invoice_counters TO service_role;
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS preview_orders_invoice_number_unique ON public.preview_orders(invoice_number) WHERE invoice_number IS NOT NULL;
-- Snapshot position of each line, linking order_items to tax_breakdown.lines[line_index]. NULL for older orders.
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS line_index integer CHECK (line_index>=0);

-- India has no daylight saving time, so a fixed +05:30 offset is exact.
CREATE OR REPLACE FUNCTION public.preview_invoice_financial_year(p_at timestamptz) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN extract(month FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')>=4
    THEN extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int
    ELSE extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int-1 END::text
  || '-' || lpad((((CASE WHEN extract(month FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')>=4
    THEN extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int
    ELSE extract(year FROM (p_at AT TIME ZONE 'UTC') + interval '330 minutes')::int-1 END)+1)%100)::text,2,'0')
$$;

-- Idempotent: an order keeps its first number. Only checkout-finalized paid orders are numbered.
CREATE OR REPLACE FUNCTION public.preview_assign_invoice_number(p_order_id uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.preview_orders%ROWTYPE;
  v_series text;
  v_number integer;
  v_invoice text;
BEGIN
  SELECT * INTO v_order FROM public.preview_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.invoice_number IS NOT NULL THEN RETURN v_order.invoice_number; END IF;
  IF v_order.checkout_intent_id IS NULL OR v_order.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'order_not_invoiceable'; END IF;
  v_series:=CASE WHEN v_order.is_test THEN 'TEST/' ELSE 'PD/' END || public.preview_invoice_financial_year(now());
  -- The counter row lock serializes concurrent orders; the number is consumed only if the transaction commits.
  INSERT INTO public.preview_invoice_counters(series,last_number) VALUES(v_series,1)
    ON CONFLICT (series) DO UPDATE SET last_number=public.preview_invoice_counters.last_number+1,updated_at=now()
    RETURNING last_number INTO v_number;
  v_invoice:=v_series || '/' || lpad(v_number::text,4,'0');
  UPDATE public.preview_orders SET invoice_number=v_invoice,invoice_date=now() WHERE id=p_order_id;
  RETURN v_invoice;
END;
$$;
REVOKE ALL ON FUNCTION public.preview_assign_invoice_number(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_assign_invoice_number(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.preview_invoice_financial_year(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_invoice_financial_year(timestamptz) TO service_role;

-- 2. Creator payouts (extends the existing settlements ledger).
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS courier_cost_paise integer CHECK (courier_cost_paise>=0);
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS creator_payout_paise integer CHECK (creator_payout_paise>=0);
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.preview_settlements(id);
ALTER TABLE public.preview_settlements ADD COLUMN IF NOT EXISTS lines jsonb CHECK (lines IS NULL OR jsonb_typeof(lines)='array');
ALTER TABLE public.preview_settlements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.preview_settlements ADD COLUMN IF NOT EXISTS paid_on date;
ALTER TABLE public.preview_settlements ADD COLUMN IF NOT EXISTS payment_reference text CHECK (payment_reference IS NULL OR length(payment_reference) BETWEEN 3 AND 80);
ALTER TABLE public.preview_settlements ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE INDEX IF NOT EXISTS preview_order_items_settlement_idx ON public.preview_order_items(settlement_id);

-- One transaction: every line must belong to the creator and be unsettled; the total is the sum of the lines.
CREATE OR REPLACE FUNCTION public.preview_create_creator_settlement(p_creator_id uuid,p_period_start date,p_period_end date,p_lines jsonb,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_id uuid:=gen_random_uuid();
  v_count integer;
  v_amount bigint;
  v_locked integer;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN RAISE EXCEPTION 'settlement_lines_required'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end<p_period_start THEN RAISE EXCEPTION 'invalid_settlement_period'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l WHERE jsonb_typeof(l->'payout_paise')<>'number' OR (l->>'payout_paise')::numeric<0 OR (l->>'payout_paise')::numeric<>trunc((l->>'payout_paise')::numeric) OR (l->>'order_item_id') IS NULL) THEN RAISE EXCEPTION 'invalid_settlement_line'; END IF;
  SELECT count(DISTINCT l->>'order_item_id'),sum((l->>'payout_paise')::bigint) INTO v_count,v_amount FROM jsonb_array_elements(p_lines) l;
  IF v_count<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'duplicate_settlement_line'; END IF;
  IF v_amount>2147483647 THEN RAISE EXCEPTION 'settlement_too_large'; END IF;
  PERFORM id FROM public.preview_order_items WHERE id IN (SELECT (l->>'order_item_id')::uuid FROM jsonb_array_elements(p_lines) l) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_locked FROM public.preview_order_items WHERE id IN (SELECT (l->>'order_item_id')::uuid FROM jsonb_array_elements(p_lines) l) AND creator_id=p_creator_id AND settlement_id IS NULL;
  IF v_locked<>v_count THEN RAISE EXCEPTION 'line_unavailable_or_already_settled'; END IF;
  INSERT INTO public.preview_settlements(id,creator_id,amount_paise,status,period_start,period_end,note,lines)
    VALUES(v_id,p_creator_id,v_amount::integer,'pending',p_period_start,p_period_end,left(COALESCE(p_note,''),1000),p_lines);
  UPDATE public.preview_order_items i SET settlement_id=v_id,creator_payout_paise=(l->>'payout_paise')::integer
    FROM jsonb_array_elements(p_lines) l WHERE i.id=(l->>'order_item_id')::uuid;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.created','settlement',v_id::text,jsonb_build_object('creator_id',p_creator_id,'amount_paise',v_amount,'lines',v_count,'period_start',p_period_start,'period_end',p_period_end));
  RETURN jsonb_build_object('id',v_id,'amount_paise',v_amount,'lines',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_create_creator_settlement(uuid,date,date,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_create_creator_settlement(uuid,date,date,jsonb,text) TO service_role;

-- pending → approved → paid. Recording "paid" never moves money: the transfer is made outside the system.
CREATE OR REPLACE FUNCTION public.preview_approve_settlement(p_settlement_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.preview_settlements%ROWTYPE;
BEGIN
  UPDATE public.preview_settlements SET status='approved',approved_at=now() WHERE id=p_settlement_id AND status='pending' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_settlement_transition'; END IF;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.approved','settlement',p_settlement_id::text,jsonb_build_object('amount_paise',v_row.amount_paise));
  RETURN to_jsonb(v_row);
END;
$$;
CREATE OR REPLACE FUNCTION public.preview_mark_settlement_paid(p_settlement_id uuid,p_paid_on date,p_reference text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.preview_settlements%ROWTYPE;
BEGIN
  IF p_paid_on IS NULL OR p_paid_on>((now() AT TIME ZONE 'UTC') + interval '330 minutes')::date THEN RAISE EXCEPTION 'invalid_payment_date'; END IF;
  IF p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 3 AND 80 THEN RAISE EXCEPTION 'payment_reference_required'; END IF;
  UPDATE public.preview_settlements SET status='paid',paid_on=p_paid_on,payment_reference=btrim(p_reference),paid_at=now() WHERE id=p_settlement_id AND status='approved' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_settlement_transition'; END IF;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','settlement.paid','settlement',p_settlement_id::text,jsonb_build_object('amount_paise',v_row.amount_paise,'paid_on',p_paid_on,'payment_reference',btrim(p_reference)));
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_approve_settlement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_approve_settlement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.preview_mark_settlement_paid(uuid,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_mark_settlement_paid(uuid,date,text) TO service_role;

-- 3. Public creator profile: only these owner-approved columns, only for active creators the owner has published.
ALTER TABLE public.preview_creators ADD COLUMN IF NOT EXISTS photo_url text CHECK (photo_url IS NULL OR (photo_url ~ '^https://' AND length(photo_url)<=2048));
ALTER TABLE public.preview_creators ADD COLUMN IF NOT EXISTS profession text CHECK (profession IS NULL OR length(profession)<=80);
ALTER TABLE public.preview_creators ADD COLUMN IF NOT EXISTS profile_published boolean NOT NULL DEFAULT false;
REVOKE ALL ON public.preview_creators FROM anon,authenticated;
GRANT SELECT (id,display_name,bio,photo_url,profession) ON public.preview_creators TO anon,authenticated;
DROP POLICY IF EXISTS creators_public_profile ON public.preview_creators;
CREATE POLICY creators_public_profile ON public.preview_creators FOR SELECT TO anon,authenticated USING (status='active' AND profile_published);

-- 4. Private pickup address per creator (owner/service role only; never readable by the public).
CREATE TABLE IF NOT EXISTS public.preview_creator_pickup_addresses (
  creator_id uuid PRIMARY KEY REFERENCES public.preview_creators(id),
  pickup_name text NOT NULL CHECK (length(pickup_name) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  address text NOT NULL CHECK (length(address) BETWEEN 10 AND 500),
  pincode text NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  shiprocket_location text CHECK (shiprocket_location IS NULL OR shiprocket_location ~ '^[A-Za-z0-9 _-]{1,64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.preview_creator_pickup_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.preview_creator_pickup_addresses FROM anon,authenticated;
GRANT ALL ON public.preview_creator_pickup_addresses TO service_role;

-- 5. Finalization (phase A version) now records each line's snapshot position and assigns the invoice number.
CREATE OR REPLACE FUNCTION public.preview_finalize_checkout_payment(
  p_intent_id uuid,p_payment_id text,p_provider_order_id text,p_amount integer,p_currency text,p_test_mode boolean,p_customer jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_intent public.preview_checkout_intents%ROWTYPE;
  v_payment public.preview_checkout_payments%ROWTYPE;
  v_product public.preview_products%ROWTYPE;
  v_coupon public.preview_coupons%ROWTYPE;
  v_line record;
  v_variant jsonb;
  v_order_id uuid;
  v_customer jsonb;
  v_problem text;
  v_variants jsonb;
BEGIN
  IF p_payment_id !~ '^pay_[A-Za-z0-9_]+$' OR p_provider_order_id !~ '^order_[A-Za-z0-9_]+$' THEN RAISE EXCEPTION 'invalid_payment_reference'; END IF;
  SELECT * INTO STRICT v_intent FROM public.preview_checkout_intents WHERE id=p_intent_id FOR UPDATE;
  IF v_intent.provider_order_id IS DISTINCT FROM p_provider_order_id OR v_intent.total_amount IS DISTINCT FROM p_amount OR v_intent.currency IS DISTINCT FROM p_currency OR v_intent.is_test IS DISTINCT FROM p_test_mode THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
  IF p_test_mode IS NOT TRUE THEN RAISE EXCEPTION 'preview_rejects_live_payment'; END IF;
  INSERT INTO public.preview_checkout_payments(provider_payment_id,provider_order_id,intent_id,amount,currency,is_test)
  VALUES(p_payment_id,p_provider_order_id,p_intent_id,p_amount,p_currency,p_test_mode) ON CONFLICT DO NOTHING;
  SELECT * INTO v_payment FROM public.preview_checkout_payments WHERE intent_id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_payment.provider_payment_id<>p_payment_id OR v_payment.provider_order_id<>p_provider_order_id OR v_payment.amount<>p_amount OR v_payment.currency<>p_currency OR v_payment.is_test IS DISTINCT FROM p_test_mode THEN RAISE EXCEPTION 'payment_already_bound'; END IF;
  IF v_payment.order_id IS NOT NULL THEN RETURN jsonb_build_object('status','confirmed','order_id',v_payment.order_id,'created',false); END IF;
  UPDATE public.preview_checkout_intents SET status='captured',updated_at=now() WHERE id=p_intent_id;
  -- Never recreate an unbound legacy order or mutate its historical values.
  IF EXISTS(SELECT 1 FROM public.preview_orders WHERE razorpay_payment_id=p_payment_id OR razorpay_order_id=p_provider_order_id) THEN v_problem:='legacy_order_requires_reconciliation'; END IF;
  v_customer:=COALESCE(v_intent.customer,p_customer);
  IF v_customer IS NULL OR jsonb_typeof(v_customer)<>'object' OR length(COALESCE(v_customer->>'name',''))<2 OR length(COALESCE(v_customer->>'email',''))<3 OR length(COALESCE(v_customer->>'phone',''))<8 OR length(COALESCE(v_customer->>'address',''))<10 THEN
    UPDATE public.preview_checkout_intents SET status='awaiting_customer',reconciliation_reason='customer_details_required',updated_at=now() WHERE id=p_intent_id;
    UPDATE public.preview_checkout_payments SET reason='customer_details_required' WHERE intent_id=p_intent_id;
    RETURN jsonb_build_object('status','awaiting_customer','created',false);
  END IF;
  UPDATE public.preview_checkout_intents SET customer=v_customer WHERE id=p_intent_id AND customer IS NULL;
  -- Deterministic lock order prevents competing multi-item baskets deadlocking.
  PERFORM id FROM public.preview_products WHERE id IN (SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(v_intent.items)) ORDER BY id FOR UPDATE;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1 LOOP
    SELECT * INTO v_product FROM public.preview_products WHERE id=v_line.product_id;
    IF NOT FOUND OR v_product.is_active IS NOT TRUE OR COALESCE((v_product.commerce->>'archived')::boolean,false) OR COALESCE((v_product.commerce->>'catalog_only')::boolean,false) OR v_product.stock IS NULL OR v_product.stock<v_line.quantity THEN v_problem:='inventory_unavailable'; EXIT; END IF;
  END LOOP;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT * INTO v_product FROM public.preview_products WHERE id=v_line.product_id;
    SELECT value INTO v_variant FROM jsonb_array_elements(COALESCE(v_product.commerce->'variants','[]'::jsonb)) WHERE value->>'id'=v_line.variant_id;
    IF v_variant IS NULL OR COALESCE((v_variant->>'stock')::integer,0)<v_line.quantity THEN v_problem:='variant_inventory_unavailable'; EXIT; END IF;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.preview_coupons WHERE code=v_intent.coupon_code FOR UPDATE;
    IF NOT FOUND OR (v_coupon.max_uses IS NOT NULL AND COALESCE(v_coupon.times_used,0)>=v_coupon.max_uses) THEN v_problem:='coupon_capacity_reached'; END IF;
  END IF;
  IF v_problem IS NOT NULL THEN
    UPDATE public.preview_checkout_intents SET status='reconciliation_required',reconciliation_reason=v_problem,updated_at=now() WHERE id=p_intent_id;
    UPDATE public.preview_checkout_payments SET reason=v_problem WHERE intent_id=p_intent_id;
    RETURN jsonb_build_object('status','reconciliation_required','reason',v_problem,'created',false);
  END IF;
  INSERT INTO public.preview_orders(customer_name,customer_email,customer_phone,shipping_address,total_amount,status,razorpay_order_id,razorpay_payment_id,coupon_code,discount_amount,is_gift,gift_message,checkout_intent_id,storefront,is_test,payment_mode,shipping_amount,tax_breakdown,shipping_details)
  VALUES(v_customer->>'name',v_customer->>'email',v_customer->>'phone',v_customer->>'address',v_intent.total_amount,'paid',p_provider_order_id,p_payment_id,v_intent.coupon_code,v_intent.discount_amount,v_intent.is_gift,v_intent.gift_message,p_intent_id,v_intent.storefront,p_test_mode,CASE WHEN p_test_mode THEN 'test' ELSE 'live' END,v_intent.shipping_charge,v_intent.tax_breakdown,v_customer - 'terms_accepted_at') RETURNING id INTO v_order_id;
  INSERT INTO public.preview_order_items(order_id,line_index,product_id,quantity,unit_price,variant_id,variant_name,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(ordinality-1)::integer,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',value->>'variant_name',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items) WITH ORDINALITY;
  UPDATE public.preview_products p SET stock=p.stock-q.quantity,updated_at=clock_timestamp() FROM (SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb((variant->>'stock')::integer-v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants FROM public.preview_products p CROSS JOIN LATERAL jsonb_array_elements(p.commerce->'variants') WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    UPDATE public.preview_products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN UPDATE public.preview_coupons SET times_used=COALESCE(times_used,0)+1 WHERE code=v_intent.coupon_code; END IF;
  UPDATE public.preview_checkout_payments SET order_id=v_order_id,reason=NULL WHERE intent_id=p_intent_id;
  UPDATE public.preview_checkout_intents SET status='confirmed',reconciliation_reason=NULL,updated_at=now() WHERE id=p_intent_id;
  INSERT INTO public.preview_payment_notification_jobs(order_id,status) VALUES(v_order_id,CASE WHEN p_test_mode THEN 'suppressed_test' ELSE 'pending' END);
  -- Same transaction as the order: a rollback also rolls back the invoice counter, so the series stays gapless.
  PERFORM public.preview_assign_invoice_number(v_order_id);
  RETURN jsonb_build_object('status','confirmed','order_id',v_order_id,'created',true);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) TO service_role;
COMMIT;
