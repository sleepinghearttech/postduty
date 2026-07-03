# PostDuty — Build & Business Roadmap

> A living checklist of every major landmark from first line of code to sustained profit.
> Update the boxes as you go. Keep this file in the repo root so it travels with the project.
>
> **Legend:** `[x]` done · `[ ]` pending · `[~]` in progress · `[!]` blocked (waiting on something)
> **Owners:** **J** = Jijo (tech/ops) · **P** = Delhi partner (merchant of record, GST) · **F** = sourcing friend
>
> _Last updated: 2026-07-03_

---

## Phase 1 — Technical foundation ✅ COMPLETE

The full e-commerce spine, built and verified in production.

- [x] Architecture decided: Next.js + Supabase + Razorpay + Cloudflare Workers + Shiprocket — **J**
- [x] **Step 1** — Next.js scaffold (OpenNext adapter) → GitHub → Cloudflare auto-deploy pipeline; live skeleton — **J**
- [x] **Step 2** — Supabase database: `products` / `orders` / `order_items` tables, foreign keys, money-as-paise, RLS, seed product — **J**
- [x] **Step 3** — Storefront: product grid + product detail page with slug routing, reading live from Supabase — **J**
- [x] **Step 4** — Razorpay payments: create-order API, HMAC-SHA256 signature verification, order saved, stock decremented, success page — **J**
- [x] **Step 5** — Production payment flow verified end-to-end with test card — **J**
- [x] **Step 6** — Admin panel: password protection (middleware + cookie), Supabase Storage bucket, image upload, full product CRUD, staged/active sections, `ADMIN_GUIDE.md` — **J**
- [x] Debug code removed from payment flow — **J**

---

## Phase 2 — Brand & social foundation 🚧 IN PROGRESS

Public identity, set up with clean account isolation.

- [x] Separate `Postduty` Meta Business portfolio confirmed (isolated from Secret Trivandrum & CardioAether) — **J**
- [x] PostDuty Facebook Page created and connected to the Postduty portfolio — **J**
- [x] `postduty.in` Instagram account created (dedicated email `postdutyswag@gmail.com`), linked to portfolio — **J**
- [ ] Rotate `ADMIN_SECRET` — old value was exposed in chat; generate a new one, update `.env.local` + Cloudflare — **J** ⚠️ _do before any real traffic_
- [ ] Invite partner to Postduty portfolio (People → Employee role, assign only PostDuty Page + Instagram) — **J** _(waiting on her email)_
- [ ] Instagram profile dressed: logo, bio, link — **J** _(deferred until products finalised, by your call)_
- [ ] Link PostDuty Facebook Page ↔ Instagram (enables cross-post + later Shopping) — **J**

---

## Phase 3 — Compliance & payments go-live 🔒 BLOCKED ON PARTNER DETAILS

The true critical path to taking real money. KYC takes days — start it early.

- [!] Collect from partner: legal business name (per GSTIN), GSTIN, registered address, contact email, grievance officer name — **P**
- [ ] Compliance pages written & published: Terms, Privacy, Refund/Cancellation, Shipping, Contact/Grievance — **J** (copy) + **P** (details)
- [ ] Custom domain registered (e.g. `postduty.in`) and pointed at Cloudflare — **J** 💰 _first unavoidable cost (~₹900/yr)_
- [ ] Razorpay KYC submitted as registered business (GST + PAN + bank) — **P**
- [ ] Razorpay KYC approved (typically 1–3 working days) — **P**
- [ ] Razorpay switched from test mode → **live mode** (live keys in Cloudflare env) — **J**

---

## Phase 4 — Product sourcing & inventory 📦

Decide what to sell, prove it's real, hold stock.

- [ ] Finalise launch product(s) — start with ONE hero SKU (ampule opener is lead candidate) — **J** / **F**
- [ ] Source domestically first via IndiaMART (low MOQ, no import friction, GST invoice) — **F**
- [ ] Place a small sample/validation order — **F**
- [ ] Quality check the sample physically — **J** / **F**
- [ ] Confirm reliable supplier + restock lead time — **F**
- [ ] Hold initial inventory (small batch — validate demand before scaling) — **F**
- [ ] (Later) Explore customisation / branded version with supplier — **F**

---

## Phase 5 — Launch readiness 🚀

Make the store look real and fulfil-ready.

- [ ] Real product photos taken/sourced and uploaded via admin panel — **J** / **F**
- [ ] Product listings finalised (copy, price, stock) and set `is_active = true` — **J**
- [ ] Shiprocket account created; manual shipping mode (free) understood — **J**
- [ ] Fulfilment dry-run: place a test order → create a Shiprocket shipment manually → paste tracking back into order — **J**
- [ ] Instagram launch content: 3 foundational posts published — **J** / **P**
- [ ] Final end-to-end live test (real ₹ small order, real shipment) — **J**

---

## Phase 6 — Soft launch & first sales 🎯

Get the first real strangers to buy.

- [ ] Soft launch to warm network (medico WhatsApp groups, colleagues) — **J**
- [ ] Share `postduty.in` publicly; "link in bio → store" — **J**
- [ ] **First real paid order** 🎉 — milestone
- [ ] First 10 orders fulfilled and delivered — milestone
- [ ] Collect first customer feedback / first review — **J**
- [ ] Decide content owner & posting cadence (currently undecided) — **J** / **P**

---

## Phase 7 — Operations & repeatability ⚙️

Make fulfilment smooth so it doesn't eat your time.

- [x] **Step 7** — Order management dashboard (admin view of orders, status pending→paid→shipped, tracking entry) — **J**
- [ ] Documented fulfilment SOP your friend/partner can follow — **J**
- [ ] Returns/replacement handling kept minimal & manual (damaged/wrong item only) — **J** / **P**
- [ ] Decide when manual shipping pain justifies Shiprocket API (₹499/mo) 💰 — **J**

---

## Phase 8 — Automation & scale 📈

Only after the manual loop works. Automate the repetitive parts.

- [ ] **Make.com** new-order pipeline: order → WhatsApp alert + Gmail + Google Sheet log — **J** _(local n8n abandoned: Windows packaging bug in n8n 2.x; Make.com chosen for PostDuty notifications)_
- [ ] Make.com error monitor — **J**
- [ ] _(n8n Cloud reserved for business hub automation in Phase 8–9, not PostDuty storefront)_
- [ ] Shiprocket API automation: auto-create shipment on paid order (needs ₹499/mo plan) 💰 — **J**
- [ ] Instagram Shopping: product catalogue approved, product tagging live — **J**
- [ ] First paid ad test (small budget, boosted Reel) once organic demand shows — **J**
- [ ] Add 2nd & 3rd SKUs (stethoscope charm, penlight) once hero SKU proven — **J** / **F**
- [ ] Scale sourcing: move proven high-volume SKUs to Alibaba bulk (Acciowork-assisted vetting) 💰 — **F**

---

## Phase 9 — Profitability milestones 🏆

The numbers that actually define success.

- [ ] **Break-even on first inventory batch** (revenue covers the sample order + costs)
- [ ] **First profitable month** (monthly revenue > monthly costs incl. domain, gateway fees, any paid tools)
- [ ] Repeat-customer or word-of-mouth order observed (demand is real, not just your network)
- [ ] Sustained profit across 3 consecutive months
- [ ] Profit reinvested into inventory/ads without dipping into outside funds
- [ ] **Significant profit** — business self-funds its own growth and pays the team meaningfully 🎯

---

## Standing principles (don't lose these)

- **Validate before scaling** — small batches, domestic sourcing, prove demand before importing or over-building.
- **Stage, don't expose** — new products default to `is_active = false` until stock is confirmed.
- **Manual first, automate later** — every automation earns its place only after the manual version hurts.
- **Never paste secrets in chat** — share variable names, never values.
- **Account isolation** — PostDuty assets stay in the Postduty portfolio; partner gets asset-scoped Employee access only.
- **Critical path = compliance + KYC**, not tooling. When in doubt, work the thing that's actually blocking a sale.

---

## Cost flags (where money starts) 💰

| Item | When | Approx. cost |
|---|---|---|
| Custom domain | Phase 3 | ~₹900/yr |
| Razorpay fees | per sale (live mode) | ~2% + GST |
| Initial inventory | Phase 4 | your sample batch |
| Shiprocket API (optional) | Phase 7–8 | ₹499/mo |
| Supabase Pro (optional) | only if you outgrow free | ~$25/mo |
| Paid ads (optional) | Phase 8 | your call |

Everything else stays on free tiers.
