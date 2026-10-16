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

Independent source review found no P0/P1 in the design changes or preview gate. Six new access-boundary tests passed, including forged sessions, exact user/Google subject checks, API gating, production isolation and external redirect rejection. TypeScript and lint pass (10 pre-existing lint warnings). The full suite passed 99 tests. Deployment evidence and browser limitations will be recorded after deployment.

No production release, real payment, notification, payout, customer-data change or commercial approval is included.
