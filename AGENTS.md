# PostDuty agent contract

Routine engineering may proceed autonomously through issue, branch, checks, pull request, independent ChatGPT/Astra review, and fixes on the same branch.

## Workflow

Use `codex/NNN-description` branches for substantial work and keep at most two significant implementation pull requests open until the process is stable. Do not self-approve.

Every pull request must state its linked issue, scope, risk surface, checks, smoke test, production impact, rollback/containment notes, and anything still requiring the owner.

## Owner gates

Stop and require explicit owner approval before:
- switching the payment provider into real-money mode or changing payment-account/KYC settings;
- changing production-only private configuration;
- destructive or irreversible database/schema/data operations;
- changing real customer orders, refunds, fulfillment state, or customer records;
- sending real customer email or WhatsApp messages outside an approved production operation;
- making a new pricing, product, policy, legal-copy, or merchandising decision not already documented;
- releasing a change that can alter checkout, payments, orders, customer messaging, stock, admin behavior, or the customer-visible storefront.

The `master` branch currently auto-deploys to Cloudflare. Merging a runtime-changing pull request to `master` is therefore a production release and must stop at the owner release gate. Documentation/workflow-only changes with no runtime effect may be merged after independent review and green checks.

## Data and test boundaries

Never commit secrets, customer PII, order exports, private notification payloads, or unsanitized production data. Tests must use placeholders, mocks, fixtures, test-mode payment data, or preview/staging paths. Automated tests must not send real customer messages.

Preserve the documented invariants: integer paise pricing, Supabase RLS, server-only service-role access, payment/order idempotency, payment verification before order writes, independent admin API authentication, inactive-by-default new products, and protection of products referenced by historical orders.

## Quality and review

Before review, run dependency install, TypeScript checks, ESLint, tests when present, a production build using non-production placeholders, and boundary checks for tracked private data.

Do not weaken runtime security, RLS, authentication, or payment verification to make checks pass. Escalate only when an owner gate above is genuinely reached.
