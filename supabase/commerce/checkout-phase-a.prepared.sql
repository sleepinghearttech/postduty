-- Checkout phase A: shipping charge, GST snapshot, structured delivery address, order cancellation/refund states.
-- PREPARED ONLY. Not applied anywhere. Owner approval is required before applying to production.
--
-- Apply exactly ONE section, in the SQL editor of the matching environment, AFTER
-- supabase/commerce/payment-supplement.<environment>.sql (and the base commerce schema) are in place:
--   * PRODUCTION section -> production project (public.* names)
--   * PREVIEW section    -> preview/sandbox tables (public.preview_* names, COMMERCE_SANDBOX=true)
-- Each section is a single transaction and is safe to re-run.
--
-- Additive and backward compatible:
--   * new columns default to 0 / NULL, so the historical orders and intents keep their values unchanged;
--   * the intent total CHECK becomes total_amount = subtotal + gift_charge + shipping_charge - discount_amount,
--     which every existing row already satisfies because shipping_charge defaults to 0;
--   * discount_amount <= subtotal is added NOT VALID (new rows only), so shipping is never discounted;
--   * finalize_checkout_payment keeps its signature; cancel_paid_order is new.
-- Deploy order: apply this migration BEFORE releasing the application code that writes shipping_charge.
-- The two sections differ only in the preview_ prefix and the preview-only rejection of live payments.

-- ============================================================================
-- PRODUCTION SECTION (public.*)
-- ============================================================================
BEGIN;
-- 1. Shipping charge and tax snapshot on checkout intents. Existing intents get 0 / NULL.
ALTER TABLE public.checkout_intents ADD COLUMN IF NOT EXISTS shipping_charge integer NOT NULL DEFAULT 0 CHECK (shipping_charge>=0);
ALTER TABLE public.checkout_intents ADD COLUMN IF NOT EXISTS tax_breakdown jsonb CHECK (tax_breakdown IS NULL OR jsonb_typeof(tax_breakdown)='object');
-- Replace the unnamed original total CHECK (subtotal + gift_charge - discount_amount) with a named one that includes shipping.
DO $do$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.checkout_intents'::regclass AND contype='c'
      AND regexp_replace(pg_get_constraintdef(oid),'[[:space:]()]','','g')='CHECKtotal_amount=subtotal+gift_charge-discount_amount'
  LOOP
    EXECUTE format('ALTER TABLE public.checkout_intents DROP CONSTRAINT %I',c.conname);
  END LOOP;
END
$do$;
ALTER TABLE public.checkout_intents DROP CONSTRAINT IF EXISTS checkout_intents_total_consistency;
ALTER TABLE public.checkout_intents ADD CONSTRAINT checkout_intents_total_consistency CHECK (total_amount=subtotal+gift_charge+shipping_charge-discount_amount);
-- Coupons discount merchandise only, so shipping (and the gift card) can never be discounted below zero.
-- NOT VALID: enforced for every new intent without re-checking historical rows.
ALTER TABLE public.checkout_intents DROP CONSTRAINT IF EXISTS checkout_intents_discount_within_subtotal;
ALTER TABLE public.checkout_intents ADD CONSTRAINT checkout_intents_discount_within_subtotal CHECK (discount_amount<=subtotal) NOT VALID;

-- 2. Orders: shipping, tax breakdown, structured address and lifecycle timestamps. Legacy orders keep 0 / NULL.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_amount integer NOT NULL DEFAULT 0 CHECK (shipping_amount>=0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_breakdown jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_details jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
-- Option name snapshot so renamed/removed variants still print correctly.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- 3. Finalization copies shipping, tax snapshot and structured address into the order. Signature unchanged.
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
  INSERT INTO public.order_items(order_id,product_id,quantity,unit_price,variant_id,variant_name,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',value->>'variant_name',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items);
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

-- 4. Owner cancellation of a paid order: one transaction checks the status, returns stock
--    (parent and variant) and records the change. It never refunds money; refunds are made
--    in the payment provider and recorded separately as status 'refunded' (no stock change).
CREATE OR REPLACE FUNCTION public.cancel_paid_order(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line record;
  v_variants jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
  -- Same deterministic lock order as finalization.
  PERFORM id FROM public.products WHERE id IN (SELECT product_id FROM public.order_items WHERE order_id=p_order_id) ORDER BY id FOR UPDATE;
  UPDATE public.products p SET stock=p.stock+q.quantity,updated_at=clock_timestamp()
    FROM (SELECT product_id,SUM(quantity)::integer AS quantity FROM public.order_items WHERE order_id=p_order_id GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT product_id,variant_id,SUM(quantity)::integer AS quantity FROM public.order_items WHERE order_id=p_order_id AND variant_id IS NOT NULL GROUP BY 1,2 LOOP
    v_variants:=NULL;
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb(COALESCE((variant->>'stock')::integer,0)+v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants
      FROM public.products p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.commerce->'variants','[]'::jsonb)) WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    -- A variant removed since purchase only gets its parent stock back.
    IF v_variants IS NOT NULL THEN UPDATE public.products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id; END IF;
  END LOOP;
  UPDATE public.orders SET status='cancelled',cancelled_at=now() WHERE id=p_order_id RETURNING * INTO v_order;
  INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','order.cancelled','order',p_order_id::text,jsonb_build_object('previous_status','paid','stock_restored',true));
  RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_paid_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_paid_order(uuid) TO service_role;
COMMIT;

-- ============================================================================
-- PREVIEW SECTION (public.preview_*)
-- ============================================================================
BEGIN;
-- 1. Shipping charge and tax snapshot on checkout intents. Existing intents get 0 / NULL.
ALTER TABLE public.preview_checkout_intents ADD COLUMN IF NOT EXISTS shipping_charge integer NOT NULL DEFAULT 0 CHECK (shipping_charge>=0);
ALTER TABLE public.preview_checkout_intents ADD COLUMN IF NOT EXISTS tax_breakdown jsonb CHECK (tax_breakdown IS NULL OR jsonb_typeof(tax_breakdown)='object');
-- Replace the unnamed original total CHECK (subtotal + gift_charge - discount_amount) with a named one that includes shipping.
DO $do$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.preview_checkout_intents'::regclass AND contype='c'
      AND regexp_replace(pg_get_constraintdef(oid),'[[:space:]()]','','g')='CHECKtotal_amount=subtotal+gift_charge-discount_amount'
  LOOP
    EXECUTE format('ALTER TABLE public.preview_checkout_intents DROP CONSTRAINT %I',c.conname);
  END LOOP;
END
$do$;
ALTER TABLE public.preview_checkout_intents DROP CONSTRAINT IF EXISTS preview_checkout_intents_total_consistency;
ALTER TABLE public.preview_checkout_intents ADD CONSTRAINT preview_checkout_intents_total_consistency CHECK (total_amount=subtotal+gift_charge+shipping_charge-discount_amount);
-- Coupons discount merchandise only, so shipping (and the gift card) can never be discounted below zero.
-- NOT VALID: enforced for every new intent without re-checking historical rows.
ALTER TABLE public.preview_checkout_intents DROP CONSTRAINT IF EXISTS preview_checkout_intents_discount_within_subtotal;
ALTER TABLE public.preview_checkout_intents ADD CONSTRAINT preview_checkout_intents_discount_within_subtotal CHECK (discount_amount<=subtotal) NOT VALID;

-- 2. Orders: shipping, tax breakdown, structured address and lifecycle timestamps. Legacy orders keep 0 / NULL.
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS shipping_amount integer NOT NULL DEFAULT 0 CHECK (shipping_amount>=0);
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS tax_breakdown jsonb;
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS shipping_details jsonb;
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.preview_orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
-- Option name snapshot so renamed/removed variants still print correctly.
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- 3. Finalization copies shipping, tax snapshot and structured address into the order. Signature unchanged.
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
  INSERT INTO public.preview_order_items(order_id,product_id,quantity,unit_price,variant_id,variant_name,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',value->>'variant_name',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items);
  UPDATE public.preview_products p SET stock=p.stock-q.quantity,updated_at=clock_timestamp() FROM (SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,value->>'variant_id' AS variant_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE value->>'variant_id' IS NOT NULL GROUP BY 1,2 LOOP
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb((variant->>'stock')::integer-v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants FROM public.preview_products p CROSS JOIN LATERAL jsonb_array_elements(p.commerce->'variants') WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    UPDATE public.preview_products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id;
  END LOOP;
  IF v_intent.coupon_code IS NOT NULL THEN UPDATE public.preview_coupons SET times_used=COALESCE(times_used,0)+1 WHERE code=v_intent.coupon_code; END IF;
  UPDATE public.preview_checkout_payments SET order_id=v_order_id,reason=NULL WHERE intent_id=p_intent_id;
  UPDATE public.preview_checkout_intents SET status='confirmed',reconciliation_reason=NULL,updated_at=now() WHERE id=p_intent_id;
  INSERT INTO public.preview_payment_notification_jobs(order_id,status) VALUES(v_order_id,CASE WHEN p_test_mode THEN 'suppressed_test' ELSE 'pending' END);
  RETURN jsonb_build_object('status','confirmed','order_id',v_order_id,'created',true);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_finalize_checkout_payment(uuid,text,text,integer,text,boolean,jsonb) TO service_role;

-- 4. Owner cancellation of a paid order: one transaction checks the status, returns stock
--    (parent and variant) and records the change. It never refunds money; refunds are made
--    in the payment provider and recorded separately as status 'refunded' (no stock change).
CREATE OR REPLACE FUNCTION public.preview_cancel_paid_order(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.preview_orders%ROWTYPE;
  v_line record;
  v_variants jsonb;
BEGIN
  SELECT * INTO v_order FROM public.preview_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
  -- Same deterministic lock order as finalization.
  PERFORM id FROM public.preview_products WHERE id IN (SELECT product_id FROM public.preview_order_items WHERE order_id=p_order_id) ORDER BY id FOR UPDATE;
  UPDATE public.preview_products p SET stock=p.stock+q.quantity,updated_at=clock_timestamp()
    FROM (SELECT product_id,SUM(quantity)::integer AS quantity FROM public.preview_order_items WHERE order_id=p_order_id GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT product_id,variant_id,SUM(quantity)::integer AS quantity FROM public.preview_order_items WHERE order_id=p_order_id AND variant_id IS NOT NULL GROUP BY 1,2 LOOP
    v_variants:=NULL;
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb(COALESCE((variant->>'stock')::integer,0)+v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants
      FROM public.preview_products p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.commerce->'variants','[]'::jsonb)) WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    -- A variant removed since purchase only gets its parent stock back.
    IF v_variants IS NOT NULL THEN UPDATE public.preview_products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id; END IF;
  END LOOP;
  UPDATE public.preview_orders SET status='cancelled',cancelled_at=now() WHERE id=p_order_id RETURNING * INTO v_order;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','order.cancelled','order',p_order_id::text,jsonb_build_object('previous_status','paid','stock_restored',true));
  RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_cancel_paid_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_cancel_paid_order(uuid) TO service_role;
COMMIT;
