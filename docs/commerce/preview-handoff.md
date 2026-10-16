# Commerce preview handoff — 16 October 2026

This is a working, isolated test release of the existing PostDuty application. It is not a commercial launch. Exactly two storefront experiences share canonical products, inventory, checkout and owner operations. Production remains on its previous worker version.

## Owner walkthrough

Open the preview's `/admin/products` route and sign in with the existing admin password. Google sign-in is deliberately unavailable until the explicitly authorized owner's identity and provider are configured; no first account becomes owner.

1. Use **Add product**. Enter identity and choose Christmas, General, or both. The initial save is always a draft.
2. Upload images or a short supported video. Set the primary image and descriptions. The preview uses a separate upload bucket.
3. Enter selling price, stock or available production slots, variants and personalization. Private costs and commercial design rights are separate from public listing content.
4. Save, preview, and explicitly publish after the editor's checks pass. Reload the assigned storefront to see the saved record without rebuilding the application.
5. Use Orders for verified purchases, individual fulfillment and manual service cases. A service-case approval only records a decision; it does not refund money, cancel stock or send a message.
6. Creators contains invitations, submission approval, fulfillment oversight and a manual settlement ledger. Never treat a settlement record as proof that a bank transfer occurred.
7. Insights and Research show source/range definitions and missing-data limitations. Research candidates do not publish products or change prices.

All preview products and imagery are explicitly fictional concepts. The existing healthcare catalog and customer history were neither copied into public test pages nor modified. Do not enter real customer data into this preview.

## Acceptance status

| Milestone | Evidence achieved | Remaining acceptance gate |
| --- | --- | --- |
| 0 — Preserve | Repository, PRs, worker/domain mappings and Supabase audited; original 2 products and 13 orders retained | Command Centre status write was unavailable; engineering evidence is in issue #16 / PR #17 |
| 1 — Christmas + owner | Deployed draft/save/media/publish/unpublish/duplicate tests; real Razorpay test-bank browser checkout created one captured test order | Owner's authenticated Android walkthrough; Google provider and exact commerce identity binding |
| 2 — Shared marketplace | Distinct Christmas and general designs; exclusive and shared product assignments; authoritative shared inventory; original healthcare storefront preserved in production | Approved real catalog and production release |
| 3 — Creators | Invitation restrictions, submissions, approval, two-creator item isolation, dispatch and manual earnings tested through APIs and disposable PostgreSQL | Real invited Google sign-in and authenticated mobile walkthrough; no real invitation sent |
| 4 — Intelligence | Persistent sourced research, range-defined capture-backed analytics, source-schema tests and CSV export | Funnel collection, repeat-customer analysis, realized cost reconciliation and statistical trend evidence remain insufficient or unimplemented |
| 5 — Release | Version preview, test payments, authorization boundaries, RLS, preservation and dependency checks | Production approval, commercial review, Christmas domain mapping, real Google/browser acceptance, notification/webhook configuration and delivery verification |

Do not represent the creator OAuth tests as live browser authentication: identity transport was mocked in those tests. Do not represent 390px browser layout checks as a physical Android-device test. Do not describe test receipts as sales, demand or profit. No customer review collection workflow is released; no ratings are invented.

## Commercial and identity gates

- Use the already authorized Google owner verified in Command Centre. Commerce currently uses a separate Supabase Auth project. Configuring its Google provider/callback and binding the corresponding immutable user and Google subject requires a controlled identity setup; do not copy the Command Centre user UUID into a different issuer or authorize by editable profile metadata.
- Before real invitations, approve each creator, commercial license, commission and fulfillment agreement. Creator onboarding never grants owner access.
- Approve actual products, available stock/production slots, costs, prices, shipping methods, preparation estimates and return terms. Sample concept prices and assets are not recommendations for a real listing.
- Obtain evidence for applicable Indian e-commerce, consumer-protection, privacy, GST/invoicing and settlement obligations, and confirmation of the Razorpay account's permitted marketplace model. The research notes are not a declaration of legal compliance.
- Real notification transports and Razorpay webhook delivery require configuration and controlled verification. All test notifications are suppressed even if legacy credentials exist on the worker.

## Controlled production procedure — not authorized or executed

1. Obtain explicit release approval for the reviewed commit and commercial configuration. `master` auto-deploys: merging this PR is a production action.
2. Record the current production worker version and obtain a verified database backup/restore point. Recheck historical record counts and representative legacy products/orders privately.
3. Review and apply the prepared production base schema, payment supplement, creator functions and order-case schema in that dependency order. Preserve existing rows and integer-paise amounts. Never run the preview schema as a production migration.
4. Prepare a production-specific worker configuration. This branch intentionally defaults `COMMERCE_SANDBOX=true` and notifications off. Do not merge or promote those preview settings onto public domains accidentally. Production uses canonical tables; preview remains isolated.
5. Verify exact owner identity, restricted creator authentication, payment credentials/mode, webhook secret and fulfillment/notification behavior. Changing to real-money mode or sending test communications to real recipients needs the owner's specific approval.
6. Map Christmas only after approval, preserving the existing main and general-store mappings. Review policies and links on both hosts, then release gradually and verify capture/order/stock consistency.
7. Roll back traffic to the recorded prior worker version if serious behavior fails. Retain new orders and additive schema; do not drop tables or reverse customer/payment history. Pause new checkout and reconcile captured-but-unconfirmed payments before reopening.

## Known limits

- Dependency review has zero runtime npm advisories at the recorded check, but five development-package entries share one upstream unpatched braces advisory. See the separate dependency review.
- Existing password admin access is retained for the preview. Google-only daily owner access is not yet verified. No new owner credential has been created or exposed.
- Manual service and settlement ledgers do not execute financial transactions. Customer self-service returns, automated label purchase and automatic split payouts are not provided.
- Cost reporting is an estimate when historical cost snapshots, tax, actual postage or refunds are unavailable. Advanced conversion metrics explicitly show insufficient data.
- Customer-uploaded personalization reference files, integrated image cropping, verified-review collection, advanced promotion management and automated research refresh are not part of this preview.
