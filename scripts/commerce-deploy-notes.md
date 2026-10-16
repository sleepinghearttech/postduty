# Isolated preview release procedure

This branch is a reviewable preview, not production-ready to merge. `master` auto-deploys, so merging is a production release requiring owner approval.

1. Build the checked commit with the existing project's selected Supabase keys and Razorpay **test** keys. Do not include real notification-provider credentials.
2. Force `COMMERCE_SANDBOX=true` and `ORDER_NOTIFICATIONS_ENABLED=false` at build and runtime. Confirm the test key prefix before any provider request.
3. Use `opennextjs-cloudflare build`, then **wrangler versions upload** with a preview alias. Do not run `deploy`, `versions deploy`, change custom domains, traffic percentages or production secrets.
4. Apply only isolated preview schema scripts. Production prepared SQL stays unapplied.
5. Run `scripts/commerce-preview-smoke.mjs` with PREVIEW_URL and privately supplied ADMIN_SECRET. Its mutations use only fictional preview listings.
6. Verify storefront/cart/provider test checkout in a browser, plus owner login and editor from Android. Record externally blocked steps honestly.
7. Retain the deployed version ID and commit. Removing the preview alias/version contains this release without rolling back production traffic. Preview tables and files are separate; do not delete them during active QA.

Before production, choose a deliberate non-sandbox configuration, reviewed product records, allowed owner identity, approved commercial/policy terms and production migration plan. Never promote fictional fixtures or test orders as real catalog or revenue.
