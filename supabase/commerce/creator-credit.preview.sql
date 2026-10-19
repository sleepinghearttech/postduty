-- Creator credit: the owner may publish a creator's name before the creator accepts their invitation.
-- PREVIEW ONLY: preview/sandbox tables only (public.preview_* names, COMMERCE_SANDBOX=true).
-- PREPARED ONLY. Not applied anywhere. Never apply to production.
-- Apply AFTER checkout-phase-b.preview.sql. Single transaction; safe to re-run.
-- The production counterpart is creator-credit.production.sql; the two differ only in the preview_ prefix.
--
-- Changes only the public read policy: invited or active creators whose profile the owner has published.
-- Suspended creators are never public. Column grants, RLS and redeem_creator_invitation are unchanged.
BEGIN;
ALTER TABLE public.preview_creators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creators_public_profile ON public.preview_creators;
CREATE POLICY creators_public_profile ON public.preview_creators FOR SELECT TO anon,authenticated USING (status IN ('invited','active') AND profile_published);
COMMIT;
