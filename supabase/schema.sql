-- ============================================================
-- PostDuty Database Schema
-- Run this once in the Supabase SQL Editor to set up all tables.
-- ============================================================


-- ------------------------------------------------------------
-- PRODUCTS
-- The single source of truth for everything sold on the site.
-- No product data lives anywhere else.
-- ------------------------------------------------------------
CREATE TABLE products (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  slug             text        UNIQUE NOT NULL,
  description      text,
  price            integer     NOT NULL,         -- stored in paise (100 paise = ₹1)
  image_url        text,
  stock            integer     DEFAULT 0,
  is_active        boolean     DEFAULT true,
  customisation_note text,                       -- supplier/sourcing notes, never shown to customers
  created_at       timestamptz DEFAULT now()
);


-- ------------------------------------------------------------
-- ORDERS
-- One row per customer order.
-- ------------------------------------------------------------
CREATE TABLE orders (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name        text    NOT NULL,
  customer_email       text    NOT NULL,
  customer_phone       text    NOT NULL,
  shipping_address     text    NOT NULL,
  total_amount         integer NOT NULL,         -- paise
  status               text    DEFAULT 'pending', -- pending → paid → shipped
  razorpay_order_id    text,
  razorpay_payment_id  text,
  tracking_number      text,
  created_at           timestamptz DEFAULT now()
);


-- ------------------------------------------------------------
-- ORDER ITEMS
-- Each product line within an order.
-- Linked to both orders and products via foreign keys.
-- ------------------------------------------------------------
CREATE TABLE order_items (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid    NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
  product_id  uuid    NOT NULL REFERENCES products(id),
  quantity    integer NOT NULL,
  unit_price  integer NOT NULL,   -- paise, snapshotted at purchase time
  created_at  timestamptz DEFAULT now()
);


-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Supabase locks every table by default when RLS is enabled.
-- We explicitly grant only what the public should see.
-- ------------------------------------------------------------

-- Products: anyone can read active products (the storefront needs this)
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active products"
  ON products
  FOR SELECT
  USING (is_active = true);

-- orders and order_items have NO public policies.
-- They are only written by the server using the service role key,
-- which bypasses RLS entirely — so no policy needed for writes.


-- ------------------------------------------------------------
-- SEED DATA — initial product
-- ------------------------------------------------------------
INSERT INTO products (name, slug, description, price, stock, is_active, customisation_note)
VALUES (
  'Nurse Character Ampule Opener Keychain',
  'ampule-opener-nurse',
  'A fun nurse-character keychain that doubles as a handy ampule opener — the perfect gift for nurses and healthcare workers. Fits 1–2ml ampoules.',
  19900,
  30,
  true,
  'Supplier: Zhongshan Mchic Plastic Products Co. (Alibaba, verified 12yr). MOQ 30 units at ~₹145/pc + ₹1520 freight. Customisation available.'
);
