---
module: Coverage Gateway
date: 2026-02-15
problem_type: integration_issue
component: service_object
symptoms:
  - "Coverage page rendered `Cannot query field \"nativeName\" on type \"Language\".` when loading language fallback data."
  - "Coverage page rendered `Coverage GraphQL fallback did not return muxAssetId mappings for selectable videos.` when collections REST fallback was active."
  - "Fallback GraphQL payload produced videos but all were non-selectable, blocking translation submission."
root_cause: schema_drift_and_missing_mapping_fields
resolution_type: code_fix
severity: high
tags: [coverage, graphql, schema-drift, muxassetid, fallback, integration]
---

# Troubleshooting: Coverage GraphQL Schema Drift and Missing Fallback `muxAssetId` Mapping

## Problem
Coverage fallback behavior depended on GraphQL fields that did not match the stage gateway schema, and the fallback collections query omitted a required `muxAssetId` mapping path. This caused user-facing runtime failures on `/dashboard/coverage` and blocked translation workflows.

## Environment
- Module: Coverage Gateway
- Affected Component: Coverage service adapter and fallback query normalization
- Date solved: 2026-02-15

## Symptoms
- Page error: `Cannot query field "nativeName" on type "Language".`
- Page error: `Coverage GraphQL fallback did not return muxAssetId mappings for selectable videos.`
- Coverage loaded with zero selectable videos even when collections existed.

## What Didn't Work

**Attempted Solution 1:** Relying on existing fallback language query and existing tests.
- **Why it failed:** Tests did not force REST-empty/404 -> GraphQL-fallback error branches, so schema mismatch escaped detection.

**Attempted Solution 2:** Using fallback collections query without explicit mux mapping fields.
- **Why it failed:** `getMuxAssetIdFromRecord` had candidate extraction paths, but fallback query did not return any compatible field, so all videos remained unmappable.

## Solution

Implemented a two-part adapter fix plus deterministic regression coverage.

### 1) Fix language fallback schema compatibility
Updated coverage language fallback query to use the schema-safe alias form:

```ts
// /videoforge/src/services/coverage-gateway.ts
languages(limit: 2500) {
  id
  name(languageId: "529") {
    value
  }
  nativeName: name(primary: true) {
    value
  }
}
```

This removed direct dependency on `Language.nativeName` field existence while preserving `nativeLabel` extraction semantics.

### 2) Restore `muxAssetId` mapping in collections fallback
Validated stage schema and confirmed supported mapping path is `variant.muxVideo.assetId`. Then updated query + extractor:

```ts
// /videoforge/src/services/coverage-gateway.ts
variant(languageId: $languageId) {
  slug
  muxVideo {
    assetId
  }
}
```

```ts
// /videoforge/src/services/coverage-gateway.ts
getNestedString(record, ['variant', 'muxVideo', 'assetId'])
```

Also kept deterministic guard behavior:
- Fallback has videos + zero selectable mappings -> explicit `502` error.

### 3) Add regression and contract tests for fallback branches
Added tests that explicitly exercise the previously missed branches:
- Language fallback GraphQL error path and query-shape assertions.
- Collections fallback success path with selectable mapped video.
- Collections fallback deterministic failure path when mappings are absent.
- Contract tests asserting query document includes mapping fields.

Key test files:
- `/videoforge/tests/api-coverage-routes.test.ts`
- `/videoforge/tests/dashboard-coverage-page.test.tsx`
- `/videoforge/tests/coverage-gateway-language-contract.test.ts`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`

## Why This Works
1. The adapter now queries fields that actually exist in the gateway schema (`name(primary: true)` alias and `variant.muxVideo.assetId`).
2. Fallback payload normalization and query documents are aligned, so selectable videos can be produced deterministically when mappings are present.
3. Tests now cover both fallback success and fallback failure paths, preventing false confidence from REST-only happy paths.
4. Deterministic explicit failure behavior remains intact when mappings are truly unavailable.

## Prevention
- Add/maintain contract tests that assert fallback GraphQL query documents include required mapping fields.
- Keep fallback-path tests mandatory in CI (REST empty/404 -> GraphQL path must be exercised).
- During browser QA for integration-heavy pages, assert rendered HTML error states in addition to console logs.
- For gateway schema-dependent changes, run lightweight introspection/probe queries before finalizing adapter field paths.

## Verification
- `pnpm typecheck`
- `pnpm test tests/api-coverage-routes.test.ts`
- `pnpm test tests/dashboard-coverage-page.test.tsx`
- `pnpm test tests/coverage-gateway-language-contract.test.ts`
- `pnpm test tests/coverage-gateway-collections-contract.test.ts`
- `pnpm test` (full suite)

All of the above passed after the fixes.

## Related Files
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/api-coverage-routes.test.ts`
- `/videoforge/tests/dashboard-coverage-page.test.tsx`
- `/videoforge/tests/coverage-gateway-language-contract.test.ts`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`

## Related Issues
- Related deterministic fallback pattern: `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- Related API classification guardrail: `/videoforge/docs/solutions/logic-errors/malformed-json-body-misclassified-as-500-jobs-api-20260215.md`
