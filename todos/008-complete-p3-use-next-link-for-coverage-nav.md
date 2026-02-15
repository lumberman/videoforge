---
status: completed
priority: p3
issue_id: "008"
tags: [code-review, quality, frontend]
dependencies: []
---

# Use Next.js Link for Coverage Navigation

## Problem Statement

The new Coverage navigation item uses a raw `<a>` tag instead of Next.js `<Link>`. This triggers full-page reload behavior for internal navigation and drops framework-level route optimizations.

## Findings

- Internal nav currently mixes `Link` and plain anchor in the same menu (`/videoforge/src/app/layout.tsx:29`).
- The issue was introduced as a typed-routes workaround, but it regresses expected App Router navigation behavior.

## Proposed Solutions

### Option 1: Restore `Link` with typed route support (recommended)

**Approach:** Keep typed routes enabled and add/update route typing so `/dashboard/coverage` is recognized, then switch the anchor back to `Link`.

**Pros:**
- Preserves consistent framework-native navigation behavior.
- Restores prefetching and client-side transitions.

**Cons:**
- May require route type regeneration or config adjustment.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep anchor but document explicit rationale

**Approach:** Accept full reload behavior and document why this route should remain hard-navigated.

**Pros:**
- No tooling/config work.

**Cons:**
- UX inconsistency remains.
- Harder to justify long term.

**Effort:** Small

**Risk:** Medium

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `/videoforge/src/app/layout.tsx`

**Related components:**
- Top-level dashboard navigation and routing behavior.

**Database changes (if any):**
- No

## Resources

- **Plan:** `/videoforge/docs/plans/2026-02-15-feat-migrate-legacy-coverage-reporting-order-flow-plan.md`

## Acceptance Criteria

- [x] Coverage nav uses Next.js `Link` for internal routing.
- [x] Typed route checks pass without fallback anchor usage.
- [x] Manual navigation between Jobs and Coverage performs client-side transitions.

## Work Log

### 2026-02-15 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed layout navigation implementation in updated branch.
- Confirmed Coverage route uses plain anchor while Jobs uses `Link`.

**Learnings:**
- Typed route friction should be solved at route typing layer, not by downgrading internal navigation behavior.

## Notes

Low severity UX/consistency item.
