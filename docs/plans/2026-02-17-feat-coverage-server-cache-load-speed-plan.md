---
title: "feat: Reduce coverage route load time with server collections cache and cache model simplification"
type: feat
status: active
date: 2026-02-17
---

# feat: Reduce coverage route load time with server collections cache and cache model simplification

## Overview
`/dashboard/coverage` is slow when navigating from jobs in local development because each request fetches collections from the gateway and frequently falls back to a heavy GraphQL query. Existing cache indicators in the coverage UI are tied to browser `sessionStorage`, which does not reduce initial route load time.

This plan adds an in-process server cache for collections, removes duplicate client payload caching, and updates refresh/navigation behavior to align with App Router patterns.

## Problem Statement / Motivation
- Operator flow from jobs to coverage is slow and repetitive.
- Current collections fetch path is request-time (`force-dynamic` + `no-store`) and hits expensive fallback queries.
- Existing client cache UI can be misleading because it does not affect server-side route fetch time.

Measured during research in this repo environment:
- `/dashboard/coverage` warm loads were still around 12s+ before optimization.
- `/api/coverage/collections` upstream REST returned `404` for stage/prod gateway domains, activating GraphQL fallback.

## Brainstorm and Local Context
Found brainstorm from 2026-02-15: `coverage-report-design-parity-brainstorm`. Using as context for preserving existing operator workflow and deterministic behavior.

Relevant local patterns and constraints:
- `/videoforge/AGENTS.md`: no new infrastructure, keep behavior deterministic and testable.
- `/videoforge/src/app/dashboard/coverage/page.tsx`: server fetches for languages and collections.
- `/videoforge/src/services/coverage-gateway.ts`: gateway fetches use `cache: 'no-store'`.
- `/videoforge/src/features/coverage/collection-cache.ts`: client payload cache helper used by coverage client.

## Proposed Solution
1. Add server-side in-memory cache for coverage collections in the service adapter.
2. Keep cache at 24-hour TTL with 100-key cap and deterministic eviction.
3. Add explicit one-shot cache bypass via `refresh` query param.
4. Remove client `sessionStorage` payload cache for collections.
5. Keep only lightweight session storage for UI preferences (mode/report type).
6. Clean up navigation patterns to reduce extra reload/redirect friction.

## Public Interface Changes
### Search Params
- Add `refresh?: string` support in `/dashboard/coverage` page search params.
- Presence of `refresh` indicates force-refresh for collections fetch.

### Service Adapter API
- Update `fetchCoverageCollections(baseUrl, languageIds)` to accept:
  - `options?: { forceRefresh?: boolean }`

No external HTTP API contract changes are introduced.

## Technical Considerations
- Keep cache implementation inside existing Next.js app process; no Redis/DB/queue.
- Cache only successful collections responses (including empty arrays).
- Do not cache error responses.
- Preserve existing guardrails for unmappable fallback payloads (no behavior softening).
- Keep route deterministic and testable through explicit cache keying and bounded memory.

## Technical Approach

### Phase 1: Add Server Collections Cache
File:
- `/videoforge/src/services/coverage-gateway.ts`

Tasks:
- [x] Introduce module-level cache map for collections.
- [x] Use normalized key: `baseUrl + sorted languageIds`.
- [x] Add constants:
  - `COLLECTIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000`
  - `COLLECTIONS_CACHE_MAX_KEYS = 100`
- [x] Implement cache read path before network call unless `forceRefresh`.
- [x] Implement write path after successful fetch.
- [x] Implement deterministic eviction for oldest entries beyond cap.
- [x] Ensure no caching of thrown/failed results.

### Phase 2: Wire Refresh Query Param from Coverage Page
File:
- `/videoforge/src/app/dashboard/coverage/page.tsx`

Tasks:
- [x] Extend search params type with `refresh`.
- [x] Parse `refresh` and derive `forceRefresh` boolean.
- [x] Pass `forceRefresh` to `fetchCoverageCollections`.

### Phase 3: Remove Client Collections Payload Cache
Files:
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/collection-cache.ts` (remove)
- `/videoforge/tests/coverage-collection-cache.test.ts` (remove or replace)

Tasks:
- [x] Remove read/write/clear effects for collections payload cache from coverage client.
- [x] Remove "Last updated" and "Next refresh" UI metadata that depends on removed payload cache.
- [x] Keep `SESSION_MODE_KEY` and `SESSION_REPORT_KEY` behavior.
- [x] Ensure rendering uses server-provided collections state directly.

### Phase 4: Refresh and Navigation Cleanup
Files:
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx`

Tasks:
- [x] Update coverage queue link from `/jobs` to `/dashboard/jobs`.
- [ ] Use App Router navigation APIs for in-app transitions instead of `window.location.*`.
- [x] Update `Refresh now` to trigger same-route navigation with `refresh=<timestamp>`.
- [x] Preserve existing loading affordance during transitions.

## Acceptance Criteria
- [x] Repeated `/dashboard/coverage` loads for same language selection reuse server cache and are materially faster than current baseline.
- [x] `Refresh now` triggers a forced fresh collections fetch via query param.
- [x] Client collections payload cache is removed from coverage client.
- [x] UI preference session storage remains intact (mode/report type).
- [x] Coverage-to-jobs navigation avoids unnecessary alias redirect and uses direct dashboard path.
- [x] Existing failure behavior for gateway/fallback errors remains explicit and deterministic.

## Testing Plan
### Unit and Adapter Tests
- [x] Add/extend tests for cache hit/miss/expiry/eviction in coverage gateway adapter:
  - `/videoforge/tests/coverage-gateway-collections-contract.test.ts` (or new dedicated cache test file).
- [x] Add test for `forceRefresh` bypass behavior.
- [x] Add test that errors are not cached.

### Route and Page Tests
- [ ] Update coverage page tests for `refresh` query param behavior:
  - `/videoforge/tests/dashboard-coverage-page.test.tsx`
- [x] Validate that repeated same-input requests can reuse cached collections within process.

### Client Tests
- [x] Update coverage client tests to reflect removal of session payload cache and updated refresh behavior:
  - `/videoforge/tests/coverage-report-client-translation-bar.test.tsx` and related coverage client tests.

### Manual Verification
- [x] In local dev, measure `/dashboard/coverage` repeated-load TTFB and confirm warm-path improvement.
- [x] Click `Refresh now` and confirm fresh data load.
- [x] Validate jobs/coverage navigation smoothness and correctness.

## Success Metrics
- Warm repeat navigation to `/dashboard/coverage` is substantially faster than pre-change baseline.
- Fewer repeated gateway GraphQL collection fetches for identical language selections during active process lifetime.
- No regression in coverage submission flow or error transparency.

## Dependencies & Risks
### Dependencies
- Existing coverage gateway adapter and route composition remain in current architecture.
- No external infra dependencies introduced.

### Risks
- 24-hour TTL can serve stale data.
- In-memory cache is process-local and resets on server restart.
- Large key cardinality could increase memory use if uncapped.

### Mitigations
- Explicit refresh query-param bypass from UI.
- Hard cap of 100 keys with deterministic eviction.
- Keep behavior explicit and test-protected.

## Assumptions and Defaults
- Collections cache is enabled in all environments with 24-hour TTL by explicit decision.
- Cache scope is collections-only.
- Client collections payload cache is removed to avoid dual-cache complexity.
- Session storage remains only for small UI preference persistence.

## References
- `/videoforge/src/app/dashboard/coverage/page.tsx`
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/collection-cache.ts`
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx`
- `/videoforge/tests/dashboard-coverage-page.test.tsx`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`
- `/videoforge/docs/brainstorms/2026-02-15-coverage-report-design-parity-brainstorm.md`
