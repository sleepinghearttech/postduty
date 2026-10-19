-- Creator credit: the owner may publish a creator's name before the creator accepts their invitation.
-- PRODUCTION ONLY: production project (public.* names).
-- PREPARED ONLY. Not applied anywhere. Owner approval is required before applying.
-- Apply AFTER checkout-phase-b.production.sql. Single transaction; safe to re-run.
-- The preview counterpart is creator-credit.preview.sql; the two differ only in the preview_ prefix.
--
-- Changes only the public read policy: invited or active creators whose profile the owner has published.
-- Suspended creators are never public. Column grants, RLS and redeem_creator_invitation are unchanged.
BEGIN;
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creators_public_profile ON public.creators;
CREATE POLICY creators_public_profile ON public.creators FOR SELECT TO anon,authenticated USING (status IN ('invited','active') AND profile_published);
COMMIT;
