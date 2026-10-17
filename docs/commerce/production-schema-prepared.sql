-- PREPARED ONLY: requires owner production release approval and verified backup/rollback.
-- Do not apply this as part of the isolated preview.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS commerce jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.products ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS storefront text NOT NULL DEFAULT 'general';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creator_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'awaiting_acceptance';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS courier text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS personalization jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS commission_bps integer NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS creator_earning_paise integer;
-- Commerce expansion: additive, no production records copied, no customer messages.
-- Tables are private unless a column-specific public grant is stated below.
CREATE TABLE IF NOT EXISTS public.creators (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE, email text NOT NULL UNIQUE,
 display_name text NOT NULL, bio text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended')),
 commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000), capacity integer CHECK(capacity>=0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.creator_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id),
 token_hash text NOT NULL UNIQUE,email text NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.commerce_memberships (
 user_id uuid PRIMARY KEY, role text NOT NULL CHECK(role IN ('owner','creator')),creator_id uuid REFERENCES public.creators(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((role='owner' AND creator_id IS NULL) OR (role='creator' AND creator_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text UNIQUE NOT NULL,description text,
 price integer NOT NULL CHECK(price>=0), image_url text,stock integer NOT NULL DEFAULT 0 CHECK(stock>=0),
 is_active boolean NOT NULL DEFAULT false,customisation_note text,created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),commerce jsonb NOT NULL DEFAULT '{}',creator_id uuid REFERENCES public.creators(id)
);
CREATE TABLE IF NOT EXISTS public.product_operations (
 product_id uuid PRIMARY KEY REFERENCES public.products(id),details jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_name text NOT NULL,customer_email text NOT NULL,customer_phone text NOT NULL,shipping_address text NOT NULL,
 total_amount integer NOT NULL CHECK(total_amount>=0),status text NOT NULL DEFAULT 'pending',razorpay_order_id text UNIQUE,razorpay_payment_id text UNIQUE,tracking_number text,
 coupon_code text,discount_amount integer NOT NULL DEFAULT 0,is_gift boolean NOT NULL DEFAULT false,gift_message text,
 delivered_at timestamptz,followup_day1_sent boolean NOT NULL DEFAULT false,followup_day5_sent boolean NOT NULL DEFAULT false,winback_sent boolean NOT NULL DEFAULT false,
 storefront text NOT NULL DEFAULT 'general' CHECK(storefront IN ('general','christmas')),is_test boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.products(id),quantity integer NOT NULL CHECK(quantity>0),unit_price integer NOT NULL CHECK(unit_price>=0),created_at timestamptz NOT NULL DEFAULT now(),
 creator_id uuid REFERENCES public.creators(id),fulfillment_status text NOT NULL DEFAULT 'awaiting_acceptance',tracking_number text,courier text,tracking_url text,
 personalization jsonb NOT NULL DEFAULT '{}',variant_id text,commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),creator_earning_paise integer CHECK(creator_earning_paise>=0)
);
CREATE TABLE IF NOT EXISTS public.coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,discount_type text NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent','flat')),
 discount_value integer NOT NULL CHECK(discount_value>=0),min_order integer NOT NULL DEFAULT 0,max_uses integer,times_used integer NOT NULL DEFAULT 0,
 expires_at timestamptz,referrer_code text,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.failed_order_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),razorpay_order_id text,razorpay_payment_id text,error text,payload jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.research_insights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,finding text NOT NULL,source_url text,researched_at timestamptz NOT NULL DEFAULT now(),
 confidence text NOT NULL DEFAULT 'low' CHECK(confidence IN ('low','medium','high')),expected_benefit text,effort text,risks text,next_action text,
 product_id uuid REFERENCES public.products(id),status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected','testing','completed')),
 evidence_type text NOT NULL DEFAULT 'hypothesis' CHECK(evidence_type IN ('fact','estimate','hypothesis')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor text NOT NULL,action text NOT NULL,entity_type text NOT NULL,entity_id text,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid NOT NULL REFERENCES public.creators(id),amount_paise integer NOT NULL CHECK(amount_paise>=0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid')),period_start date,period_end date,note text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.creator_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid NOT NULL REFERENCES public.creators(id),product_id uuid REFERENCES public.products(id),
 title text NOT NULL,proposed_price integer NOT NULL DEFAULT 0 CHECK(proposed_price>=0),details jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),owner_note text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
-- Product operations and creator/customer records are API-only; all authorization runs server-side.
DO $block$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['creators','creator_invites','commerce_memberships','products','product_operations','orders','order_items','coupons','failed_order_logs','research_insights','audit_events','settlements','creator_submissions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',''||tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',''||tbl);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',''||tbl);
 END LOOP;
END $block$;
-- Column-specific reads intentionally exclude legacy private supplier notes.
GRANT SELECT (id,name,slug,description,price,image_url,stock,is_active,created_at,updated_at,commerce,creator_id) ON public.products TO anon, authenticated;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "commerce_public_active_products" ON public.products;
CREATE POLICY "commerce_public_active_products" ON public.products FOR SELECT TO anon,authenticated USING(is_active=true AND COALESCE((commerce->>'archived')::boolean,false)=false);
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products(is_active);
CREATE INDEX IF NOT EXISTS products_creator_idx ON public.products(creator_id);
CREATE INDEX IF NOT EXISTS orders_created_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_creator_idx ON public.order_items(creator_id);
CREATE INDEX IF NOT EXISTS creator_invites_creator_idx ON public.creator_invites(creator_id);
CREATE INDEX IF NOT EXISTS creator_submissions_creator_idx ON public.creator_submissions(creator_id);
CREATE INDEX IF NOT EXISTS research_insights_product_idx ON public.research_insights(product_id);
CREATE INDEX IF NOT EXISTS settlements_creator_idx ON public.settlements(creator_id);

-- One transaction prevents publishing product changes without matching private approval data and audit.
CREATE OR REPLACE FUNCTION public.save_commerce_product(p_product jsonb,p_operations jsonb,p_action text,p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
 row_record public.products%ROWTYPE;
 existing_record public.products%ROWTYPE;
 active boolean;
 product_id uuid := (p_product->>'id')::uuid;
 editor jsonb := COALESCE(p_product->'commerce','{}'::jsonb);
BEGIN
 IF p_action NOT IN ('create','save','publish','unpublish','archive','duplicate') THEN RAISE EXCEPTION 'Invalid product action'; END IF;
 IF jsonb_typeof(p_operations) <> 'object' OR jsonb_typeof(editor) <> 'object' THEN RAISE EXCEPTION 'Invalid product data'; END IF;
 IF p_action IN ('create','duplicate') THEN
  active := false;
 ELSE
  SELECT * INTO existing_record FROM public.products WHERE id=product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF p_expected_updated_at IS NOT NULL AND existing_record.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'Product changed since read'; END IF;
  active := CASE WHEN p_action='publish' THEN true WHEN p_action IN ('unpublish','archive') THEN false ELSE existing_record.is_active END;
 END IF;
 IF p_action='archive' THEN editor := editor || '{"archived":true}'::jsonb; END IF;
 IF NULLIF(btrim(p_product->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Product name required'; END IF;
 IF active THEN
  IF (p_product->>'price')::integer<=0 OR COALESCE((editor->>'archived')::boolean,false) THEN RAISE EXCEPTION 'Product not publishable'; END IF;
  IF jsonb_typeof(editor->'storefronts') IS DISTINCT FROM 'array' OR jsonb_array_length(editor->'storefronts') NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Storefront required'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(editor->'storefronts') value WHERE value NOT IN ('general','christmas')) THEN RAISE EXCEPTION 'Invalid storefront'; END IF;
  IF NOT (COALESCE((editor->>'catalog_only')::boolean,false) AND COALESCE((p_operations->>'catalog_display_approved')::boolean,false)) AND COALESCE(p_operations->>'license_status','unverified') NOT IN ('owned','commercial_license','permission_verified','not_required') THEN RAISE EXCEPTION 'Commercial rights required'; END IF;
  IF NULLIF(p_product->>'image_url','') IS NULL THEN RAISE EXCEPTION 'Photo required'; END IF;
 END IF;
 IF p_action IN ('create','duplicate') THEN
  INSERT INTO public.products(id,name,slug,description,price,image_url,stock,is_active,customisation_note,commerce,creator_id)
  VALUES(product_id,p_product->>'name',p_product->>'slug',p_product->>'description',(p_product->>'price')::integer,p_product->>'image_url',(p_product->>'stock')::integer,false,p_product->>'customisation_note',editor,(p_product->>'creator_id')::uuid)
  RETURNING * INTO row_record;
 ELSE
  UPDATE public.products SET name=p_product->>'name',slug=p_product->>'slug',description=p_product->>'description',price=(p_product->>'price')::integer,
   image_url=p_product->>'image_url',stock=(p_product->>'stock')::integer,is_active=active,customisation_note=p_product->>'customisation_note',commerce=editor,
   creator_id=(p_product->>'creator_id')::uuid,updated_at=clock_timestamp() WHERE id=product_id RETURNING * INTO row_record;
 END IF;
 INSERT INTO public.product_operations(product_id,details,updated_at) VALUES(product_id,p_operations,clock_timestamp())
 ON CONFLICT ON CONSTRAINT product_operations_pkey DO UPDATE SET details=EXCLUDED.details,updated_at=EXCLUDED.updated_at;
 INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details) VALUES('owner','product.'||p_action,'product',product_id::text,jsonb_build_object('is_active',active,'storefronts',editor->'storefronts'));
 RETURN to_jsonb(row_record)||jsonb_build_object('operations',p_operations);
END $function$;
REVOKE ALL ON FUNCTION public.save_commerce_product(jsonb,jsonb,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_commerce_product(jsonb,jsonb,text,timestamptz) TO service_role;
