---
status: completed
priority: p1
issue_id: "006"
tags: [code-review, reliability, architecture, coverage]
dependencies: []
---

# Preserve muxAssetId Mapping in GraphQL Fallback Path

## Problem Statement

The GraphQL fallback path for coverage collections does not request any field that can resolve `muxAssetId`, but downstream logic requires `muxAssetId` to make an item selectable/submittable. If the REST coverage endpoint is unavailable (404), all fallback records become non-selectable and job creation from coverage silently stops working.

## Findings

- Mapping logic expects one of several `muxAssetId` candidates (`/videoforge/src/services/coverage-gateway.ts:228`).
- The GraphQL fallback query omits all of those candidate fields in both parent and child selections (`/videoforge/src/services/coverage-gateway.ts:626`).
- Fallback records are therefore normalized as non-selectable with a generic reason, blocking order flow instead of preserving functionality (`/videoforge/src/services/coverage-gateway.ts:295`).
- Known pattern match: avoid silent fallback behavior that hides actionable failure modes (`/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`).

## Proposed Solutions

### Option 1: Extend GraphQL query to include canonical mux asset identifier (recommended)

**Approach:** Add explicit fields (for both collection-level and child records) that the gateway schema exposes for Mux asset mapping, then map directly in `getMuxAssetIdFromRecord`.

**Pros:**
- Preserves functional parity between primary and fallback paths.
- Keeps current UX and API behavior unchanged.

**Cons:**
- Requires schema knowledge and validation against gateway contract.

**Effort:** Small

**Risk:** Low

---

### Option 2: Fail fallback explicitly when mux mapping field is unavailable

**Approach:** If GraphQL fallback does not provide mapping fields, return a structured API error instead of rendering non-selectable rows.

**Pros:**
- Eliminates silent degradation.
- Gives operators immediate actionable diagnostics.

**Cons:**
- Coverage page becomes unavailable instead of partially usable.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Add secondary lookup endpoint for mux mapping

**Approach:** Keep existing fallback query, then resolve missing mappings via a second adapter request keyed by video IDs.

**Pros:**
- Decouples coverage payload from mapping contract.
- Can improve resilience if schemas are fragmented.

**Cons:**
- Adds latency and complexity.
- More moving parts to test and monitor.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/api-coverage-routes.test.ts`

**Related components:**
- `/videoforge/src/app/api/coverage/collections/route.ts`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`

**Database changes (if any):**
- No

## Resources

- **Plan:** `/videoforge/docs/plans/2026-02-15-feat-migrate-legacy-coverage-reporting-order-flow-plan.md`
- **Related solution:** `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`

## Acceptance Criteria

- [x] GraphQL fallback returns at least one deterministic mux mapping field per selectable record.
- [x] Fallback path can produce selectable rows and create jobs successfully.
- [x] Add regression test covering REST-404 -> GraphQL fallback with successful mapping.
- [x] If mapping is impossible, API returns explicit structured error (not silent non-selectable-only degradation).

## Work Log

### 2026-02-15 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed fallback mapping logic and GraphQL coverage query fields.
- Cross-checked required mux mapping candidates against queried payload.
- Confirmed mismatch that can force all fallback items into non-selectable state.

**Learnings:**
- Fallback behavior should preserve critical submit capability or fail explicitly with operator guidance.

## Notes

This is merge-blocking because it can disable core order flow whenever fallback is active.
