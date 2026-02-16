---
status: complete
priority: p2
issue_id: "011"
tags: [code-review, quality, ux, coverage]
dependencies: []
---

# Remove Translation Scope Toggle Completely

Delete the translation scope toggle entirely instead of implementing scope-specific submission behavior.

## Problem Statement

The UI exposes a translation scope switch, but submission logic does not use scope at all. This creates misleading behavior. To keep behavior explicit and simple, the scope toggle should be removed completely.

## Findings

- `src/features/coverage/coverage-report-client.tsx:958` renders scope controls for `missing` and `all`.
- `src/features/coverage/coverage-report-client.tsx:1633` submission path (`handleTranslate`) ignores `translationScope` entirely.
- Result: scope state changes visual styling only, with no change to payload, selected videos, or filtering.

## Proposed Solutions

### Option 1: Remove scope UI and state (Required)

**Approach:** Remove scope buttons and keep explicit manual selection only.

**Pros:**
- Eliminates misleading control immediately
- Simplifies UI and state

**Cons:**
- Removes an unused UI affordance

**Effort:** 30-60 minutes

**Risk:** Low

## Recommended Action

Completed:
- removed scope toggle UI controls,
- removed `translationScope` state and related props,
- kept explicit manual selection flow,
- added test coverage to assert toggle controls are absent.

## Technical Details

**Affected files:**
- `/videoforge/src/features/coverage/coverage-report-client.tsx:958`
- `/videoforge/src/features/coverage/coverage-report-client.tsx:1633`
- `/videoforge/tests/dashboard-coverage-page.test.tsx` (add behavior coverage)

**Related components:**
- Coverage selection mode
- Translation job creation flow (`/api/jobs`)

**Database changes (if any):**
- No

## Resources

- **Branch:** `prev-version-merge-code-1`
- **Related plan:** `/videoforge/docs/plans/2026-02-15-feat-restore-coverage-report-design-parity-plan.md`

## Acceptance Criteria

- [x] Translation scope controls are removed from coverage UI
- [x] `translationScope` state/props are removed from client component logic
- [x] UI copy matches implemented behavior
- [x] Tests assert scope toggle controls are not rendered
- [x] No regression in existing coverage submission tests

## Work Log

### 2026-02-15 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed translation action bar and submit handler wiring
- Confirmed scope state is never consumed in submission logic
- Updated instruction to remove scope toggle completely

**Learnings:**
- The issue is user-facing and easy to miss in automated tests without explicit scope-path assertions.

### 2026-02-16 - Implemented and Verified

**By:** Codex

**Actions:**
- Removed scope toggle rendering and scope-related props/state from `/videoforge/src/features/coverage/coverage-report-client.tsx`.
- Exported and tested `TranslationActionBar` behavior in `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`.
- Verified no regressions with full `pnpm test` run.

**Learnings:**
- Removing an unimplemented control simplified both UI logic and user expectations.

## Notes

- Keep behavior deterministic and explicit; avoid implied scope semantics.
