-- ============================================================
-- PostDuty Migration: Coupons, Gifting, Delivery Tracking
-- Run this in the Supabase SQL Editor (one-time migration).
-- Safe to run even if some columns already exist (uses IF NOT EXISTS).
-- ============================================================


-- ------------------------------------------------------------
-- COUPONS TABLE
-- Supports % and flat-₹ discounts, usage limits, expiry,
-- and ambassador referral linking.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        UNIQUE NOT NULL,         -- e.g. 'WELCOME10', 'DR-ANIL'
  discount_type   text        NOT NULL DEFAULT 'percent',  -- 'percent' or 'flat'
  discount_value  integer     NOT NULL,                -- percent (10 = 10%) or paise (5000 = ₹50)
  min_order       integer     DEFAULT 0,               -- minimum cart total in paise to apply
  max_uses        integer,                             -- NULL = unlimited
  times_used      integer     DEFAULT 0,
  expires_at      timestamptz,                         -- NULL = never expires
  referrer_code   text,                                -- links to ambassador ref code, if any
  is_active       boolean     DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
GRANT ALL ON coupons TO service_role;


-- ------------------------------------------------------------
-- ORDERS TABLE — add coupon, gift, and delivery tracking columns
-- Uses DO block to safely add columns that may not exist yet.
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Coupon tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='coupon_code') THEN
    ALTER TABLE orders ADD COLUMN coupon_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='discount_amount') THEN
    ALTER TABLE orders ADD COLUMN discount_amount integer DEFAULT 0;
  END IF;

  -- Gift option
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='is_gift') THEN
    ALTER TABLE orders ADD COLUMN is_gift boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='gift_message') THEN
    ALTER TABLE orders ADD COLUMN gift_message text;
  END IF;

  -- Delivery & follow-up tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivered_at') THEN
    ALTER TABLE orders ADD COLUMN delivered_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='followup_day1_sent') THEN
    ALTER TABLE orders ADD COLUMN followup_day1_sent boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='followup_day5_sent') THEN
    ALTER TABLE orders ADD COLUMN followup_day5_sent boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='winback_sent') THEN
    ALTER TABLE orders ADD COLUMN winback_sent boolean DEFAULT false;
  END IF;
END $$;


-- ------------------------------------------------------------
-- SEED COUPONS — starter codes for soft launch
-- ------------------------------------------------------------
INSERT INTO coupons (code, discount_type, discount_value, min_order, max_uses, referrer_code)
VALUES
  ('WELCOME10', 'percent', 10, 0, NULL, NULL),           -- 10% off, unlimited uses, no minimum
  ('POSTDUTY50', 'flat', 5000, 39900, NULL, NULL),        -- ₹50 off orders ≥ ₹399
  ('INTERN20', 'percent', 20, 0, 50, NULL)                -- 20% off, limited to 50 uses (soft launch friends)
ON CONFLICT (code) DO NOTHING;  -- safe to re-run
