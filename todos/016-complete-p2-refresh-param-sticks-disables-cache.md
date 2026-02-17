---
status: complete
priority: p2
issue_id: "016"
tags: [code-review, performance, coverage]
dependencies: []
---

# Clear one-shot refresh param after forced coverage reload

`refresh` is intended as a one-shot cache-bust trigger, but current navigation keeps it in the URL and reuses it across follow-up interactions. This can silently disable the new server cache and reintroduce slow coverage page loads.

## Problem Statement

The `Refresh now` button appends `refresh=<timestamp>` and performs a full navigation. The coverage page treats any non-empty `refresh` value as `forceRefresh=true`. The language selector preserves existing query params when applying language changes, so `refresh` persists and forces fresh fetches repeatedly.

This undermines the intended warm-cache speedup and creates confusing behavior where users think cache is enabled but keep paying cold-fetch latency.

## Findings

- `Refresh now` appends `refresh` and navigates: `/videoforge/src/features/coverage/coverage-report-client.tsx:1940`
- Coverage page force-refresh check is boolean on presence of refresh: `/videoforge/src/app/dashboard/coverage/page.tsx:61`
- Language selector preserves current query params, including `refresh`: `/videoforge/src/features/coverage/LanguageGeoSelector.tsx:426`

Impact:
- A single refresh can make subsequent route loads uncached until user manually removes `refresh`.
- Performance regression in normal operator flow.

## Proposed Solutions

### Option 1: Strip refresh from URL after server read

**Approach:** Keep `refresh` as trigger, but normalize URL after load by removing `refresh` (server redirect or client replace).

**Pros:**
- Keeps one-shot semantics explicit.
- Works for all navigation entry points.

**Cons:**
- Requires additional navigation handling logic.

**Effort:** Small

**Risk:** Low

---

### Option 2: Language selector explicitly drops refresh

**Approach:** In `applyUrlParams`, remove `refresh` before composing `nextUrl`.

**Pros:**
- Minimal code change.
- Fixes primary user flow immediately.

**Cons:**
- Only fixes selector path; other links preserving query could still retain `refresh`.

**Effort:** Small

**Risk:** Low

---

### Option 3: Switch to explicit force-refresh endpoint/state

**Approach:** Replace query-param bust with dedicated endpoint or transient state token that is not retained in URL.

**Pros:**
- Eliminates URL persistence class of bugs.

**Cons:**
- More complexity and larger refactor.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Implement Option 1 (or Option 2 as a fast patch), then add a regression test that confirms cache is used again after one forced refresh.

## Technical Details

**Affected files:**
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx`
- `/videoforge/src/app/dashboard/coverage/page.tsx`

**Database changes:**
- Migration needed? No

## Resources

- **Commit reviewed:** `44e707c`
- **Plan:** `/videoforge/docs/plans/2026-02-17-feat-coverage-server-cache-load-speed-plan.md`

## Acceptance Criteria

- [x] `refresh` only affects one immediate load.
- [x] Subsequent language changes use cache when eligible.
- [x] Automated test covers one-shot refresh semantics.

## Work Log

### 2026-02-17 - Review Finding Creation

**By:** Codex

**Actions:**
- Reviewed cache-bust path and query-param propagation across coverage components.
- Confirmed `refresh` persistence leads to repeated `forceRefresh=true`.
- Documented remediation options.

**Learnings:**
- Query-param-based busting needs explicit clearing to stay one-shot.

### 2026-02-17 - Resolution

**By:** Codex

**Actions:**
- Switched force-refresh trigger to explicit one-shot token (`refresh=1`).
- Added client-side URL normalization to strip `refresh` after first load.
- Ensured language selector removes `refresh` when applying new params.
- Added regression tests for refresh-token parsing and URL cleanup helper.

## Notes

- Priority set to P2 because it materially degrades feature goal (fast warm loads) but does not cause data loss/security impact.
