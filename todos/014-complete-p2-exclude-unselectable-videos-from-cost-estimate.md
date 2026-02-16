---
status: complete
priority: p2
issue_id: "014"
tags: [code-review, coverage, pricing, quality]
dependencies: []
---

# Exclude Unselectable Videos From Cost Estimate

The current coverage cost estimate includes videos that cannot produce jobs (`selectable: false`). This inflates estimated spend and can mislead operators when selected items are missing `muxAssetId` mappings.

## Problem Statement

Cost estimate behavior should match actual order execution scope. Currently, estimate math runs on all selected videos, but submission skips unselectable videos. This creates a mismatch between displayed estimate and created work.

## Findings

- Estimate input is derived from all selected IDs in `/videoforge/src/features/coverage/coverage-report-client.tsx:1485`.
- `getSelectedVideosInOrder` returns selected videos regardless of `selectable` state in `/videoforge/src/features/coverage/submission.ts:58`.
- Actual submit path explicitly skips unselectable items in `/videoforge/src/features/coverage/submission.ts:84`.
- Result: estimate can include videos that will be skipped at submit time.

## Proposed Solutions

### Option 1: Filter estimate input to selectable videos only

**Approach:** In the estimate path, filter selected videos with `video.selectable === true` before passing to `estimateCoverageTranslateCostUsd`.

**Pros:**
- Directly aligns estimate with executable jobs.
- Minimal change surface.

**Cons:**
- Hidden mismatch reason unless separately surfaced in UI.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep current estimate scope but add explanatory copy

**Approach:** Leave estimate over all selections and add message that unmappable videos may be skipped.

**Pros:**
- No logic change.
- Fastest implementation.

**Cons:**
- Continues inflated estimate behavior.
- Operator trust risk remains.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implemented Option 1. Estimate input is now filtered to `selectable: true` videos so displayed spend aligns with executable job creation scope.

## Technical Details

Affected files:
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/submission.ts`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`
- `/videoforge/tests/coverage-cost-estimate.test.ts`

## Resources

- Review branch: `cursor/coverage-translate-cost-estimate`
- Related plan: `/videoforge/docs/plans/2026-02-16-feat-add-coverage-translate-cost-estimate-plan.md`

## Acceptance Criteria

- [x] Estimate computation excludes `selectable: false` videos.
- [x] Estimated total matches the same effective video set used for job creation.
- [x] Regression tests cover mixed selectable/unselectable selections.
- [x] Existing submission and redirect behavior remains unchanged.

## Work Log

### 2026-02-16 - Review Finding Captured

**By:** Codex

**Actions:**
- Reviewed estimate input assembly and submit path skip logic.
- Confirmed behavioral mismatch between estimate scope and execution scope.
- Documented remediation options.

**Learnings:**
- Selection and execution paths currently diverge for unmappable videos.
- Estimate trust depends on close alignment with executable workload.

### 2026-02-16 - Resolution

**By:** Codex

**Actions:**
- Added `getSelectedSelectableVideosInOrder` in `/videoforge/src/features/coverage/submission.ts`.
- Updated estimate input in `/videoforge/src/features/coverage/coverage-report-client.tsx` to use selectable-only results.
- Added regression test `getSelectedSelectableVideosInOrder excludes unmappable items` in `/videoforge/tests/coverage-submission.test.ts`.
- Ran targeted tests and `pnpm typecheck`.

**Learnings:**
- Reusing submit-order helper while adding a selectable-only variant keeps behavior deterministic and testable.
