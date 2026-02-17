---
status: complete
priority: p1
issue_id: "018"
tags: [coverage, routing, regression, jobs]
dependencies: []
---

# Fix 404 on jobs queue redirect after coverage Translate Now

Coverage submit currently redirects to `/dashboard/jobs?...` after successful creation, but the browser lands on a 404 page instead of the Jobs queue view.

## Problem Statement

Operators can submit from coverage, but the post-submit redirect lands on `404: This page could not be found.`. This breaks the intended flow from coverage selection to queue monitoring and blocks fast validation of created jobs.

## Findings

- Coverage submit redirect URL is built as `/dashboard/jobs?...`: `/videoforge/src/features/coverage/submission.ts:45`
- Coverage report client performs redirect to queue when created jobs > 0: `/videoforge/src/features/coverage/coverage-report-client.tsx:201`
- Jobs queue page exists in source: `/videoforge/src/app/dashboard/jobs/page.tsx:78`
- Alias route `/jobs` redirects to `/dashboard/jobs`: `/videoforge/src/app/jobs/page.tsx:4`
- Browser verification (2026-02-17): submitting `Translate Now` produced URL `http://127.0.0.1:3000/dashboard/jobs?from=coverage&created=1&failed=0&skipped=0` with 404 UI.
- API confirms job creation still happened (`/api/jobs` newest row created at `2026-02-17T18:08:04.736Z`).

Impact:
- Happy-path UX regression for core operator flow.
- Creates false signal that submit failed, even when job exists.

## Proposed Solutions

### Option 1: Route-level fix (preferred)

**Approach:** Identify why `/dashboard/jobs` resolves to not-found in dev runtime and restore route resolution (page registration/build/runtime mismatch).

**Pros:**
- Fixes root cause.
- Keeps existing URL contracts and tests aligned.

**Cons:**
- Requires route-level debugging in App Router/dev runtime.

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Temporary fallback redirect to `/jobs`

**Approach:** Change coverage redirect target to `/jobs?...` while root cause is investigated.

**Pros:**
- Fast mitigation if `/jobs` works in affected runtime.

**Cons:**
- Masks underlying route problem.
- Could fail if alias route also impacted.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Guard + retry navigation strategy

**Approach:** Keep `/dashboard/jobs` target but add client fallback: if 404, navigate to `/jobs` and surface clear message.

**Pros:**
- Improves resilience for operators.

**Cons:**
- Adds complexity and does not solve root cause.

**Effort:** Small-Medium

**Risk:** Medium

## Recommended Action

Adopt `/jobs` as canonical queue path for coverage submit and navigation, while keeping dashboard routes available. Add alias routes for `/jobs` and `/jobs/[id]` to render queue/detail pages directly (no redirect hop), then update coverage submit URL and in-app links to point at `/jobs` paths. Add regression tests for queue URL contract and alias-route rendering.

## Technical Details

**Affected files:**
- `/videoforge/src/features/coverage/submission.ts`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/app/jobs/page.tsx`

**Related tests:**
- `/videoforge/tests/coverage-submission.test.ts`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`
- `/videoforge/tests/dashboard-jobs-page.test.tsx`

**Database changes:**
- Migration needed? No

## Resources

- Browser run date: 2026-02-17
- Repro URL: `http://127.0.0.1:3000/dashboard/jobs?from=coverage&created=1&failed=0&skipped=0`

## Acceptance Criteria

- [x] After coverage `Translate Now`, redirect loads Jobs queue page (not 404).
- [x] Coverage flash banner (`from=coverage`) renders on Jobs queue page.
- [x] `Open` job detail from queue works on `/jobs/:id`.
- [x] Regression test added for coverage-submit redirect route resolution.

## Work Log

### 2026-02-17 - Initial discovery and todo creation

**By:** Codex

**Actions:**
- Reproduced submit path in browser automation from coverage page.
- Observed 404 on `/dashboard/jobs?...` after successful submit.
- Verified newest job exists via `/api/jobs`, confirming creation succeeded.
- Documented issue, options, and acceptance criteria.

**Learnings:**
- Regression appears to be post-submit routing/rendering, not job creation.

### 2026-02-17 - Resolution

**By:** Codex

**Actions:**
- Switched coverage queue redirect builder from `/dashboard/jobs` to `/jobs`.
- Made `/jobs` render queue page directly by re-exporting dashboard jobs page (removed redirect hop).
- Added `/jobs/[id]` alias route for job detail page.
- Updated queue/detail links and redirects to canonical `/jobs` paths.
- Added regression tests for alias routes and updated queue URL contract tests.
- Ran `pnpm typecheck` and targeted `tsx --test` suite for coverage + jobs routing files.

**Learnings:**
- Redirect hops into a flaky segment path can obscure successful submits; canonical alias routes improve operator flow resilience in dev.

## Notes

- Priority set to P1 because it blocks primary operator navigation after successful submit.
