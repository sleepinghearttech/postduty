# PostDuty — Project Reference

E-commerce storefront selling healthcare worker gifts. Products, pricing, and descriptions are 100% database-driven — nothing hardcoded.

## Live URLs
- Production: https://postduty.jijo925.workers.dev
- GitHub: https://github.com/sleepinghearttech/postduty

## Tech Stack
- **Framework**: Next.js 15 App Router, TypeScript, Tailwind CSS
- **Deployment**: Cloudflare Workers via `@opennextjs/cloudflare` (NOT @cloudflare/next-on-pages — deprecated)
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Payments**: Razorpay (currently test mode — needs KYC for live)
- **Auto-deploy**: Git push to `master` → Cloudflare builds and deploys automatically

## Environment Variables
Never commit these. Set in `.env.local` locally and in Cloudflare dashboard for production.

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Build (Cloudflare) + .env.local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build (Cloudflare) + .env.local | Supabase public key (obeys RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime secret (Cloudflare) + .env.local | Supabase admin key (bypasses RLS) — server only |
| `RAZORPAY_KEY_ID` | Runtime (Cloudflare) + .env.local | Razorpay publishable key |
| `RAZORPAY_KEY_SECRET` | Runtime secret (Cloudflare) + .env.local | Razorpay secret — server only |
| `ADMIN_SECRET` | Runtime secret (Cloudflare) + .env.local | Admin panel password — server only |

`NEXT_PUBLIC_` vars are baked into the JS bundle at build time. The others are server-side only and must never have the `NEXT_PUBLIC_` prefix.

## Key Architecture Decisions
- **Price in paise** (integer) not rupees — avoids float rounding errors. ₹199 = 19900.
- **Two Supabase clients**: `supabase` (anon, obeys RLS, for reads) and `supabaseAdmin` (service role, bypasses RLS, for order writes and all admin operations). Both in `src/lib/supabase.ts`.
- **Razorpay via fetch** — no SDK. Uses Basic Auth with `btoa(keyId:keySecret)`.
- **Signature verification** uses `node:crypto` `createHmac` (not Web Crypto). Requires `nodejs_compat` flag in `wrangler.jsonc`.
- **Server Components** fetch data; **Client Components** (`"use client"`) handle the checkout form and Razorpay modal.
- **Admin auth**: cookie-based. Middleware checks `admin_session` cookie === `ADMIN_SECRET` env var. Cookie is httpOnly/secure/sameSite:strict/7-day. Every admin API route also checks the cookie independently (middleware only covers pages, not API routes).
- **New products default to `is_active = false`** — staged/hidden until stock confirmed and toggle activated.
- **Delete guard**: delete-product checks `order_items` for references before deleting. Products in past orders cannot be deleted; set `is_active = false` instead to hide from storefront while preserving order history.
- **Supabase Storage bucket `product-images`**: public read, service-role-only write. Public URL pattern: `{SUPABASE_URL}/storage/v1/object/public/product-images/{filename}`.

## Database (Supabase)
Project region: Mumbai (ap-south-1).

Tables: `products`, `orders`, `order_items`. Schema in `supabase/schema.sql`.

RLS is enabled on all tables. Key permissions:
- `GRANT SELECT ON products TO anon` — storefront can read active products
- `GRANT ALL ON orders/order_items/products TO service_role` — server can write orders

These GRANTs were run manually in Supabase SQL Editor (auto-expose was disabled at project creation).

Current products: 1 (Nurse Character Ampule Opener Keychain, ₹199, slug: `ampule-opener-nurse`)

## File Map
```
src/
  middleware.ts                     # Guards all /admin/* routes — checks admin_session cookie
  app/
    page.tsx                        # Homepage — product grid (Server Component)
    products/[slug]/page.tsx        # Product detail page (Server Component)
    order-success/page.tsx          # Post-payment success page
    admin/
      login/page.tsx                # Admin login form (Client Component)
      products/
        page.tsx                    # Admin products page — fetches all products server-side
        ProductsClient.tsx          # Interactive product cards, image upload, CRUD (Client Component)
    api/
      create-order/route.ts         # POST — creates Razorpay order, returns orderId + amount
      verify-payment/route.ts       # POST — verifies HMAC signature, saves order to Supabase
      admin/
        login/route.ts              # POST — checks password, sets admin_session cookie
        upload-image/route.ts       # POST — uploads file to Supabase Storage, returns public URL
        create-product/route.ts     # POST — creates product (price in rupees, converts to paise)
        update-product/route.ts     # POST — partial update by id
        delete-product/route.ts     # POST — deletes product; refuses if in any order_items row
  components/
    CheckoutForm.tsx                # Checkout form + Razorpay modal (Client Component)
  lib/
    supabase.ts                     # Two Supabase client instances
    types.ts                        # TypeScript types: Product, Order, OrderItem, OrderStatus
supabase/
  schema.sql                        # Full DB schema + RLS + GRANTs + seed data
wrangler.jsonc                      # Cloudflare Worker config (nodejs_compat flag required)
ADMIN_GUIDE.md                      # Plain-English guide for non-technical partner
```

## Completed Steps
- [x] Step 1: Next.js scaffold → GitHub → Cloudflare auto-deploy
- [x] Step 2: Supabase schema, RLS, seed product, client library
- [x] Step 3: Homepage product grid + product detail pages (live from DB)
- [x] Step 4: Razorpay checkout form, order creation, payment verification, order saved to DB
- [x] Step 5: Production debugging — env vars in Cloudflare, full payment flow verified live
- [x] Step 6: Password-protected admin panel — product CRUD, image upload, Supabase Storage

## Up Next
- [ ] Step 7: Admin dashboard — view and manage orders
- [ ] Step 8: Razorpay live mode (requires KYC on Razorpay account)

## Local Dev
```
cd "D:\Business plan\PostDuty\postduty"
npm run dev
```
Runs on http://localhost:3000

## Common Gotchas
- Run `npx tsc --noEmit` before pushing — Cloudflare CI fails on TypeScript errors
- `request.json()` returns `unknown` in TypeScript — always cast: `await request.json() as { field: type }`
- `.then((json: T) => ...)` doesn't type-narrow in TypeScript — use `await res.json() as T` instead
- Razorpay test card (domestic): `6073849700004947`, expiry `12/28`, CVV `123`, OTP `1234`
- Razorpay test UPI: `success@razorpay` (enable UPI in Razorpay dashboard first)
- Admin middleware only covers page routes. API routes under `/api/admin/*` each do their own cookie check.
- `ADMIN_SECRET` must be added to Cloudflare as a **Secret** (not plaintext variable) — Settings → Variables and Secrets
