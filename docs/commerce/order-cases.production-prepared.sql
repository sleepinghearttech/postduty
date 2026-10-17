-- PRODUCTION PREPARED ONLY. Requires explicit production release approval and existing commerce schema. DO NOT apply automatically.
-- Service cases are an approval ledger, not payment/order/stock operations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.order_cases (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK(kind IN ('cancellation','return','refund')),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','resolved')),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=4000),
  requested_amount_paise integer NOT NULL DEFAULT 0 CHECK(requested_amount_paise>=0),
  decision_note text NOT NULL DEFAULT '' CHECK(length(decision_note)<=4000),
  external_reference text CHECK(length(external_reference)<=250),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, rejected_at timestamptz, resolved_at timestamptz,
  CHECK(status<>'resolved' OR COALESCE(length(trim(external_reference)),0)>0)
);
ALTER TABLE public.order_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_cases FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.order_cases TO service_role;
CREATE INDEX IF NOT EXISTS order_cases_order_idx ON public.order_cases(order_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.save_order_case(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
DECLARE
  saved public.order_cases%ROWTYPE;
  before_status text;
  order_total integer;
  request_id uuid := (p_command->>'id')::uuid;
  action text := p_command->>'action';
  next_status text := p_command->>'next_status';
  amount integer;
  moment timestamptz := clock_timestamp();
BEGIN
  IF jsonb_typeof(p_command)<>'object' OR request_id IS NULL THEN RAISE EXCEPTION 'case_invalid_input'; END IF;
  IF action='create' THEN
    IF p_command->>'kind' IS NULL OR p_command->>'kind' NOT IN ('cancellation','return','refund')
      OR length(trim(COALESCE(p_command->>'reason',''))) NOT BETWEEN 1 AND 2000
      OR length(COALESCE(p_command->>'note',''))>4000 THEN RAISE EXCEPTION 'case_invalid_input'; END IF;
    amount := (p_command->>'requested_amount_paise')::integer;
    SELECT total_amount INTO order_total FROM public.orders WHERE id=(p_command->>'order_id')::uuid FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
    IF amount IS NULL OR amount<0 OR amount>order_total OR (p_command->>'kind'='refund' AND amount=0) THEN RAISE EXCEPTION 'case_amount_invalid'; END IF;
    INSERT INTO public.order_cases(id,order_id,kind,reason,note,requested_amount_paise,created_at,updated_at)
      VALUES(request_id,(p_command->>'order_id')::uuid,p_command->>'kind',trim(p_command->>'reason'),COALESCE(p_command->>'note',''),amount,moment,moment)
      ON CONFLICT(id) DO NOTHING RETURNING * INTO saved;
    IF NOT FOUND THEN
      SELECT * INTO saved FROM public.order_cases WHERE id=request_id FOR UPDATE;
      IF saved.order_id<>(p_command->>'order_id')::uuid OR saved.kind<>p_command->>'kind' OR saved.reason<>trim(p_command->>'reason') OR saved.note<>COALESCE(p_command->>'note','') OR saved.requested_amount_paise<>amount THEN RAISE EXCEPTION 'case_conflict'; END IF;
      RETURN to_jsonb(saved);
    END IF;
  ELSIF action='transition' THEN
    IF next_status IS NULL OR next_status NOT IN ('approved','rejected','resolved') OR length(COALESCE(p_command->>'note',''))>4000 OR length(COALESCE(p_command->>'external_reference',''))>250 THEN RAISE EXCEPTION 'case_invalid_input'; END IF;
    SELECT * INTO saved FROM public.order_cases WHERE id=request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
    IF saved.updated_at IS DISTINCT FROM (p_command->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'case_conflict'; END IF;
    IF NOT ((saved.status='requested' AND next_status IN ('approved','rejected')) OR (saved.status IN ('approved','rejected') AND next_status='resolved')) THEN RAISE EXCEPTION 'case_invalid_transition'; END IF;
    IF next_status='rejected' AND length(trim(COALESCE(p_command->>'note','')))=0 THEN RAISE EXCEPTION 'case_invalid_input'; END IF;
    IF next_status='resolved' AND length(trim(COALESCE(p_command->>'external_reference','')))=0 THEN RAISE EXCEPTION 'case_reference_required'; END IF;
    before_status := saved.status;
    UPDATE public.order_cases SET status=next_status,decision_note=COALESCE(p_command->>'note',''),
      external_reference=CASE WHEN next_status='resolved' THEN trim(p_command->>'external_reference') ELSE external_reference END,
      approved_at=CASE WHEN next_status='approved' THEN moment ELSE approved_at END,
      rejected_at=CASE WHEN next_status='rejected' THEN moment ELSE rejected_at END,
      resolved_at=CASE WHEN next_status='resolved' THEN moment ELSE resolved_at END,updated_at=moment
      WHERE id=request_id RETURNING * INTO saved;
  ELSE RAISE EXCEPTION 'case_invalid_input'; END IF;
  INSERT INTO public.audit_events(actor,action,entity_type,entity_id,details)
    VALUES('owner','order_case.'||CASE WHEN action='create' THEN 'requested' ELSE next_status END,'order_case',saved.id::text,
      jsonb_build_object('order_id',saved.order_id,'kind',saved.kind,'before_status',before_status,'status',saved.status,'requested_amount_paise',saved.requested_amount_paise,'manual_record_only',true));
  RETURN to_jsonb(saved);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_order_case(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_case(jsonb) TO service_role;
COMMIT;
