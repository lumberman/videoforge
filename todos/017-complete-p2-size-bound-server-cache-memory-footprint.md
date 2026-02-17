---
status: complete
priority: p2
issue_id: "017"
tags: [code-review, performance, operations, coverage]
dependencies: []
---

# Add size-aware guardrails for coverage collections in-memory cache

The new server cache is key-count bounded (100 keys) but not payload-size bounded. Each cached value can contain large collection/video trees, so worst-case memory use can still become high under varied language combinations.

## Problem Statement

`collectionsCache` stores full normalized coverage payloads, and each entry may be large (many collections and videos). The current cap controls only number of keys, not bytes per entry or total cache footprint.

In long-lived processes with diverse language requests, this can raise memory pressure and increase OOM risk, especially outside local development.

## Findings

- Global in-memory cache introduced: `/videoforge/src/services/coverage-gateway.ts:30`
- TTL is 24 hours and cap is 100 keys: `/videoforge/src/services/coverage-gateway.ts:22`
- Entries store full `CoverageCollection[]`: `/videoforge/src/services/coverage-gateway.ts:25`
- Eviction strategy is key-count-only FIFO/LRU hybrid, not memory-based: `/videoforge/src/services/coverage-gateway.ts:80`

Impact:
- Potentially high memory consumption despite key cap.
- Operational unpredictability as request diversity grows.

## Proposed Solutions

### Option 1: Lower key cap and shorten TTL

**Approach:** Reduce `COLLECTIONS_CACHE_MAX_KEYS` and/or TTL to constrain memory residency.

**Pros:**
- Very simple.
- Immediate reduction in memory retention.

**Cons:**
- More misses, lower cache hit rate.
- Might reduce the warm-load speed benefit.

**Effort:** Small

**Risk:** Low

---

### Option 2: Add size-aware cache eviction

**Approach:** Track serialized byte size per entry and enforce max total bytes with eviction loop.

**Pros:**
- Predictable memory budget.
- Keeps caching benefits while controlling risk.

**Cons:**
- Slight additional CPU overhead for size tracking.
- More code complexity.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Scope aggressive cache only to development

**Approach:** Keep current 24h/100-key behavior for dev, use stricter or no cache in production.

**Pros:**
- Aligns with original use case (dev speed).
- Reduces production memory risk.

**Cons:**
- Behavior differs by environment.
- Requires explicit policy/documentation.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement Option 2 (size-aware budget) or Option 3 (dev-focused policy) before broad rollout if production memory constraints are tight.

## Technical Details

**Affected files:**
- `/videoforge/src/services/coverage-gateway.ts`

**Related components:**
- Coverage dashboard route server rendering.

**Database changes:**
- Migration needed? No

## Resources

- **Commit reviewed:** `44e707c`
- **Plan:** `/videoforge/docs/plans/2026-02-17-feat-coverage-server-cache-load-speed-plan.md`

## Acceptance Criteria

- [x] Cache strategy enforces explicit memory risk control (bytes budget or environment scoping).
- [x] Behavior is covered by tests/docs for chosen policy.
- [x] No regression in warm-load improvement goals.

## Work Log

### 2026-02-17 - Review Finding Creation

**By:** Codex

**Actions:**
- Reviewed cache constants, entry shape, and eviction logic.
- Assessed operational memory risk under high-cardinality language combinations.
- Documented mitigation options.

**Learnings:**
- Key-count limits are useful but can still hide large-memory entry risk.

### 2026-02-17 - Resolution

**By:** Codex

**Actions:**
- Added byte-aware cache limits with env-configurable max total bytes and max entry bytes.
- Tracked cached payload byte size per entry and maintained total cache bytes.
- Added eviction path that enforces both key-count and total-byte budgets.
- Added tests for per-entry skip behavior and total-budget eviction behavior.

## Notes

- Priority set to P2: operational/perf risk that should be addressed but is not an immediate correctness/security blocker.
