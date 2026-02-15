---
status: completed
priority: p2
issue_id: "005"
tags: [code-review, reliability, observability, mux-ai]
dependencies: []
---

# Stop Retrying Non-Retryable Mux Config Errors

Workflow step retry logic currently retries configuration/import dependency failures that are deterministic and non-retryable.

## Problem Statement

When mux runtime config is missing (or import fails for deterministic reasons), the workflow retries the same failing step up to 3 attempts. This delays terminal failure and creates duplicate error entries without increasing chance of recovery.

## Findings

- Generic retry loop applies to all step errors (`/videoforge/src/workflows/videoEnrichment.ts:89`).
- On each failed attempt, the same dependency error is appended (`/videoforge/src/workflows/videoEnrichment.ts:105`).
- Reproduction with missing mux env produced:
  - `status: failed`
  - `retries: 2`
  - `errorCount: 3`
  for the same `MUX_AI_CONFIG_MISSING` condition.

## Proposed Solutions

### Option 1: Short-circuit retries for known non-retryable mux errors (recommended)

**Approach:** In `runStep`, detect `MuxAiError` codes (`MUX_AI_CONFIG_MISSING`, `MUX_AI_IMPORT_FAILED`, possibly `MUX_AI_INVALID_RESPONSE`) and skip further retries.

**Pros:**
- Faster, clearer failure for operators.
- Reduces duplicate error noise.

**Cons:**
- Needs explicit non-retryable code list maintenance.

**Effort:** Small

**Risk:** Low

---

### Option 2: Add `isRetryable` on `MuxAiError`

**Approach:** Extend `MuxAiError` with a retryability flag set by error constructor helpers.

**Pros:**
- Centralized retry policy in adapter layer.
- Cleaner workflow logic.

**Cons:**
- Slightly larger API change in error model.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Keep retries but collapse duplicate error entries

**Approach:** Preserve retries, but de-duplicate same step/message/code during step updates.

**Pros:**
- Lower noise with minimal behavior change.

**Cons:**
- Still delays deterministic failures.
- Does not address wasted retries.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Apply Option 1: short-circuit retries in `runStep()` for deterministic mux dependency errors.

Implemented behavior:
- Non-retryable mux codes are explicit in `/videoforge/src/workflows/videoEnrichment.ts`:
  - `MUX_AI_CONFIG_MISSING`
  - `MUX_AI_IMPORT_FAILED`
  - `MUX_AI_INVALID_RESPONSE`
- `runStep()` sets failed state once and exits retry loop immediately for those codes.
- Terminal catch-path uses `appendJobError(..., { dedupeLast: true })` as the single dedupe mechanism.
- Regression coverage confirms no retries for missing runtime config and invalid-response failures.

## Technical Details

**Affected files:**
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/tests/workflow-state.test.ts`

## Resources

- Review evidence command (deterministic retry noise):
  - `cd /videoforge && pnpm -s tsx -e "(async()=>{ ... startVideoEnrichment(...); console.log({status,retries,errorCount,...}); })()"`

## Acceptance Criteria

- [x] Non-retryable mux dependency errors stop retry loop after first failure.
- [x] Job still records structured dependency metadata (`code`, `operatorHint`, `isDependencyError`).
- [x] Workflow reaches failed terminal state without duplicate deterministic attempts.
- [x] Add regression test asserting retry count and error count for missing mux config path.

## Work Log

### 2026-02-15 - Code Review Finding

**By:** Codex

**Actions:**
- Reviewed step retry loop behavior for mux dependency errors.
- Reproduced missing-config execution and measured retries/error duplication.
- Proposed targeted retry policy options.

**Learnings:**
- Deterministic dependency failures should fail fast; retries reduce signal quality.
- Structured errors are most useful when each entry reflects distinct attempts/conditions.

### 2026-02-15 - Remediation Completed

**By:** Codex

**Actions:**
- Confirmed non-retryable mux dependency policy in `runStep()` logic.
- Simplified orchestration error dedupe path to avoid duplicate conditional checks.
- Added workflow regression coverage for deterministic invalid-response failures.

**Result:**
- Deterministic mux dependency failures now fail once with clear operator signal.
- Retry and error logs remain focused on recoverable/transient conditions.

## Notes

This is not merge-blocking by itself, but should be addressed soon to improve operator experience and reliability semantics.
