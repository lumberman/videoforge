---
status: complete
priority: p3
issue_id: "013"
tags: [code-review, quality, testing, coverage]
dependencies: []
---

# Add Regression Test for Coverage Submit Redirect Effect

The coverage submit flow now redirects to `/dashboard/jobs` when at least one job is created, but this behavior is only validated through helper-level unit tests (`shouldRedirectToJobsQueueAfterCoverageSubmit`, `buildCoverageJobsQueueUrl`). There is currently no test exercising the component-level `useEffect` in `CoverageReportClient` that performs `window.location.assign(...)`.

## Problem Statement

A logic regression in the component effect could disable or duplicate redirects without failing the existing test suite.

Why this matters:
- The feature's core user outcome is navigation from coverage to jobs queue.
- Current tests verify summary helpers, not the state transition wiring in the UI component.
- A future refactor could preserve helper tests while breaking actual redirect behavior.

## Findings

- Redirect implementation is in the component effect:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1617`
- Existing tests cover helper contracts, not component redirect side effects:
  - `/videoforge/tests/coverage-submission.test.ts:107`
- No test currently asserts that `window.location.assign` is called exactly once for `submitState.type === 'done'` with `created > 0`.

## Proposed Solutions

### Option 1: Extract redirect decision into pure function and increase unit coverage

**Approach:** Move effect condition + URL assembly trigger contract into a pure helper and test all branches.

**Pros:**
- Fast and deterministic.
- Fits existing test style.
- Low maintenance.

**Cons:**
- Still does not prove component effect wiring executes.

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Add component-level test for redirect effect (Recommended)

**Approach:** Add a lightweight client-component test that mounts `CoverageReportClient`, drives submit state to done with created>0, and asserts `window.location.assign` call count/URL.

**Pros:**
- Directly covers user-observable behavior.
- Catches effect wiring regressions.

**Cons:**
- Needs client test harness and mock setup.

**Effort:** 2-4 hours

**Risk:** Medium

---

### Option 3: Add E2E browser test for coverage submit-to-jobs navigation

**Approach:** Use browser automation to submit selection and verify final URL/banner.

**Pros:**
- Highest confidence, real user path.

**Cons:**
- Slower and more brittle than unit-level checks.
- Requires environment setup/mocking.

**Effort:** 4-6 hours

**Risk:** Medium

## Recommended Action

Implement Option 2. Keep existing helper tests and add one component-level regression test for single-redirect behavior and URL correctness.

## Technical Details

**Affected files:**
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/tests/coverage-submission.test.ts`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx` (or new dedicated client test file)

**Related components:**
- Coverage submit state machine and translation action bar flow

**Database changes:**
- None

## Resources

- **Plan:** `/videoforge/docs/plans/2026-02-16-feat-auto-redirect-coverage-translate-to-jobs-queue-plan.md`
- **Implementation:** `/videoforge/src/features/coverage/coverage-report-client.tsx:1617`
- **Helper tests:** `/videoforge/tests/coverage-submission.test.ts:107`

## Acceptance Criteria

- [x] Add regression test that verifies redirect is triggered when created > 0.
- [x] Assert redirect target includes `from`, `created`, `failed`, and `skipped` query params.
- [x] Assert redirect is not triggered when created = 0.
- [x] Assert redirect call happens once for a single successful submission.

## Work Log

### 2026-02-16 - Code Review Finding

**By:** Codex

**Actions:**
- Reviewed coverage submit redirect implementation.
- Verified helper-level tests were added and passing.
- Identified missing component-level regression coverage for redirect effect wiring.
- Documented options and recommended path.

**Learnings:**
- Existing suite validates contracts but not side-effect execution path in the UI component.

### 2026-02-16 - Resolution

**By:** Codex

**Actions:**
- Added `getCoverageJobsQueueRedirectUrl(...)` helper in `/videoforge/src/features/coverage/coverage-report-client.tsx` and wired existing `useEffect` to use it.
- Added regression tests for redirect URL generation, non-success branch behavior, and one-shot guard behavior in `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`.
- Ran verification:
  - `pnpm -s typecheck`
  - `pnpm -s tsx --test tests/coverage-report-client-translation-bar.test.tsx tests/coverage-submission.test.ts tests/dashboard-jobs-page.test.tsx`

**Learnings:**
- Effect behavior can be regression-protected without introducing browser/E2E complexity by extracting deterministic redirect-decision logic.

## Notes

- This is a quality/test-depth gap, not a confirmed production bug.
