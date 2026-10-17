-- Checkout phase C: combos (bundles) and creator self-service product editing.
-- PREVIEW ONLY: preview/sandbox tables only (public.preview_* names, COMMERCE_SANDBOX=true).
-- PREPARED ONLY. Not applied anywhere. Never apply to production; never copy production data into preview.
-- Apply AFTER checkout-phase-b.preview.sql (and docs/commerce/creator-functions.sql). Single transaction; safe to re-run.
-- The production counterpart is checkout-phase-c.production.sql; the two differ only in the preview_ prefix and the
-- preview-only rejection of live payments.
--
-- Additive and backward compatible:
--   * new columns are NULL for existing order lines; existing orders and intents are unchanged;
--   * finalize_checkout_payment and close_unshipped_order keep their signatures; snapshot lines without
--     the new fields behave exactly as before (stock_tracked defaults to true);
--   * creator_submissions.kind defaults to 'new_product' for every existing submission;
--   * creator functions only ever copy creator-editable fields and never change price, publishing,
--     storefronts, catalog_only, fees, GST/HSN, variants, stock or combos.

BEGIN;
-- 1. Combos: a combo is its own product whose commerce.combo lists component products and quantities.
--    Order lines record the combo line (combo_role='combo', no stock of its own) followed by one line per
--    component (combo_role='component', combo_parent_line = the combo's line_index) carrying stock, tax,
--    fulfilment and the component creator's payout. Shipping counts the combo once.
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS combo_role text;
ALTER TABLE public.preview_order_items DROP CONSTRAINT IF EXISTS preview_order_items_combo_role_check;
ALTER TABLE public.preview_order_items ADD CONSTRAINT preview_order_items_combo_role_check CHECK (combo_role IS NULL OR combo_role IN ('combo','component'));
ALTER TABLE public.preview_order_items ADD COLUMN IF NOT EXISTS combo_parent_line integer CHECK (combo_parent_line IS NULL OR combo_parent_line>=0);

-- 2. Finalization: unchanged except that combo lines are availability-checked without stock, components
--    are stock-checked and decremented atomically with everything else, and order lines record combo roles.
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
  -- A combo line (stock_tracked=false) is checked for availability only; its component lines carry the stock.
  FOR v_line IN SELECT DISTINCT (value->>'product_id')::uuid AS product_id FROM jsonb_array_elements(v_intent.items) WHERE NOT COALESCE((value->>'stock_tracked')::boolean,true) LOOP
    SELECT * INTO v_product FROM public.preview_products WHERE id=v_line.product_id;
    IF NOT FOUND OR v_product.is_active IS NOT TRUE OR COALESCE((v_product.commerce->>'archived')::boolean,false) OR COALESCE((v_product.commerce->>'catalog_only')::boolean,false) THEN v_problem:='inventory_unavailable'; EXIT; END IF;
  END LOOP;
  FOR v_line IN SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE COALESCE((value->>'stock_tracked')::boolean,true) GROUP BY 1 LOOP
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
  INSERT INTO public.preview_order_items(order_id,line_index,combo_role,combo_parent_line,product_id,quantity,unit_price,variant_id,variant_name,personalization,creator_id,product_name,fulfillment_status,commission_bps,line_discount_amount,commission_amount,creator_earning_paise,earnings_creator_id)
  SELECT v_order_id,(ordinality-1)::integer,value->>'combo_role',(value->>'combo_parent_line')::integer,(value->>'product_id')::uuid,(value->>'quantity')::integer,(value->>'unit_price')::integer,value->>'variant_id',value->>'variant_name',CASE WHEN value->>'personalization' IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('text',value->>'personalization') END,(value->>'creator_id')::uuid,value->>'product_name','awaiting_acceptance',COALESCE((value->>'commission_bps')::integer,0),(value->>'line_discount_amount')::integer,(value->>'commission_amount')::integer,(value->>'creator_earning_paise')::integer,(value->>'creator_id')::uuid FROM jsonb_array_elements(v_intent.items) WITH ORDINALITY;
  UPDATE public.preview_products p SET stock=p.stock-q.quantity,updated_at=clock_timestamp() FROM (SELECT (value->>'product_id')::uuid AS product_id,SUM((value->>'quantity')::integer)::integer AS quantity FROM jsonb_array_elements(v_intent.items) WHERE COALESCE((value->>'stock_tracked')::boolean,true) GROUP BY 1) q WHERE p.id=q.product_id;
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

-- 3. Cancellation / refund before shipment: unchanged except that a combo line is not restocked itself;
--    its component lines are (cancel_paid_order and refund_order keep calling this function).
CREATE OR REPLACE FUNCTION public.preview_close_unshipped_order(p_order_id uuid,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.preview_orders%ROWTYPE;
  v_line record;
  v_variants jsonb;
BEGIN
  IF p_status NOT IN ('cancelled','refunded') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
  SELECT * INTO v_order FROM public.preview_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
  IF EXISTS(SELECT 1 FROM public.preview_order_items i WHERE i.order_id=p_order_id AND i.settlement_id IS NOT NULL) THEN RAISE EXCEPTION 'settled_lines_require_clawback'; END IF;
  -- Same deterministic lock order as finalization.
  PERFORM id FROM public.preview_products WHERE id IN (SELECT product_id FROM public.preview_order_items WHERE order_id=p_order_id AND combo_role IS DISTINCT FROM 'combo') ORDER BY id FOR UPDATE;
  UPDATE public.preview_products p SET stock=p.stock+q.quantity,updated_at=clock_timestamp()
    FROM (SELECT product_id,SUM(quantity)::integer AS quantity FROM public.preview_order_items WHERE order_id=p_order_id AND combo_role IS DISTINCT FROM 'combo' GROUP BY 1) q WHERE p.id=q.product_id;
  FOR v_line IN SELECT product_id,variant_id,SUM(quantity)::integer AS quantity FROM public.preview_order_items WHERE order_id=p_order_id AND variant_id IS NOT NULL GROUP BY 1,2 LOOP
    v_variants:=NULL;
    SELECT jsonb_agg(CASE WHEN variant->>'id'=v_line.variant_id THEN jsonb_set(variant,'{stock}',to_jsonb(COALESCE((variant->>'stock')::integer,0)+v_line.quantity)) ELSE variant END ORDER BY ordinal) INTO v_variants
      FROM public.preview_products p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.commerce->'variants','[]'::jsonb)) WITH ORDINALITY AS v(variant,ordinal) WHERE p.id=v_line.product_id;
    -- A variant removed since purchase only gets its parent stock back.
    IF v_variants IS NOT NULL THEN UPDATE public.preview_products SET commerce=jsonb_set(commerce,'{variants}',v_variants),updated_at=clock_timestamp() WHERE id=v_line.product_id; END IF;
  END LOOP;
  IF v_order.coupon_code IS NOT NULL THEN
    UPDATE public.preview_coupons SET times_used=GREATEST(COALESCE(times_used,0)-1,0) WHERE code=v_order.coupon_code;
  END IF;
  UPDATE public.preview_orders SET status=p_status,
    cancelled_at=CASE WHEN p_status='cancelled' THEN now() ELSE cancelled_at END,
    refunded_at=CASE WHEN p_status='refunded' THEN now() ELSE refunded_at END
    WHERE id=p_order_id RETURNING * INTO v_order;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','order.'||p_status,'order',p_order_id::text,jsonb_build_object('previous_status','paid','stock_restored',true,'coupon_released',v_order.coupon_code IS NOT NULL));
  RETURN to_jsonb(v_order);
END;
$$;

-- 4. Creator self-service. Creators edit only their own products and only these fields:
--    name, description, short_description, media, dimensions, materials, preparation_days, plus a proposed
--    price (recorded privately; never the selling price). Owner-only fields (price, publishing, storefronts,
--    catalog_only, commission/fees, GST/HSN, combos, variants, stock) are never read from creator input.
ALTER TABLE public.preview_creator_submissions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'new_product';
ALTER TABLE public.preview_creator_submissions DROP CONSTRAINT IF EXISTS preview_creator_submissions_kind_check;
ALTER TABLE public.preview_creator_submissions ADD CONSTRAINT preview_creator_submissions_kind_check CHECK (kind IN ('new_product','revision'));
-- At most one pending revision per live product; a new edit replaces the pending one.
CREATE UNIQUE INDEX IF NOT EXISTS preview_creator_submissions_pending_revision ON public.preview_creator_submissions(product_id) WHERE kind='revision' AND status='submitted';

-- Validates and keeps only the creator-editable keys. Raises on anything malformed.
CREATE OR REPLACE FUNCTION public.preview_creator_editable_fields(p_fields jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE v jsonb:='{}'::jsonb; m jsonb;
BEGIN
  IF p_fields IS NULL OR jsonb_typeof(p_fields)<>'object' THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
  IF p_fields ? 'name' THEN
    IF jsonb_typeof(p_fields->'name')<>'string' OR length(btrim(p_fields->>'name')) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('name',btrim(p_fields->>'name'));
  END IF;
  IF p_fields ? 'description' THEN
    IF jsonb_typeof(p_fields->'description')<>'string' OR length(p_fields->>'description')>20000 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('description',p_fields->>'description');
  END IF;
  IF p_fields ? 'short_description' THEN
    IF jsonb_typeof(p_fields->'short_description')<>'string' OR length(p_fields->>'short_description')>500 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('short_description',p_fields->>'short_description');
  END IF;
  IF p_fields ? 'materials' THEN
    IF jsonb_typeof(p_fields->'materials')<>'string' OR length(p_fields->>'materials')>2000 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('materials',p_fields->>'materials');
  END IF;
  IF p_fields ? 'dimensions' THEN
    IF jsonb_typeof(p_fields->'dimensions')<>'string' OR length(p_fields->>'dimensions')>500 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('dimensions',p_fields->>'dimensions');
  END IF;
  IF p_fields ? 'preparation_days' THEN
    IF jsonb_typeof(p_fields->'preparation_days')<>'number' OR (p_fields->>'preparation_days')::numeric<>trunc((p_fields->>'preparation_days')::numeric) OR (p_fields->>'preparation_days')::numeric NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('preparation_days',(p_fields->>'preparation_days')::integer);
  END IF;
  IF p_fields ? 'media' THEN
    m:=p_fields->'media';
    IF jsonb_typeof(m)<>'array' OR jsonb_array_length(m)>12 THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(m) e WHERE jsonb_typeof(e)<>'object' OR COALESCE(e->>'url','') !~ '^https://' OR length(e->>'url')>2048 OR COALESCE(e->>'type','') NOT IN ('image','video')) THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v:=v||jsonb_build_object('media',(SELECT COALESCE(jsonb_agg(jsonb_build_object('url',e->>'url','type',e->>'type','alt',left(COALESCE(e->>'alt',''),500))),'[]'::jsonb) FROM jsonb_array_elements(m) e));
  END IF;
  RETURN v;
END;
$$;

-- Product row with creator-editable fields applied (top-level name/description, the rest under commerce).
CREATE OR REPLACE FUNCTION public.preview_creator_apply_fields(p_product jsonb,p_fields jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
  SELECT (p_product - 'created_at' - 'updated_at')
    || jsonb_strip_nulls(jsonb_build_object('name',p_fields->'name','description',p_fields->'description'))
    || jsonb_build_object('commerce',COALESCE(p_product->'commerce','{}'::jsonb) || (p_fields - 'name' - 'description'))
    || CASE WHEN jsonb_typeof(p_fields->'media')='array' THEN jsonb_build_object('image_url',COALESCE((SELECT e->>'url' FROM jsonb_array_elements(p_fields->'media') e WHERE e->>'type'='image' LIMIT 1),p_product->>'image_url')) ELSE '{}'::jsonb END
$$;

CREATE OR REPLACE FUNCTION public.preview_creator_save_product(p_creator_id uuid,p_product_id uuid,p_fields jsonb,p_proposed_price integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_fields jsonb:=public.preview_creator_editable_fields(p_fields);
  v_product public.preview_products%ROWTYPE;
  v_operations jsonb;
  v_id uuid;
  v_saved jsonb;
  v_submission uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.preview_creators WHERE id=p_creator_id AND status='active') THEN RAISE EXCEPTION 'creator_not_active'; END IF;
  IF p_proposed_price IS NOT NULL AND p_proposed_price NOT BETWEEN 100 AND 100000000 THEN RAISE EXCEPTION 'invalid_proposed_price'; END IF;
  IF p_product_id IS NULL THEN
    -- New draft: always unpublished, unpriced and on the default storefront until the owner decides.
    IF NOT v_fields ? 'name' THEN RAISE EXCEPTION 'invalid_creator_fields'; END IF;
    v_id:=gen_random_uuid();
    SELECT public.preview_save_commerce_product(
      public.preview_creator_apply_fields(jsonb_build_object('id',v_id,'creator_id',p_creator_id,'price',0,'stock',0,'is_active',false,'image_url',NULL,'customisation_note',NULL,'description','',
        'slug',left(COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(v_fields->>'name'),'[^a-z0-9]+','-','g')),''),'creator-product'),100)||'-'||left(replace(v_id::text,'-',''),12),
        'commerce',jsonb_build_object('storefronts',jsonb_build_array('general'),'category','Creator collection')),v_fields),
      jsonb_build_object('license_status','unverified','source','creator_portal','proposed_price_rupees',CASE WHEN p_proposed_price IS NULL THEN NULL ELSE p_proposed_price/100.0 END),
      'create',NULL) INTO v_saved;
    INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES(p_creator_id::text,'creator.product_draft_created','product',v_id::text,jsonb_build_object('fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(v_fields) k),'proposed_price_paise',p_proposed_price));
    RETURN jsonb_build_object('mode','draft_created','product_id',v_id);
  END IF;
  SELECT * INTO v_product FROM public.preview_products WHERE id=p_product_id FOR UPDATE;
  -- The same error for a missing product and another creator's product: nothing about it is revealed.
  IF NOT FOUND OR v_product.creator_id IS DISTINCT FROM p_creator_id THEN RAISE EXCEPTION 'not_your_product'; END IF;
  IF COALESCE((v_product.commerce->>'archived')::boolean,false) THEN RAISE EXCEPTION 'product_archived'; END IF;
  IF v_product.is_active IS NOT TRUE THEN
    -- Unpublished draft: the creator's edit applies directly; the owner reviews it before publishing.
    SELECT COALESCE(details,'{}'::jsonb) INTO v_operations FROM public.preview_product_operations WHERE product_id=p_product_id;
    v_operations:=COALESCE(v_operations,'{}'::jsonb) || CASE WHEN p_proposed_price IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('proposed_price_rupees',p_proposed_price/100.0) END;
    SELECT public.preview_save_commerce_product(public.preview_creator_apply_fields(to_jsonb(v_product),v_fields),v_operations,'save',v_product.updated_at) INTO v_saved;
    INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES(p_creator_id::text,'creator.product_draft_updated','product',p_product_id::text,jsonb_build_object('fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(v_fields) k),'proposed_price_paise',p_proposed_price));
    RETURN jsonb_build_object('mode','draft_updated','product_id',p_product_id);
  END IF;
  -- Live product: the listing stays unchanged; the edit waits as one pending revision for owner approval.
  -- A later partial edit is merged into the pending one (its fields win), so earlier pending fields are kept.
  UPDATE public.preview_creator_submissions SET title=COALESCE(v_fields->>'name',details->>'name',v_product.name),proposed_price=COALESCE(p_proposed_price,proposed_price),details=COALESCE(details,'{}'::jsonb)||v_fields,updated_at=clock_timestamp()
    WHERE product_id=p_product_id AND kind='revision' AND status='submitted' RETURNING id INTO v_submission;
  IF v_submission IS NULL THEN
    INSERT INTO public.preview_creator_submissions(creator_id,product_id,title,proposed_price,details,status,kind)
      VALUES(p_creator_id,p_product_id,COALESCE(v_fields->>'name',v_product.name),COALESCE(p_proposed_price,0),v_fields,'submitted','revision') RETURNING id INTO v_submission;
  END IF;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES(p_creator_id::text,'creator.revision_submitted','submission',v_submission::text,jsonb_build_object('product_id',p_product_id,'fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(v_fields) k),'proposed_price_paise',p_proposed_price));
  RETURN jsonb_build_object('mode','revision_pending','product_id',p_product_id,'submission_id',v_submission);
END;
$$;

-- Owner's one-tap decision on a pending revision. Approval applies only the creator-editable fields
-- through save_commerce_product (which re-checks publication rules) and never changes the selling price.
CREATE OR REPLACE FUNCTION public.preview_review_creator_revision(p_submission_id uuid,p_status text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_submission public.preview_creator_submissions%ROWTYPE;
  v_product public.preview_products%ROWTYPE;
  v_operations jsonb;
  v_saved jsonb;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_review_status'; END IF;
  SELECT * INTO v_submission FROM public.preview_creator_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_submission.kind<>'revision' OR v_submission.status<>'submitted' THEN RAISE EXCEPTION 'revision_unavailable'; END IF;
  IF p_status='approved' THEN
    SELECT * INTO v_product FROM public.preview_products WHERE id=v_submission.product_id FOR UPDATE;
    IF NOT FOUND OR v_product.creator_id IS DISTINCT FROM v_submission.creator_id THEN RAISE EXCEPTION 'revision_unavailable'; END IF;
    SELECT COALESCE(details,'{}'::jsonb) INTO v_operations FROM public.preview_product_operations WHERE product_id=v_product.id;
    v_operations:=COALESCE(v_operations,'{}'::jsonb) || CASE WHEN v_submission.proposed_price>0 THEN jsonb_build_object('proposed_price_rupees',v_submission.proposed_price/100.0) ELSE '{}'::jsonb END;
    SELECT public.preview_save_commerce_product(public.preview_creator_apply_fields(to_jsonb(v_product),public.preview_creator_editable_fields(v_submission.details)),v_operations,'save',v_product.updated_at) INTO v_saved;
  END IF;
  UPDATE public.preview_creator_submissions SET status=p_status,owner_note=left(COALESCE(p_note,''),2000),updated_at=clock_timestamp() WHERE id=p_submission_id;
  INSERT INTO public.preview_audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','revision.'||p_status,'submission',p_submission_id::text,jsonb_build_object('product_id',v_submission.product_id,'creator_id',v_submission.creator_id));
  RETURN jsonb_build_object('status',p_status,'product_id',v_submission.product_id);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_creator_editable_fields(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_creator_editable_fields(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.preview_creator_apply_fields(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_creator_apply_fields(jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.preview_creator_save_product(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_creator_save_product(uuid,uuid,jsonb,integer) TO service_role;
REVOKE ALL ON FUNCTION public.preview_review_creator_revision(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_review_creator_revision(uuid,text,text) TO service_role;
COMMIT;
