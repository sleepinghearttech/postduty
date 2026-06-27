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

`NEXT_PUBLIC_` vars are baked into the JS bundle at build time. The others are server-side only and must never have the `NEXT_PUBLIC_` prefix.

## Key Architecture Decisions
- **Price in paise** (integer) not rupees — avoids float rounding errors. ₹199 = 19900.
- **Two Supabase clients**: `supabase` (anon, obeys RLS, for reads) and `supabaseAdmin` (service role, bypasses RLS, for order writes). Both in `src/lib/supabase.ts`.
- **Razorpay via fetch** — no SDK. Uses Basic Auth with `btoa(keyId:keySecret)`.
- **Signature verification** uses `node:crypto` `createHmac` (not Web Crypto). Requires `nodejs_compat` flag in `wrangler.jsonc`.
- **Server Components** fetch data; **Client Components** (`"use client"`) handle the checkout form and Razorpay modal.

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
  app/
    page.tsx                        # Homepage — product grid (Server Component)
    products/[slug]/page.tsx        # Product detail page (Server Component)
    order-success/page.tsx          # Post-payment success page
    api/
      create-order/route.ts         # POST — creates Razorpay order, returns orderId + amount
      verify-payment/route.ts       # POST — verifies HMAC signature, saves order to Supabase
  components/
    CheckoutForm.tsx                # Checkout form + Razorpay modal (Client Component)
  lib/
    supabase.ts                     # Two Supabase client instances
    types.ts                        # TypeScript types: Product, Order, OrderItem, OrderStatus
supabase/
  schema.sql                        # Full DB schema + RLS + GRANTs + seed data
wrangler.jsonc                      # Cloudflare Worker config (nodejs_compat flag required)
```

## Completed Steps
- [x] Step 1: Next.js scaffold → GitHub → Cloudflare auto-deploy
- [x] Step 2: Supabase schema, RLS, seed product, client library
- [x] Step 3: Homepage product grid + product detail pages (live from DB)
- [x] Step 4: Razorpay checkout form, order creation, payment verification, order saved to DB
- [x] Step 5: Production debugging — env vars in Cloudflare, full payment flow verified live

## Up Next
- [ ] Step 6: Product images via Supabase Storage
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
- Razorpay test card (domestic): `6073849700004947`, expiry `12/28`, CVV `123`, OTP `1234`
- Razorpay test UPI: `success@razorpay` (enable UPI in Razorpay dashboard first)
