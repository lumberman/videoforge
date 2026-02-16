---
title: "fix: Detect and prevent coverage language query schema-drift failures"
type: fix
status: active
date: 2026-02-15
---

# fix: Detect and prevent coverage language query schema-drift failures

## Overview
When opening `/dashboard/coverage`, the UI can show:

`Cannot query field "nativeName" on type "Language".`

This plan fixes the immediate query incompatibility and closes the test gaps that allowed it to ship undetected.

## Problem Statement / Motivation
Coverage language loading currently has multiple paths, and at least one GraphQL fallback query is not schema-compatible with the stage gateway. The result is a runtime user-facing failure on a core dashboard route.

This is high priority because:
- it breaks a primary operator workflow (`/dashboard/coverage`)
- it indicates schema-drift risk between local assumptions and gateway reality
- current tests falsely pass while real users can still hit this error

## Found Brainstorm Context
Found brainstorm from 2026-02-15: `coverage-report-design-parity`. Using as context for planning.

Relevant carried decision:
- deterministic and explicit failure behavior should be preserved over silent fallback

Reference:
- `/videoforge/docs/brainstorms/2026-02-15-coverage-report-design-parity-brainstorm.md`

## Root Cause Analysis

### Primary technical cause
`fetchCoverageLanguagesFromGraphql` requests `nativeName` as a direct field:
- `/videoforge/src/services/coverage-gateway.ts:617`

The gateway schema on the failing environment does not expose `Language.nativeName`, so GraphQL returns:
- `Cannot query field "nativeName" on type "Language".`

### Why users saw it
Language loading fallback behavior:
1. try REST endpoint at `${baseUrl}/api/languages`
2. if REST returns empty or 404 path, run GraphQL fallback query

If fallback is triggered, the incompatible field causes a GraphQL error surfaced back through the coverage route.

Related code:
- `/videoforge/src/services/coverage-gateway.ts:715`
- `/videoforge/src/services/coverage-gateway.ts:733`
- `/videoforge/src/services/coverage-gateway.ts:420`

### Why this was not caught earlier
1. Test coverage gap: existing tests mocked happy-path language responses and did not simulate schema incompatibility on GraphQL fallback.
   - `/videoforge/tests/api-coverage-routes.test.ts`

2. No explicit fallback-failure contract test for coverage languages (REST non-usable + GraphQL `errors[]` payload).

3. Browser validation gap: ad-hoc browser checks focused on console/runtime errors but did not assert for user-visible error text rendered in the page body.

4. Query ownership duplication: language schema assumptions exist in more than one place (`/api/languages` route and `coverage-gateway` GraphQL fallback), increasing drift risk.

## SpecFlow Analysis

### Affected flow
1. User opens `/dashboard/coverage`
2. Server calls `fetchCoverageLanguages(baseUrl)`
3. REST language endpoint unavailable/empty
4. GraphQL fallback runs
5. Schema mismatch returns `errors[]`
6. UI displays failure message

### Missing guardrails
- No test that forces step 3 + 4 + 5 in one deterministic scenario.
- No schema-compatibility canary for language query documents.

## Proposed Solution

### Immediate fix
Update coverage GraphQL language query to use schema-compatible field selection (same semantics as the known-working language shape), avoiding direct `nativeName` field assumptions.

### Structural hardening
Unify language query shape across fallback paths so there is one canonical language field contract for coverage.

### Test hardening
Add deterministic tests that fail on GraphQL schema errors and assert user-facing behavior.

## Technical Approach

### Phase 1: Query compatibility fix
- [x] Update coverage GraphQL fallback language query to remove schema-unsafe `nativeName` field usage.
- [x] Normalize native label extraction so behavior remains stable when native label data is absent.
- [x] Keep route behavior deterministic: return explicit 502 with actionable message when fallback query fails.

Files:
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/src/app/api/coverage/languages/route.ts`

### Phase 2: Test gap closure
- [x] Add route-level test: REST language endpoint non-usable + GraphQL `errors[]` returns 502 with stable error message.
- [x] Add route-level test: REST language response empty triggers GraphQL fallback, and fallback success returns normalized language list.
- [x] Add page-level test: `/dashboard/coverage` renders explicit error state for language-loading schema failures (no silent success).
- [x] Add regression assertion that catches GraphQL field errors in rendered HTML (`Cannot query field`).

Files:
- `/videoforge/tests/api-coverage-routes.test.ts`
- `/videoforge/tests/dashboard-coverage-page.test.tsx`

### Phase 3: Future drift detection
- [x] Add a lightweight query-contract test module for coverage language query docs (mocked GraphQL error payloads for unknown fields).
- [x] Add CI-safe guard: ensure fallback query path is always exercised in automated tests (not only REST success path).
- [ ] Add optional non-blocking stage smoke check script (manual/cron, not default test suite) to validate production-like query compatibility.

Files:
- `/videoforge/tests/coverage-gateway-language-contract.test.ts` (new)
- `/videoforge/package.json` (optional script entry)

## Acceptance Criteria

### Functional
- [x] Opening `/dashboard/coverage` no longer fails due to `nativeName` field query errors.
- [x] Coverage languages load successfully when GraphQL fallback path is used.
- [x] If gateway language query fails, UI shows explicit deterministic failure state.

### Regression protection
- [x] Automated tests fail if unknown GraphQL field errors occur in the coverage language fallback path.
- [x] Automated tests cover both REST-success and REST-fallback-to-GraphQL branches.
- [ ] Browser QA checklist includes scanning rendered DOM text for GraphQL errors, not only console logs.

### Quality gates
- [x] `pnpm typecheck`
- [x] `pnpm test tests/api-coverage-routes.test.ts`
- [x] `pnpm test tests/dashboard-coverage-page.test.tsx`
- [x] `pnpm test` full suite

## Risks & Mitigations
- Risk: fixing one field still leaves future schema drift unnoticed.
  - Mitigation: add explicit fallback-path contract tests and optional stage smoke check.

- Risk: overfitting to one gateway version.
  - Mitigation: parse flexible language payload shape and keep deterministic error handling.

- Risk: new tests become flaky if they depend on external network.
  - Mitigation: keep default tests fully mocked and deterministic; isolate any real-network check into optional tooling.

## Why This Plan Addresses “Why It Was Missed”
This plan directly targets the exact miss:
- It adds tests for the branch that was previously untested (GraphQL fallback failure).
- It adds assertions for user-visible error content, not just console errors.
- It reduces schema assumption duplication by converging language query semantics.

## References
- `/videoforge/src/services/coverage-gateway.ts:609`
- `/videoforge/src/services/coverage-gateway.ts:617`
- `/videoforge/src/services/coverage-gateway.ts:715`
- `/videoforge/src/services/coverage-gateway.ts:733`
- `/videoforge/src/app/api/coverage/languages/route.ts:1`
- `/videoforge/tests/api-coverage-routes.test.ts:1`
- `/videoforge/tests/dashboard-coverage-page.test.tsx:1`
- `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
