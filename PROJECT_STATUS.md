# PostDuty — Master Project Status

> A complete overview of what we have built, what is active, and what needs to be done next to launch the store. This document is written in plain English so the entire team (technical & business) can track progress.
>
> **Last Updated:** 7 July 2026  
> **Team:** J (Jijo — tech/strategy), P (Partner — Delhi operations/KYC), F (Friend — sourcing assistant)

---

## 📊 Summary of Current Status

| Item | Value |
| :--- | :--- |
| **Store URL (Dev)** | http://localhost:3000 |
| **Store URL (Production)** | https://postduty.jijo925.workers.dev |
| **Store URL (Final)** | https://postduty.in *(domain not yet purchased)* |
| **Payments** | Razorpay **test mode** — needs KYC to go live |
| **WhatsApp API** | Working on Meta test number `+1 555-196-6692` — needs a real SIM for production |
| **Email** | Working via Resend sandbox — needs custom domain for delivery to all customers |
| **Database** | Supabase (Mumbai region) — live and working |
| **Overall Status** | 🟢 **Technical spine is 100% complete.** Blocked on KYC + domain to go live. |

---

## ✅ Phase 1: Tech & Code Setup — COMPLETE

The core website, payment system, and database are complete and tested.

| Task | Status | Details |
| :--- | :--- | :--- |
| Storefront Website | ✅ Done | Product display, detail pages, dynamic pricing from database, Plus Jakarta Sans typography. |
| Razorpay Integration | ✅ Done | Checkout form and payment gateway. Verified working in test mode. |
| Supabase Database | ✅ Done | `products`, `orders`, `order_items` tables with RLS. Mumbai region. |
| Admin Panel | ✅ Done | Secure login panel to manage products (CRUD), change stock, upload photos, and view orders. |
| Order Dashboard | ✅ Done | Dashboard for viewing paid orders, changing status (paid → shipped), saving AWB tracking numbers. |
| Webhook Recovery Safety Net | ✅ Done | Auto-creates orders in the DB if a user closes their browser tab mid-checkout. |
| Race-Condition Fix | ✅ Done | Resolved a bug where webhooks could lock out customer checkout data. Details now merge via idempotency. |

---

## ✅ Phase 2: Customer Notifications — COMPLETE & TESTED

Automatic messages that trigger after order events. Tested and validated end-to-end.

| Task | Status | Trigger | Channel |
| :--- | :--- | :--- | :--- |
| Admin Order Alert | ✅ Done | Customer pays | WhatsApp text to admin number |
| Customer Order Confirmation | ✅ Done | Customer pays | WhatsApp template `order_confirmation` (en_IN) |
| Customer Order Receipt | ✅ Done | Customer pays | HTML email via Resend |
| Admin Order Receipt | ✅ Done | Customer pays | HTML email via Resend |
| Customer Shipped Alert | ✅ Done | Admin marks order "shipped" | WhatsApp template `order_shipped` (falls back to text if template not yet approved) |
| Admin Shipped Alert | ✅ Done | Admin marks order "shipped" | WhatsApp text to admin number |
| Customer Shipping Email | ✅ Done | Admin marks order "shipped" | HTML email with tracking number + link to `/orders/[id]` |

**Note:** All notifications fire via `Promise.allSettled` — one failing channel (e.g., WhatsApp) never blocks the others.

---

## ✅ Phase 3: Shopping Cart & Guest Order Tracking — COMPLETE

Enhancements to lift average order value (AOV) and reduce "where is my order?" support load.

| Task | Status | Details |
| :--- | :--- | :--- |
| Client Cart System | ✅ Done | Customers can add items to cart, modify quantities, and check out multiple products in one Razorpay transaction. Cart persists in `localStorage`. |
| Header Cart Icon + Badge | ✅ Done | Dynamic shopping bag icon showing total item count. "Track Order" link in header. |
| "Add to Cart" + "Buy Now" | ✅ Done | Both buttons on product pages. Buy Now = instant single-item checkout. Add to Cart = build a multi-item order. |
| Cart Page (`/cart`) | ✅ Done | Full cart review: line items, quantities, totals, checkout form, and Razorpay trigger. |
| Multi-Item API Support | ✅ Done | `create-order` and `verify-payment` routes accept arrays of items. Backward compatible with single-item "Buy Now" flow. |
| Track Order Page (`/orders`) | ✅ Done | Shows recent orders from `localStorage` + manual lookup by Order ID + email/phone. |
| Order Detail Page (`/orders/[id]`) | ✅ Done | Public shareable page with visual timeline (Paid → Shipped), masked address, item list, AWB tracking link to Shiprocket. |
| Order Success Page | ✅ Done | Shows order reference, saves to `localStorage`, links to tracking page. |
| Product Page FAQ & Reviews | ✅ Done | Pre-configured FAQ accordion and review cards to boost checkout trust and reduce support queries. |

---

## ✅ Phase 3.5: Compliance & Legal Pages — COMPLETE

Indian e-commerce regulatory compliance pages, all linked from the footer.

| Page | Route | Status | Notes |
| :--- | :--- | :--- | :--- |
| Terms of Service | `/terms` | ✅ Done | Covers pricing in INR, Razorpay processing, liability, governing law (India). |
| Privacy Policy | `/privacy` | ✅ Done | Explains data collection, third-party services (Supabase, Resend, Meta, Shiprocket). |
| Refund & Cancellation | `/refunds` | ✅ Done | 7-day return window, cancellation within 2 hours, refund to original method in 5-7 days. |
| Shipping Policy | `/shipping` | ✅ Done | 1-2 day processing, 3-7 day delivery pan-India, tracking via WhatsApp + email + website. |
| Contact Us | `/contact` | ✅ Done | Email, phone placeholder, office address placeholder, **Grievance Officer section** (required by Indian IT Act + Consumer Protection Rules 2020). |

> ⚠️ **Action needed**: Replace `[BUSINESS_NAME]`, `[REGISTERED_ADDRESS]`, `[GSTIN_PLACEHOLDER]`, `[GRIEVANCE_OFFICER_NAME]`, and `[PHONE_NUMBER]` placeholders with real details once KYC is complete.

---

## ✅ Phase 3.6: Premium Visual Redesign — COMPLETE (local, not deployed)

Applied the 7-step plan in `Business hub/PostDuty_Premium_Design_Spec.md` on top of the premium `globals.css` tokens shipped 7 Jul. Presentation-only — no API/Supabase/Razorpay/admin logic touched.

| Step | File(s) | Status |
| :--- | :--- | :--- |
| 1. Fraunces display serif font | `src/app/layout.tsx` | ✅ Done |
| 2. Header — serif logo, taller bar | `src/components/Header.tsx` | ✅ Done |
| 3. Hero — wash bg, eyebrow, gold rule, trust strip | `src/app/page.tsx` | ✅ Done |
| 4. Product grid — premium cards, gold price tag | `src/app/page.tsx` | ✅ Done |
| 5. Product detail page | `src/app/products/[slug]/page.tsx` | ✅ Done |
| 6. Footer — serif brand, gold rule | `src/components/Footer.tsx` | ✅ Done |
| 7. Buttons everywhere (cart, checkout, order lookup) | `CheckoutForm.tsx`, `cart/page.tsx`, `order-success/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx` | ✅ Done |

Each step committed separately; `npm run build` passes after every commit. **Not deployed** — Jijo reviews on `localhost:3000` first, then runs `npm run deploy`.

---

## 🚧 Phase 4: Launch Blockers — IN PROGRESS

These are the critical-path tasks required before the store can accept real money from real customers.

| # | Task | Status | Owner | What to do |
| :--- | :--- | :--- | :--- | :--- |
| 4.1 | **Buy `postduty.in` domain** | 🔴 Not started | **J** | Buy on Cloudflare Dashboard → Domain Registration (~₹900/yr). Then add as custom domain in Workers settings. |
| 4.2 | **Connect domain to Cloudflare Worker** | 🔴 Not started | **J** | Workers → Settings → Domains & Routes → Add `postduty.in` and `www.postduty.in`. SSL is automatic. |
| 4.3 | **Verify domain in Resend** | 🔴 Not started | **J** | Add `postduty.in` in Resend dashboard, add DNS records on Cloudflare. Unlocks email delivery to all customers. |
| 4.4 | **Set production secrets on Cloudflare** | 🔴 Not started | **J** | Copy all `.env.local` values into Workers → Settings → Variables and Secrets. Set `NEXT_PUBLIC_BASE_URL=https://postduty.in`. |
| 4.5 | **Get a dedicated WhatsApp API number** | 🔴 Not started | **J** | Buy a cheap prepaid SIM. Verify it once with Meta. It becomes a cloud-hosted virtual sender. Your personal number stays as the *receiver* in `ADMIN_WHATSAPP_NUMBER`. |
| 4.6 | **Approve `order_shipped` template** | 🟡 Submitted | **J** | Submitted in Meta Business Suite. Waiting for approval (~minutes to hours). Code falls back to plain text until approved. |
| 4.7 | **Collect KYC details from partner** | 🔴 Not started | **P** | Legal business name, GSTIN, registered address, phone, bank account, PAN. |
| 4.8 | **Submit Razorpay Live KYC** | 🔴 Not started | **P** | Submit business + bank details on Razorpay dashboard to activate **live payments**. Takes 2-5 business days. |
| 4.9 | **Fill compliance page placeholders** | 🔴 Blocked on 4.7 | **J** | Replace `[BUSINESS_NAME]`, `[GSTIN]`, etc. in `/terms`, `/contact`, `/privacy` with real details. |
| 4.10 | **Invite partner to Meta Portfolio** | 🔴 Not started | **J** / **P** | Meta Business Suite → Business Settings → People → Invite partner. Scope to PostDuty page + Instagram only. |
| 4.11 | **End-to-end test order** | 🔴 Blocked on 4.8 | **J** / **P** | Place one real order on live Razorpay. Verify: payment, DB entry, WhatsApp to customer, email to customer, admin alert, tracking update, order lookup page. |

---

## 📅 Phase 5: Sourcing & Inventory — FUTURE (Can start now in parallel)

Finding what to sell, sourcing samples, and preparing packaging. See the [Product-to-Customer Playbook](file:///d:/Business%20plan/PostDuty/postduty/PostDuty_Product_to_Customer_Playbook.md) for full details.

| Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- |
| Build `sourcing_tracker.xlsx` | 🔴 Not started | **J** / **F** | Score suppliers on MOQ, margin, quality using the 7-point filter from Playbook §1.1. |
| Bhagirath Palace walk (Delhi) | 🔴 Not started | **P** | Visit India's largest surgical wholesale market with Tier A list (badge reels, torches, openers). |
| Sadar Bazaar packaging run | 🔴 Not started | **P** | Source poly mailers, brand stickers, thank-you inserts, QR cards (200-unit batch, ~₹1,500-2,500). |
| Order IndiaMART samples | 🔴 Not started | **F** | Message 3-5 suppliers per Tier A/B product. Order paid test samples before committing to bulk. |
| Photograph existing SKUs | 🔴 Not started | **P** | 6-8 angles per product, phone + window light + white chart paper. Square 1:1 main image. |
| List 3 bundles as hero products | 🔴 Not started | **J** | "Ward Survival Kit ₹499", "Intern Starter Pack ₹599", "Night Duty Kit ₹449" — each gets its own listing + photos. |
| WhatsApp Business catalog | 🔴 Not started | **P** / **J** | Free, instant. Add all products with photos + links to `postduty.in` product pages. |

---

## 📅 Phase 6: Marketing & Customer Growth — FUTURE (After first orders)

See the [Product-to-Customer Playbook](file:///d:/Business%20plan/PostDuty/postduty/PostDuty_Product_to_Customer_Playbook.md) Parts 3-5 for full strategy.

| Task | Status | Owner | Notes |
| :--- | :--- | :--- | :--- |
| Soft launch to 30-50 medico friends | 🔴 After launch | **J** | Personal WhatsApp messages (not broadcast). Goal: 10 orders + 5 testimonials. |
| Instagram content engine (3 Reels/week) | 🔴 After launch | **J** / **P** | Product-in-action, ward-life relatable, behind-the-brand pillars. |
| Campus ambassador pilot (3 colleges) | 🔴 After launch | **J** / **P** | 10%-off code + free product per 5 orders. Custom QR sticker sheets for hostel notice boards. |
| Google Merchant Center free listings | 🔴 After domain | **J** | Verify domain → upload product feed → free Shopping tab listings at ₹0. |
| Post-purchase follow-up cron jobs | 🔴 Not built | **J** | Delivered+1 day check-in, Delivered+5 day review ask, 60-day win-back. Native Cloudflare cron (₹0). |
| Google Ads credits (₹20k parked) | 🔴 After 1st stranger order | **J** | Performance Max / Shopping ads + exact-match Search on low-competition medico keywords. |
| Meta/Instagram ads burst | 🔴 After 30+ orders/mo | **J** | Boost proven organic Reels. ₹500-700/day concentrated burst, not ₹300/day trickle. |

---

## 💡 Playbook Improvements (Integrated ✅)

We reviewed the **Product-to-Customer Playbook** and integrated these 5 refinements directly into the document:

1. **Gift Option at Checkout** — Checkbox: "Is this a gift? Add a printed card (+₹20)". Lifts AOV and captures gifting events (NEET-PG results, convocations). *(Playbook §2.1)*
2. **Dynamic Preorder Shipping SLA** — Automated confirmations highlight "7-10 day delivery" for preorder items. Prevents chargebacks. *(Playbook §1.5)*
3. **Ambassador QR Stickers** — Custom sticker sheets with QR codes linking to personalized referral landing pages (e.g., `/ref/dr-anil`). For hostel notice boards. *(Playbook §2.6)*
4. **Lightweight Envelope Shipping** — Items under 100g ship in bubble mailer envelopes at ~₹20-25 instead of 500g boxes at ₹36-50. Doubles margin on single items. *(Playbook §4.1)*
5. **Native Cron Follow-ups** — Post-purchase messages (check-in, review ask, win-back) built as Cloudflare scheduled cron jobs at ₹0, replacing Make.com. *(Playbook §5.1)*

---

## 🏗️ Technical Architecture Summary (for debugging)

For the partner's reference — here is how the system is wired together:

```
Customer visits postduty.in
        │
        ▼
   ┌─────────────┐       ┌──────────────┐
   │  Next.js     │──────▶│  Supabase    │  (products, orders, order_items)
   │  (Cloudflare │       │  PostgreSQL  │
   │   Workers)   │       └──────────────┘
   └──────┬──────┘
          │
          ▼  (on checkout)
   ┌──────────────┐
   │   Razorpay   │  (payment processing)
   └──────┬───────┘
          │
          ▼  (on payment success)
   ┌──────────────────────────────────────────┐
   │  verify-payment API route                │
   │  ├── Save order to Supabase              │
   │  ├── Decrement stock                     │
   │  ├── WhatsApp alert → Admin phone        │
   │  ├── WhatsApp confirm → Customer phone   │
   │  └── Email receipt → Customer + Admin    │
   └──────────────────────────────────────────┘
          │
          ▼  (admin marks "shipped" in dashboard)
   ┌──────────────────────────────────────────┐
   │  update-order API route                  │
   │  ├── WhatsApp shipped → Customer phone   │
   │  ├── WhatsApp shipped → Admin phone      │
   │  └── Email tracking → Customer           │
   └──────────────────────────────────────────┘
```

### Key files to know for debugging:
| What | File |
| :--- | :--- |
| Cart state management | `src/components/CartContext.tsx` |
| Checkout + Razorpay modal | `src/components/CheckoutForm.tsx` |
| Order creation API | `src/app/api/create-order/route.ts` |
| Payment verification + order saving | `src/app/api/verify-payment/route.ts` |
| Shipping status update + notifications | `src/app/api/admin/update-order/route.ts` |
| WhatsApp sending logic | `src/lib/notifications.ts` |
| Email sending logic | `src/lib/email.ts` |
| Supabase clients (anon + admin) | `src/lib/supabase.ts` |
| Admin route protection | `src/middleware.ts` |
| All environment variables | `.env.local` (local) / Cloudflare Secrets (production) |

### Environment variables checklist for Cloudflare production:
| Variable | Set? | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Build-time variable |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Build-time variable |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Runtime **secret** |
| `RAZORPAY_KEY_ID` | ⚠️ Need live key | Currently test key — changes after KYC |
| `RAZORPAY_KEY_SECRET` | ⚠️ Need live key | Currently test key — changes after KYC |
| `ADMIN_SECRET` | ✅ | Runtime **secret** |
| `ORDER_NOTIFICATIONS_ENABLED` | Set to `true` | |
| `RESEND_API_KEY` | ✅ | |
| `WHATSAPP_PHONE_NUMBER_ID` | ⚠️ Need real number | Currently test number ID |
| `WHATSAPP_PERMANENT_TOKEN` | ✅ | |
| `ADMIN_WHATSAPP_NUMBER` | ✅ | Personal number for receiving alerts |
| `NEXT_PUBLIC_BASE_URL` | 🔴 Not set | Must be `https://postduty.in` in production |
