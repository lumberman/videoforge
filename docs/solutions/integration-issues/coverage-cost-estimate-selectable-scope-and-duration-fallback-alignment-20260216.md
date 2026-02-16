---
module: Coverage Translation Flow
date: 2026-02-16
problem_type: integration_issue
component: coverage_client_and_gateway_adapter
symptoms:
  - "Estimated cost could include selected videos that are skipped at submit time due to missing muxAssetId mapping."
  - "Duration extraction logic assumed nested GraphQL fallback duration fields that were not requested by the fallback query."
  - "Headed browser QA showed estimate visibility depended on having selectable videos in the current language dataset."
root_cause: estimate_scope_mismatch_and_adapter_query_extractor_drift
resolution_type: code_fix
severity: high
tags: [coverage, estimate, selectable, graphql-fallback, adapter-contract, integration]
---

# Troubleshooting: Coverage Cost Estimate Scope Mismatch and GraphQL Fallback Duration Drift

## Problem
Two integration mismatches reduced estimate accuracy and operator trust in `/dashboard/coverage`:

1. Estimate scope used all selected videos, while submit flow skips `selectable: false` items.
2. Duration extraction expected nested fallback GraphQL fields that the fallback query did not request.

This caused inflated estimates in mixed selections and silent duration-default behavior in fallback mode.

## Environment
- Module: Coverage Translation Flow
- Affected Components:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx`
  - `/videoforge/src/features/coverage/submission.ts`
  - `/videoforge/src/services/coverage-gateway.ts`
- Date solved: 2026-02-16

## Symptoms
- Selecting videos with missing mappings could still influence displayed cost.
- Fallback collections could never provide nested duration fields as implemented, so estimates defaulted durations.
- In headed browser flow, estimate appeared only when selectable items were part of active selection.

## What Didn’t Work

**Attempted approach:** Estimate all selected videos for simplicity.
- **Why it failed:** Submit path (`submitCoverageSelection`) is scoped to executable videos only, producing mismatched user expectations.

**Attempted approach:** Parse nested fallback duration candidates (`variant.muxVideo.duration*`) without query support.
- **Why it failed:** Fallback GraphQL query only requested `assetId`, so nested duration candidates were unavailable by contract.

## Solution

Implemented two targeted fixes plus regression coverage.

### 1) Align estimate scope with executable workload
Estimate input is now filtered to selectable videos only:

```ts
// /videoforge/src/features/coverage/coverage-report-client.tsx
getSelectedVideosInOrder(cachedCollections, selectedSet).filter((video) => video.selectable)
```

This matches submit behavior where unselectable videos are skipped:

```ts
// /videoforge/src/features/coverage/submission.ts
if (!video.selectable || !video.muxAssetId) { /* skipped */ }
```

### 2) Align fallback duration behavior with actual query contract
Removed unsupported nested fallback duration assumptions from extraction candidates:

```ts
// /videoforge/src/services/coverage-gateway.ts
const directCandidates = [
  record.durationSeconds,
  record.duration,
  record.runtime,
  record.length,
  getNestedString(record, ['duration', 'seconds']),
  getNestedValue(record, ['durationSeconds'])
];
```

Added contract assertions that fallback query does **not** request duration fields:

```ts
// /videoforge/tests/coverage-gateway-collections-contract.test.ts
assert.doesNotMatch(body.query ?? '', /\bduration(seconds)?\b/i);
```

Fallback duration behavior is now explicit and deterministic (`durationSeconds: null` unless directly available).

### 3) Verify integration behavior in headed browser QA
Headed test pass on `/dashboard/coverage` confirmed:
- `Estimated cost` hidden at `0 videos selected`.
- `Estimated cost` appears when selectable videos are selected.
- `Estimated cost` hidden again after reset to zero selected.

## Why This Works
The fix re-establishes contract parity:
- UI estimate scope now matches submit execution scope.
- Adapter extraction now matches declared fallback query shape.
- Tests lock both assumptions to prevent silent drift.

## Prevention
- Keep estimate inputs aligned with executable submission set, not raw selection state.
- Treat adapter query and extractor candidates as a single contract and assert both in tests.
- Add browser QA checks for estimate appear/disappear tied to selection state.
- For worktrees, standardize `.env.local` symlink setup to avoid false-negative QA due to missing gateway configuration.

## Verification
- `pnpm exec tsx --test tests/coverage-submission.test.ts tests/api-coverage-routes.test.ts tests/coverage-gateway-collections-contract.test.ts tests/coverage-cost-estimate.test.ts tests/coverage-report-client-translation-bar.test.tsx`
- `pnpm typecheck`
- Headed browser run with `agent-browser --headed` on `/dashboard/coverage`

All targeted checks passed.

## Related Files
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/submission.ts`
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/coverage-submission.test.ts`
- `/videoforge/tests/api-coverage-routes.test.ts`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`

## Related Issues
- `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
