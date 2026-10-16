# Reversible refinement and approved preview access

The owner accepted the existing store appearance and requested a more premium, simple refinement that could be reversed. They also approved Google sign-in for the already authorized owner and restricting PostDuty preview access.

## Implemented

- A sandbox-only visual layer preserves original layouts, imagery, catalog, prices, inventory and shopping functions.
- `?design=refined` adds restrained seasonal framing, typography, spacing and short entrance/hover motion; `?design=classic` restores original styling. Both stores expose comparison links.
- Reduced motion disables entrance/hover and document-level smooth scrolling. Independent review found contrast issues and undersized mobile navigation; these were corrected (muted-text contrast 5.22:1, mobile navigation 11px and 44px targets).
- The dedicated preview configuration uses the same repository/backend with owner-only application access and no production domains. Direct pages, API requests, RSC requests and image optimization are subject to the application gate. Static assets and fictional media are not confidential.
- Successful owner login returns to the requested commerce page. External return URLs are rejected. Explicit logout suppresses automatic Google-session restoration on the login page and clears the local Supabase session.

## Google configuration status

The authorized identity was reverified against its existing Auth issuer. Commerce has no Auth users and its Google provider is unconfigured. The settings page requires account sign-in; a secure browser sign-in request timed out and subsequent browser verification was unresponsive. No provider credentials, owner identity or Auth configuration was changed. Owner approval is recorded and does not need repeating. The remaining requirement is authenticated access to provider settings, then actual Google sign-in verification and binding to the correct commerce user UUID plus the authorized Google subject.

## Review and validation

Independent source review found no P0/P1 in the design changes or preview gate. Six new access-boundary tests passed, including forged sessions, exact user/Google subject checks, API gating, production isolation and external redirect rejection. TypeScript and lint pass (10 pre-existing lint warnings). The full suite passed 99 tests plus the business-metric script. CI run 38899730619 / #24 passed on retry; its first build failed while processing a Google Fonts download. The actual Cloudflare build also passed.

## Verified protected deployment

- [Owner login](https://postduty-commerce-preview.jijo925.workers.dev/admin/login)
- [Christmas refinement](https://postduty-commerce-preview.jijo925.workers.dev/christmas?design=refined)
- [Christmas original](https://postduty-commerce-preview.jijo925.workers.dev/christmas?design=classic)
- [General store refinement](https://postduty-commerce-preview.jijo925.workers.dev/store?design=refined)
- [General store original](https://postduty-commerce-preview.jijo925.workers.dev/store?design=classic)

These URLs are verified by HTTP/API; anonymous requests go to login, and the existing owner password successfully authorizes the pages. Runtime commit `a2fd0d44f4ff8e8b6e4917c013661f85b62b9f38`, Cloudflare version `79f14fc7-cb35-45c0-90fe-86ecb64e4299`. Eight grouped deployed checks passed, including direct RSC requests, authentication, both designs, published animation/reduced-motion CSS, admin pages and logout/CSRF. See protected-preview-verification.json.

The original PostDuty Worker retains `enabled=true`; its `previews_enabled` setting is now false. All four checked historical preview hosts return **404**, including the initial vulnerable version. The new protected preview Worker also has version URLs disabled. Production deployment history is unchanged, and the main site, general-store domain and existing production workers.dev URL return 200. Counts remain 2 production products, 13 production orders and 1 preview TEST order. See preview-retirement-verification.json.

No browser screenshot or physical Android acceptance of this refinement is claimed: the browser became unresponsive during the secure settings sign-in, including its recovery/reset attempt. The comparison is ready for an owner to inspect using the existing admin password. Google setup requires a fresh authenticated settings session; approval must not be requested again.

Command Centre's attempted status write returned `INVALID_ARGUMENT / invalid_request_state`. GitHub issue #16 and PR #17 were updated instead; the Command Centre row is not claimed updated.

No production release, real payment, notification, payout, customer-data change or commercial approval is included.
