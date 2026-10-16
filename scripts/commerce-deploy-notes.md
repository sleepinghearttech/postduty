# Isolated preview release procedure

This branch is a reviewable preview, not production-ready to merge. `master` auto-deploys, so merging is a production release requiring owner approval.

## Approved access restriction — 16 October 2026

The owner explicitly approved restricting PostDuty previews and Google sign-in for the already authorized owner. Cloudflare Access is not enabled on the account; Google provider configuration still requires a signed-in settings session. Do not claim either service is configured based on that approval alone.

The replacement preview uses `wrangler.commerce-preview.jsonc`: the same application, exactly two storefronts, isolated preview tables, existing owner authentication, suppressed notifications and TEST payment keys. `COMMERCE_PREVIEW_ACCESS=owner` gates all application pages/APIs except exact authentication endpoints and static assets. Public fictional assets and Supabase media remain public. Creator-only sessions and provider webhook callbacks are intentionally blocked by this owner-only review gate.

Build with the existing allowed preview credentials and these flags, then deploy **only** `postduty-commerce-preview` using its explicit config. Verify owner login and both appearance modes before disabling the original `postduty` Worker's version URLs through the subdomain API (`enabled` unchanged, `previews_enabled=false`). Do not change its deployments, production secrets, domains or routes. Also keep version URLs disabled on the replacement preview Worker so historical versions cannot bypass the gate.

Appearance can be restored immediately using **Original**, or `?design=classic`; **Refined** uses `?design=refined`. This visual experiment is sandbox-only. A security rollback must not re-enable the historical public URLs: keep the protected Worker and select Original or deploy the last protected version.

The older procedure below records how the original version previews were created; it must not be used to reopen their public access.

## Historical version-preview procedure

1. Build the checked commit with the existing project's selected Supabase keys and Razorpay **test** keys. Do not include real notification-provider credentials.
2. Force `COMMERCE_SANDBOX=true` and `ORDER_NOTIFICATIONS_ENABLED=false` at build and runtime. Confirm the test key prefix before any provider request.
3. Use `opennextjs-cloudflare build`, then **wrangler versions upload** with a preview alias. Do not run `deploy`, `versions deploy`, change custom domains, traffic percentages or production secrets.
4. Apply only isolated preview schema scripts. Production prepared SQL stays unapplied.
5. Run `scripts/commerce-preview-smoke.mjs` with PREVIEW_URL and privately supplied ADMIN_SECRET. Its mutations use only fictional preview listings.
6. Verify storefront/cart/provider test checkout in a browser, plus owner login and editor from Android. Record externally blocked steps honestly.
7. Retain the deployed version ID and commit. Removing the preview alias/version contains this release without rolling back production traffic. Preview tables and files are separate; do not delete them during active QA.

Before production, choose a deliberate non-sandbox configuration, reviewed product records, allowed owner identity, approved commercial/policy terms and production migration plan. Never promote fictional fixtures or test orders as real catalog or revenue.
