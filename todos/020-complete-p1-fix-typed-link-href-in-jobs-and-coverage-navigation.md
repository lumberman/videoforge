---
status: complete
priority: p1
issue_id: "020"
tags: [code-review, typescript, routing, quality]
dependencies: []
---

# Fix typed Link href regressions in jobs and coverage navigation

## Problem Statement

The current change set introduces dynamic string `href` values for `next/link` in strict typed-routes mode, which fails `pnpm typecheck`. This is a merge blocker because CI/type checks fail and route safety guarantees are not upheld.

## Findings

- `pnpm typecheck` fails with `TS2322: Type 'string' is not assignable to type 'UrlObject | RouteImpl<string>'`.
- Failing references are in:
  - `/videoforge/src/app/dashboard/jobs/[id]/page.tsx` (header links using computed `coverageReportHref` / `jobsQueueHref`)
  - `/videoforge/src/app/dashboard/jobs/page.tsx` (computed `coverageReportHref`)
  - `/videoforge/src/features/coverage/coverage-report-client.tsx` (computed `jobsHref`)
- This is a known navigation-sensitive area. Related pattern documented in:
  - `/videoforge/docs/solutions/ui-bugs/coverage-language-context-loss-on-jobs-report-navigation-20260219.md`

## Proposed Solutions

### Option 1: Use typed `UrlObject` for dynamic query params

**Approach:** Replace string interpolation with `{ pathname, query }` objects and typed-safe query construction for each `Link`.

**Pros:**
- Preserves `next/link` typed-routes guarantees.
- Keeps navigation declarative and framework-aligned.

**Cons:**
- Slightly more verbose than string URLs.
- Requires careful handling of optional query shape.

**Effort:** Small (1-2 hours)

**Risk:** Low

---

### Option 2: Constrain strings with route casts at call sites

**Approach:** Keep existing strings and cast each to accepted route type.

**Pros:**
- Minimal code churn.
- Fastest local fix.

**Cons:**
- Weakens static safety and can mask invalid routes.
- Less maintainable for future query additions.

**Effort:** Small (30-60 minutes)

**Risk:** Medium

---

### Option 3: Centralize route builders with typed helpers

**Approach:** Add typed route helper utilities for jobs/report/detail links and reuse across pages/components.

**Pros:**
- Reduces duplication.
- Improves consistency and testability.

**Cons:**
- Slightly larger refactor.
- Needs careful migration to avoid regressions.

**Effort:** Medium (2-4 hours)

**Risk:** Low

## Recommended Action

Adopt **Option 1** and replace dynamic string hrefs with typed `UrlObject` `{ pathname, query }` objects in all affected `Link` callsites.

## Technical Details

**Affected files:**
- `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`

**Related components:**
- Jobs list header navigation
- Job detail header navigation
- Coverage header navigation to Jobs

**Database changes:**
- No

## Resources

- **Known pattern:** `/videoforge/docs/solutions/ui-bugs/coverage-language-context-loss-on-jobs-report-navigation-20260219.md`
- **Validation command:** `pnpm typecheck`

## Acceptance Criteria

- [x] `pnpm typecheck` passes with zero route typing errors.
- [x] Jobs and coverage links preserve language query context.
- [x] Existing navigation tests continue passing.
- [x] New/updated tests cover typed route construction where needed.

## Work Log

### 2026-02-20 - Review Finding Logged

**By:** Codex

**Actions:**
- Ran targeted tests and full typecheck.
- Confirmed runtime tests pass but typecheck fails on dynamic `Link href` strings.
- Logged merge-blocking todo with fix options.

**Learnings:**
- Current behavior is functionally correct in tests, but compile-time route safety is broken.
- This area already has prior regression history around query propagation.

### 2026-02-20 - Resolved with typed UrlObject hrefs

**By:** Codex

**Actions:**
- Updated dynamic links to typed `UrlObject` values in:
  - `/videoforge/src/app/dashboard/jobs/page.tsx`
  - `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
  - `/videoforge/src/features/coverage/coverage-report-client.tsx`
- Ran validation:
  - `pnpm typecheck`
  - `pnpm tsx --test tests/dashboard-jobs-page.test.tsx tests/dashboard-job-detail-page.test.tsx tests/coverage-report-client-translation-bar.test.tsx`

**Learnings:**
- `next/link` typed-routes mode accepts dynamic routing cleanly via `UrlObject`.
- Preserving query context remains deterministic while maintaining compile-time route safety.

## Notes

- This is a P1 because it blocks typed-route build/typecheck in the current branch state.
