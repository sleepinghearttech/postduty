-- PREVIEW ONLY. Root applies to the approved isolated preview after base schema.
-- Explicit preview-only prefix; no production tables or functions are changed.
-- One-time invitation redemption is atomic and never grants owner permissions.
-- Only service_role may call; caller must first verify Google identity server-side.
DO $outer$
DECLARE table_prefix text;
BEGIN
  FOREACH table_prefix IN ARRAY ARRAY['preview_'] LOOP
    EXECUTE format($sql$
      CREATE OR REPLACE FUNCTION public.%I(p_token_hash text, p_user_id uuid, p_email text)
      RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $body$
      DECLARE invitation record; creator record;
      BEGIN
        IF p_user_id IS NULL OR length(p_token_hash) <> 64 OR p_email IS NULL THEN
          RAISE EXCEPTION 'Invalid invitation';
        END IF;
        SELECT * INTO invitation FROM public.%I
          WHERE token_hash = p_token_hash AND email = lower(trim(p_email))
          AND accepted_at IS NULL AND expires_at > now() FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
        SELECT * INTO creator FROM public.%I
          WHERE id = invitation.creator_id AND email = lower(trim(p_email))
          AND status = 'invited' AND user_id IS NULL FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
        UPDATE public.%I SET user_id = p_user_id, status = 'active' WHERE id = creator.id;
        INSERT INTO public.%I(user_id, role, creator_id, status)
          VALUES (p_user_id, 'creator', creator.id, 'active');
        UPDATE public.%I SET accepted_at = now() WHERE id = invitation.id;
        INSERT INTO public.%I(actor, action, entity_type, entity_id, details)
          VALUES (p_user_id::text, 'creator_invitation_redeemed', 'creator', creator.id::text, '{}'::jsonb);
        RETURN creator.id;
      END;
      $body$;
    $sql$, table_prefix || 'redeem_creator_invitation', table_prefix || 'creator_invites', table_prefix || 'creators', table_prefix || 'creators', table_prefix || 'commerce_memberships', table_prefix || 'creator_invites', table_prefix || 'audit_events');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text, uuid, text) FROM PUBLIC, anon, authenticated', table_prefix || 'redeem_creator_invitation');
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(text, uuid, text) TO service_role', table_prefix || 'redeem_creator_invitation');
  END LOOP;
END;
$outer$;

-- Review and draft creation commit together. A rejected or concurrently reviewed
-- submission can never leave a newly approved draft behind.
DO $outer$
DECLARE table_prefix text;
BEGIN
  FOREACH table_prefix IN ARRAY ARRAY['preview_'] LOOP
    EXECUTE format($sql$
      CREATE OR REPLACE FUNCTION public.%I(p_submission_id uuid, p_status text, p_price_paise integer, p_note text)
      RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $body$
      DECLARE submission record; draft_id uuid; draft jsonb; operations jsonb; saved jsonb; image_url text;
      BEGIN
        IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
        SELECT * INTO submission FROM public.%I WHERE id = p_submission_id FOR UPDATE;
        IF NOT FOUND OR submission.status <> 'submitted' THEN RAISE EXCEPTION 'Submission already reviewed or unavailable'; END IF;
        draft_id := submission.product_id;
        IF p_status = 'approved' THEN
          IF submission.product_id IS NOT NULL THEN RAISE EXCEPTION 'Existing product edits require owner product editor'; END IF;
          IF p_price_paise IS NULL OR p_price_paise < 100 OR p_price_paise > 100000000 THEN RAISE EXCEPTION 'Invalid approved price'; END IF;
          draft_id := submission.id;
          SELECT value->>'url' INTO image_url FROM jsonb_array_elements(COALESCE(submission.details->'media','[]'::jsonb)) value WHERE value->>'type'='image' LIMIT 1;
          draft := jsonb_build_object(
            'id',draft_id,'creator_id',submission.creator_id,'name',submission.title,
            'slug',trim(trailing '-' from left(COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(submission.title),'[^a-z0-9]+','-','g')),''),'creator-product'),100))||'-'||replace(submission.id::text,'-',''),
            'description',COALESCE(submission.details->>'description',''),'price',p_price_paise,'stock',COALESCE((submission.details->>'stock')::integer,0),
            'image_url',image_url,'is_active',false,
            'commerce',jsonb_build_object('category',COALESCE(submission.details->>'category','Creator collection'),'storefronts',COALESCE(submission.details->'storefronts','["general"]'::jsonb),
              'materials',COALESCE(submission.details->>'materials',''),'media',COALESCE(submission.details->'media','[]'::jsonb),
              'preparation_days',COALESCE((submission.details->>'preparation_days')::integer,0),'made_to_order',COALESCE((submission.details->>'made_to_order')::boolean,false))
          );
          operations := jsonb_build_object('proposed_price_rupees',submission.proposed_price / 100.0,'license_status','unverified',
            'production_notes',COALESCE(submission.details->>'production_notes',''),'source_submission_id',submission.id,'source_product_id',submission.product_id);
          SELECT public.%I(draft, operations, 'create', NULL) INTO saved;
        END IF;
        UPDATE public.%I SET status=p_status,product_id=draft_id,owner_note=left(COALESCE(p_note,''),2000),updated_at=clock_timestamp() WHERE id=submission.id;
        INSERT INTO public.%I(actor,action,entity_type,entity_id,details)
          VALUES('owner','submission.'||p_status,'submission',submission.id::text,jsonb_build_object('product_id',draft_id,'approved_price_paise',CASE WHEN p_status='approved' THEN p_price_paise ELSE NULL END));
        RETURN jsonb_build_object('product_id',draft_id,'status',p_status);
      END;
      $body$;
    $sql$, table_prefix||'review_creator_submission',table_prefix||'creator_submissions',table_prefix||'save_commerce_product',table_prefix||'creator_submissions',table_prefix||'audit_events');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid,text,integer,text) FROM PUBLIC,anon,authenticated',table_prefix||'review_creator_submission');
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid,text,integer,text) TO service_role',table_prefix||'review_creator_submission');
  END LOOP;
END;
$outer$;
