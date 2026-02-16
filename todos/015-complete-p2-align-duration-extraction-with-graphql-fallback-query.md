---
status: complete
priority: p2
issue_id: "015"
tags: [code-review, coverage, integration, quality]
dependencies: []
---

# Align Duration Extraction With GraphQL Fallback Query

Duration parsing was added, but the GraphQL fallback query does not request any duration field. In fallback mode, durations will remain null and estimates will rely on defaults, reducing estimate quality.

## Problem Statement

The new estimate depends on per-video duration when available. GraphQL fallback currently requests `muxVideo.assetId` but not duration metadata. This creates silent degradation in fallback environments and weakens estimate accuracy.

## Findings

- Duration extraction checks GraphQL-style duration paths in `/videoforge/src/services/coverage-gateway.ts:290`.
- GraphQL fallback query in `/videoforge/src/services/coverage-gateway.ts:668` only requests:
  - `variant { muxVideo { assetId } }`
- No duration fields are requested for top-level rows or `children`, so extracted duration is null in real fallback payloads.
- Contract tests validate parsing if duration is present, but they do not assert query shape contains duration fields.

## Proposed Solutions

### Option 1: Request duration fields in GraphQL fallback query

**Approach:** Extend fallback query to include supported duration fields (for both collection and children nodes) and assert presence in contract tests.

**Pros:**
- Restores intended estimate fidelity in fallback mode.
- Makes tests reflect runtime reality.

**Cons:**
- Requires schema-compatible field selection.

**Effort:** Medium

**Risk:** Medium

---

### Option 2: Explicitly treat fallback as duration-unknown and remove GraphQL duration extraction paths

**Approach:** Keep query unchanged, remove unsupported extraction assumptions, and document deterministic fallback duration behavior.

**Pros:**
- Simpler behavior model.
- Avoids schema drift risk from new GraphQL fields.

**Cons:**
- Lower estimate accuracy in fallback mode.
- Loses opportunity to use available metadata when supported.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implemented Option 2. GraphQL fallback behavior is now explicitly duration-unknown: query shape is asserted to exclude duration fields and fallback estimates use deterministic default duration when metadata is unavailable.

## Technical Details

Affected files:
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`
- `/videoforge/tests/api-coverage-routes.test.ts`

## Resources

- Related integration guardrail: `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
- Review branch: `cursor/coverage-translate-cost-estimate`

## Acceptance Criteria

- [x] Fallback query and extraction paths are aligned (either both support duration or both intentionally do not).
- [x] Contract tests assert the selected query shape for duration behavior.
- [x] Estimate behavior in fallback mode is explicit and deterministic.

## Work Log

### 2026-02-16 - Review Finding Captured

**By:** Codex

**Actions:**
- Compared duration extraction candidates against GraphQL fallback query document.
- Verified query currently lacks duration fields.
- Documented options balancing schema risk and estimate quality.

**Learnings:**
- Adapter query/extractor drift can silently degrade features without obvious runtime failures.
- Contract tests should verify query field shape for critical estimate inputs.

### 2026-02-16 - Resolution

**By:** Codex

**Actions:**
- Removed unsupported GraphQL-style nested duration extraction assumptions from `/videoforge/src/services/coverage-gateway.ts`.
- Updated fallback tests in `/videoforge/tests/api-coverage-routes.test.ts` and `/videoforge/tests/coverage-gateway-collections-contract.test.ts` to assert query does not request duration fields and that fallback durations remain `null`.
- Ran targeted tests and `pnpm typecheck`.

**Learnings:**
- Making fallback limitations explicit and tested is safer than optimistic schema assumptions that can drift across environments.
