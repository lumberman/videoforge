---
title: "fix: Restore muxAssetId mapping in coverage GraphQL fallback collections"
type: fix
status: active
date: 2026-02-15
---

# fix: Restore muxAssetId mapping in coverage GraphQL fallback collections

## Overview
After resolving the language query schema issue, `/dashboard/coverage` can still fail with:

`Coverage GraphQL fallback did not return muxAssetId mappings for selectable videos.`

This plan restores reliable `muxAssetId` extraction when the coverage collections REST endpoint is unavailable and GraphQL fallback is used.

## Problem Statement / Motivation
Coverage collections loading uses:
1. REST endpoint: `${baseUrl}/api/coverage/collections`
2. GraphQL fallback when REST returns 404

In the failing stage environment, REST fallback path is active. The GraphQL collections query currently does not request any fields that feed `getMuxAssetIdFromRecord`, so all videos become non-selectable and the deterministic guard raises a 502.

This blocks translation selection workflows on `/dashboard/coverage`.

## Found Brainstorm Context
Found brainstorm from 2026-02-15: `coverage-report-design-parity`. Using as context for planning.

Relevant decision:
- deterministic explicit failure should be preferred over silent fallback.

Reference:
- `/videoforge/docs/brainstorms/2026-02-15-coverage-report-design-parity-brainstorm.md`

## Root Cause Analysis

### Primary technical cause
`fetchCoverageCollectionsFromGraphql` does not currently request any mux asset identifier fields, while normalization expects one of:
- `muxAssetId`
- `assetId`
- `mux.assetId`
- `muxAsset.id`
- `variant.muxAssetId`
- `playback.assetId`

Code references:
- Query lacks mux fields: `/videoforge/src/services/coverage-gateway.ts:633`
- Mapping extractor candidates: `/videoforge/src/services/coverage-gateway.ts:231`
- Deterministic fallback guard: `/videoforge/src/services/coverage-gateway.ts:769`

### Why this was not caught earlier
1. Existing fallback test only asserted deterministic failure when fallback has no mappings, but there is no positive fallback mapping test.
   - `/videoforge/tests/api-coverage-routes.test.ts:315`

2. No contract test verified that GraphQL fallback query document includes fields required by `getMuxAssetIdFromRecord`.

3. Manual browser checks confirmed absence of console errors but did not include gateway-path assertions for REST-404 + GraphQL-success with selectable videos.

## SpecFlow Analysis

### Affected flow
1. Open `/dashboard/coverage`
2. Load languages successfully
3. Attempt collections via REST `/api/coverage/collections` (404 on stage)
4. Run GraphQL fallback query
5. Build collections with zero selectable videos due to missing `muxAssetId`
6. Guard throws 502; page shows error state

### Required flow outcomes
- If GraphQL provides asset mappings, page should render selectable videos and translation controls.
- If GraphQL truly cannot provide mappings, keep deterministic explicit error with operator guidance.

## Proposed Solution

### Immediate fix
Update GraphQL fallback collections query to request schema-supported asset identifier fields and map them into `CoverageVideoSelectable`.

### Hardening
Add fallback-path tests for both:
- successful mapped fallback
- deterministic explicit failure when mappings are absent

### Diagnostic clarity
Improve fallback failure diagnostics to include a stable operator hint (without exposing sensitive payloads).

## Technical Approach

### Phase 1: Query + mapping alignment
- [x] Identify schema-supported mux asset identifier field(s) on coverage collections fallback query.
- [x] Update GraphQL fallback query in `/videoforge/src/services/coverage-gateway.ts` to request those field(s).
- [x] Extend `getMuxAssetIdFromRecord` only as needed for confirmed schema field paths.
- [x] Keep deterministic behavior: mapped -> selectable; unmapped-all -> explicit 502.

Files:
- `/videoforge/src/services/coverage-gateway.ts`

### Phase 2: Regression coverage
- [x] Add route test: REST 404 + GraphQL fallback with mappings returns collections containing selectable videos.
- [x] Keep/extend route test: fallback with no mappings returns deterministic 502.
- [x] Add contract test that fallback GraphQL query includes at least one mapped mux asset field path.

Files:
- `/videoforge/tests/api-coverage-routes.test.ts`
- `/videoforge/tests/coverage-gateway-language-contract.test.ts` (or split to `coverage-gateway-collections-contract.test.ts`)

### Phase 3: Runtime verification
- [ ] Verify `/dashboard/coverage` on local dev with stage gateway env no longer shows the muxAssetId-missing fallback error for normal mapped payloads.
- [x] Confirm select mode can create deterministic ordered job submissions for mapped items.

Files:
- `/videoforge/src/features/coverage/coverage-report-client.tsx` (verification only unless UI messaging changes required)

## Acceptance Criteria

### Functional
- [x] GraphQL fallback collections include at least one selectable video when gateway returns valid mappings.
- [ ] `/dashboard/coverage` does not show `Coverage GraphQL fallback did not return muxAssetId mappings for selectable videos.` for mapped fallback payloads.
- [x] Translation submission remains deterministic and contract-safe.

### Regression protection
- [x] Automated tests cover REST-404 -> GraphQL-fallback success with mappings.
- [x] Automated tests cover REST-404 -> GraphQL-fallback failure with no mappings.
- [x] Query contract test fails if mapped field path is removed from fallback query.

### Quality gates
- [x] `pnpm typecheck`
- [x] `pnpm test tests/api-coverage-routes.test.ts`
- [x] `pnpm test tests/dashboard-coverage-page.test.tsx`
- [x] `pnpm test` full suite

## Risks & Mitigations
- Risk: guessed field path may not exist across environments.
  - Mitigation: validate against stage gateway and keep candidate fallback extraction paths minimal and explicit.

- Risk: mapping added for parent records but absent for children.
  - Mitigation: include child-level mapping fields in query and add tests for both parent/child rows.

- Risk: loosening deterministic guard may mask real mapping outages.
  - Mitigation: retain explicit 502 when fallback has videos but zero selectable mappings.

## References
- `/videoforge/src/services/coverage-gateway.ts:231`
- `/videoforge/src/services/coverage-gateway.ts:633`
- `/videoforge/src/services/coverage-gateway.ts:769`
- `/videoforge/tests/api-coverage-routes.test.ts:315`
- `/videoforge/src/app/dashboard/coverage/page.tsx:55`
- `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
