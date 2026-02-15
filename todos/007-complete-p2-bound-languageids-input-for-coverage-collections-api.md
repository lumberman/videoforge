---
status: completed
priority: p2
issue_id: "007"
tags: [code-review, security, performance, api]
dependencies: []
---

# Bound languageIds Input for Coverage Collections API

## Problem Statement

`GET /api/coverage/collections` accepts an unbounded comma-separated `languageIds` list. This allows very large payloads that can trigger expensive gateway fan-out in fallback mode and create avoidable resource pressure.

## Findings

- Route parser accepts any list length with no cap (`/videoforge/src/app/api/coverage/collections/route.ts:9`).
- Service deduplicates but still forwards arbitrarily large lists (`/videoforge/src/services/coverage-gateway.ts:734`).
- GraphQL fallback executes one request per language ID (`/videoforge/src/services/coverage-gateway.ts:694`).
- No validation test currently enforces a maximum cardinality for `languageIds`.

## Proposed Solutions

### Option 1: Add strict max-language validation in route handler (recommended)

**Approach:** Enforce a hard cap (for example 10 or 20 IDs), validate ID token length/pattern, and return `400` with clear guidance when exceeded.

**Pros:**
- Reduces abuse surface and accidental heavy requests.
- Keeps logic simple and deterministic.

**Cons:**
- Requires choosing/communicating an explicit limit.

**Effort:** Small

**Risk:** Low

---

### Option 2: Process large lists with bounded batching

**Approach:** Accept large inputs but execute bounded concurrency and per-request chunking.

**Pros:**
- Supports broader use cases.
- Better throughput control.

**Cons:**
- Adds complexity and more edge cases.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Require single language per request

**Approach:** Simplify contract to one `languageId` per request and move aggregation to client.

**Pros:**
- Strongest server-side protection and predictable load.
- Simplest backend behavior.

**Cons:**
- More client requests.
- Contract change may impact UX.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

To be filled during triage.

## Technical Details

**Affected files:**
- `/videoforge/src/app/api/coverage/collections/route.ts`
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/api-coverage-routes.test.ts`

**Related components:**
- `/videoforge/src/features/coverage/coverage-report-client.tsx`

**Database changes (if any):**
- No

## Resources

- **Plan:** `/videoforge/docs/plans/2026-02-15-feat-migrate-legacy-coverage-reporting-order-flow-plan.md`

## Acceptance Criteria

- [x] Route rejects oversized `languageIds` lists with `400` and actionable error.
- [x] Route validates malformed ID tokens and rejects invalid input.
- [x] Tests cover valid small set, oversized set, and malformed token scenarios.
- [x] Fallback behavior remains deterministic under validated inputs.

## Work Log

### 2026-02-15 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed request validation in coverage collections route.
- Traced input flow through fallback fan-out behavior.
- Identified missing cardinality guard as reliability/security risk.

**Learnings:**
- Simple input bounds are the lowest-cost protection against request amplification.

## Notes

Not merge-blocking for correctness, but should be fixed soon for production resilience.
