# Dependency security review — 16 October 2026

Status: dependencies patched and local checks passed. This document is engineering evidence, not production release approval.

## Why the preview required a replacement build

The initial audit reported 21 vulnerable packages: 2 critical, 16 high and 3 moderate. Installed Next.js 16.2.6 and OpenNext Cloudflare 1.19.11 required upgrades. The initial preview contains fictional records and test-mode payment configuration; that containment does not substitute for patching vulnerable frameworks.

## Verified primary sources and selected versions

- [Next.js October 14 security bulletin](https://nextjs.org/blog/nextjs-security-update-october-14-2026): the current security floor is 16.4.1 for the active branch. It addresses two critical upstream issues and a server-action denial of service. Selected Next.js **16.4.2**, confirmed with the package publisher's npm metadata, with matching **eslint-config-next 16.4.2**.
- [OpenNext official release history](https://github.com/opennextjs/opennextjs-cloudflare/releases): **1.20.12** explicitly adds Next.js 16.4 support through AWS adapter 4.1.11 and incorporates the October security update. Its published peer requirements accept Next.js >=16.4.1 and Wrangler ^4.148.0.
- [OpenNext middleware/cache advisory GHSA-2vc4-c4r6-p6v6](https://github.com/advisories/GHSA-2vc4-c4r6-p6v6): versions before 1.20.2 can expose cached protected routes when cache interception is explicitly enabled. This repository does not enable cache interception and private server handlers independently authorize requests; nevertheless the adapter is upgraded.
- [proxy-addr advisory GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): patched in 2.0.8. The vulnerable trust-proxy behavior requires affected subnet configuration. Compatible dependency refresh is used rather than accepting the critical package finding.
- [OpenNext supported-version documentation](https://opennext.js.org/cloudflare): Next.js 16 minor/patch releases are supported. Selected **Wrangler 4.151.1** from published npm metadata; its Node >=22 requirement matches the repository CI's Node 22 and the local Node 24 runtime.

Package publisher metadata was checked with `npm view` for exact versions, engine constraints, peer dependencies and adapter dependencies. No `npm audit fix --force`, framework downgrade or gate removal was used. Existing application architecture and optional framework feature flags are unchanged.

The adapter's `@node-minify/core` 9.0.2 dependency pins `glob` 10.3.3. A scoped npm override selects **glob 10.5.0**, the patched release in the same major version identified by [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2). The minifier imports only the `globSync` library API; the advisory affects the CLI's command execution option. The override removes that vulnerable CLI from the dependency tree without upgrading the minifier across major versions. The glob publisher marks older major releases deprecated, so this compatibility override should be removed when OpenNext updates that transitive dependency.

Other locked runtime versions after the compatible refresh are React/react-dom **19.3.1**, Supabase JavaScript **2.118.0**, proxy-addr **2.0.8**, and sharp **0.35.5**. The architecture, Supabase schema and runtime feature flags are unchanged by this dependency patch.

## Scope

Only dependency manifests/lockfile and this evidence document are changed in this patch. The npm test command retains product/auth/payment/creator/business schema tests and now includes `tests/order-cases/*.test.mjs`. PGlite remains pinned at 0.3.14.

## Verification

- `npm audit --omit=dev --json`: **0 vulnerabilities**.
- Full `npm audit --json`: **0 critical, 5 high, 0 moderate**. These are five affected package entries for one unresolved advisory, not five distinct vulnerabilities.
- Remaining chain: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces` 3.0.3. Every entry is marked development-only in the lockfile. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports stack exhaustion from deeply nested attacker-controlled brace patterns and lists no patched version. npm's suggested framework downgrade was rejected. Application code and repository commands do not import these packages or pass customer input as glob patterns. Keep this tooling finding open for the upstream fix; this is not a claim of a clean full audit.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and 10 existing warnings (image optimization and one unused variable).
- `npm test`: **82/82 tests passed**, no skipped tests, plus the business metric boundary script passed. The command includes all product/auth/payment/creator/order-case/business-schema suites.
- Production build with CI placeholder credentials, `COMMERCE_SANDBOX=true` and notifications disabled: passed on Next.js 16.4.2. All 38 static pages generated and dynamic routes compiled. Warnings remain for the legacy middleware filename convention and a Next.js internal `process.cwd` Edge-runtime import trace; the Cloudflare adapter/runtime smoke remains required.
- OpenNext's actual `@node-minify/core` + terser path successfully expanded a temporary `*.js` input and wrote minified output with the scoped glob 10.5.0 override.
- Manifest/lockfile whitespace check passed. No dependency peer conflicts were reported during installation. Compatible dependency refresh includes development tools; no major ESLint migration is included.

Root release coordinator must rebuild the Cloudflare artifact using the verified lockfile, upload a new isolated preview version, and repeat the deployed smoke checks before describing the patched preview as verified. These local checks do not authorize a production deployment.
