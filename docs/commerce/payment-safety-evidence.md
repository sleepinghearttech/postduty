# Checkout correctness — implementation and evidence

Status: implemented in the working branch; no production migration, provider configuration change, customer message, real payment, commit or deployment performed by this slice.

## Behavior

- `/api/create-order` accepts the existing single-product shape or `items: [{productId,quantity,variantId?,personalization?}]`, plus `storefront`, coupon/gift options and customer details. Default storefront for legacy products/clients is `general`.
- Prices, available variants, stock, storefront availability and coupon discounts come from the server catalog. Repeated product/variant lines are aggregated when checking shared inventory. Fractions, invalid variants, unsupported personalization and out-of-range totals fail before payment creation.
- The server persists a private checkout intent containing immutable line prices, names, creator attribution, variant/personalization values, total, storefront and customer before requesting a Razorpay order. Razorpay notes contain only the intent ID and storefront, never addresses or cart details.
- The response retains `razorpayOrderId`, `amount`, `keyId`, `discountAmount`, `couponCode`; it adds `currency` and `testMode`.
- Client callbacks require a timing-safe HMAC comparison and server API lookup of the payment. Webhooks require their own raw-body signature, followed by the same server lookup. Only a matching `captured` payment with exact ID, order, INR amount/currency and no refund passes.
- Financial/item fields supplied to `/api/verify-payment` are ignored. The saved snapshot determines the resulting order. Customer fields can fill a missing legacy intent once; they cannot overwrite an existing address.
- Verified capture evidence is persisted before finalization, so an unexpected database rollback still leaves an owner-visible payment reference for reconciliation.
- One SQL transaction locks the intent and products in deterministic order, enforces unique payment/order/intent bindings, writes order plus items, decrements parent and variant inventory, increments coupon use and inserts one notification job. Retries return the same order without stock or coupon changes.
- If another buyer exhausts stock, the capture remains recorded as `reconciliation_required`, with no invented paid order and no negative inventory. Coupon capacity conflicts have the same treatment. This initial version **does not reserve inventory before payment**; an owner must reconcile a captured shortage and decide fulfillment or refund. No refund happens automatically.
- Creator availability and owner-configured `creators.commission_bps` are validated before provider-order creation. Each line freezes that rate, its allocated discount, commission and estimated creator proceeds. Configuration defaults are unchanged; no settlement or payout is triggered.
- `is_test` and `payment_mode` label orders. An unknown legacy mode remains NULL, so historical paid rows must not automatically be treated as newly verified live revenue.
- `COMMERCE_SANDBOX=true` uses only `preview_*` tables/functions, rejects live Razorpay keys and suppresses all real email/WhatsApp notifications even when their feature flag is enabled. Missing test credentials fail closed. There is no fake payment success path.
- Notification outbox states distinguish pending, suppressed test, attempting, failed and attempted/unconfirmed. Existing notification transports do not provide reliable delivery acknowledgements; an attempt is never called delivered. Automated retry of uncertain notifications is intentionally absent to avoid duplicate messages.

## Creator proceeds and made-to-order availability

All amounts below are integer paise. Let each merchandise line gross be `quantity × unit_price`. The order discount is allocated proportionally to each line's gross: take the floor of each share, then distribute remaining paise by greatest fractional remainder, breaking ties by saved line order. This allocation includes owner and creator merchandise, so line discounts sum exactly to the order discount.

For each creator line:

```
net_line = quantity × unit_price − line_discount_amount
commission_amount = round(net_line × commission_bps / 10000)
creator_earning_paise = net_line − commission_amount
```

Rounding is to nearest paise, half up for nonnegative values. Gift-card charges are excluded. These are estimated sale proceeds before tax, payment fees, manufacturing/shipping costs, refunds or manually approved adjustments; they are not an authorized payout or net business profit. Owner products have NULL creator proceeds and zero creator commission. Old rows without snapshots remain NULL/insufficient data.

`earnings_creator_id` preserves the original sale creator independently of mutable fulfillment `creator_id`. Reassignment sets `earnings_review_required=true`, preserving the original financial values for audit; it does not apply one creator's terms to another. Reviewed settlements remain owner-controlled records.

For made-to-order products, canonical `stock` is the finite count of **available production slots**, also constrained by variant stock. A capacity estimate does not create availability. The same atomic stock decrement consumes slots, which the owner can replenish; there are no automatic resets or pre-payment reservations.

## SQL artifacts and migration order

1. Apply the relevant **base commerce schema** first.
2. Review and apply `supabase/commerce/payment-supplement.preview.sql` only to isolated staging. It touches only `preview_*` commerce objects.
3. `supabase/commerce/payment-supplement.production.sql` is prepared for a separately approved production release. It is additive and never rewrites historical orders.
4. The `payment-supplement.template.sql` is source, not directly executable. It uses `__PREFIX__`, `__TEST_DEFAULT__` and `__PREVIEW_GUARD__` placeholders. Preview has an additional database-level rejection of live payments.

All new private tables have RLS enabled, no anonymous/authenticated grants and service-only access. The finalizer is executable by `service_role` only. Existing historical orders remain unchanged; uniqueness for the new path lives in the new payment ledger and checkout-intent index, avoiding destructive cleanup of old records.

## Verification

Executed successfully on 2026-10-16:

- 15 contract tests (including creator-rate validation, exact discount allocation, zero/full commission, mixed creator/owner lines and made-to-order slots): manipulated prices/totals, invalid quantities, duplicate-line stock abuse, variant/shared inventory, storefront leakage, draft/archive exclusion, personalization, coupons, signature tampering, missing/live sandbox credentials and provider capture mismatches.
- 5 server tests with a mocked Razorpay transport: provider fetch before finalization; mismatched/uncaptured payments cannot invoke the paid-order function; capture evidence survives finalize failure; saved customer data is immutable; notification suppression is independent of feature flags.
- 10 database tests using the **actual full preview base migration and actual payment supplement** in disposable PGlite/Postgres: repeated callback/webhook calls, competing buyers, provider mismatches, immutable price snapshot, webhook-before-client customer recovery, duplicate payment binding, coupon use, transaction rollback and anonymous-role denial.
- ESLint passed on the payment-owned API/helper files. Global TypeScript checking reported other agents' in-progress files; no payment-owned TypeScript errors were reported.

Commands:

```sh
node --experimental-strip-types --test tests/payments/checkout.test.mjs tests/payments/server.test.mjs
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/payments/transaction.test.mjs
npx eslint src/lib/checkout-contract.ts src/lib/checkout-server.ts src/app/api/create-order/route.ts src/app/api/verify-payment/route.ts
```

The optional PGlite dependency was installed in a disposable directory outside the repository. The SQL tests also work with an installed `@electric-sql/pglite` package when `PGLITE_MODULE` is omitted. PGlite uses one connection: these tests verify serialized repeated calls and transactional behavior, **not live multi-session lock contention**. A staging concurrent-callback test and actual Razorpay test checkout/webhook delivery remain release evidence requirements. No genuine payment-provider completion or deployed functionality is claimed by these local tests.

## Release dependencies and known limits

- Configure reviewed Razorpay **test** credentials and the staging webhook secret; carry out a real provider test-mode checkout on the isolated preview.
- Deploy the database supplement before deploying code that depends on its intents/transaction function. New payment APIs fail closed if unavailable.
- Use `commerceTable()` in order-confirmation/detail/lookup flows so preview receipts read preview records.
- Drain or manually reconcile any pre-release Razorpay orders that lack a secure intent. They are intentionally not reconstructed from unsigned client data or mutable catalog prices.
- Complete owner-facing reconciliation/notification visibility and manual action paths before live sales. Nothing here authorizes live money movement, settlement or automatic refunds.
- Keep production release, provider account terms, legal/tax readiness and real customer communications behind the existing owner gates.
