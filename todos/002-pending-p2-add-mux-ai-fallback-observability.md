---
status: pending
priority: p2
issue_id: "002"
tags: [code-review, mux-ai, observability, architecture]
dependencies: []
---

# Add Observability for Mux AI Fallback Paths

## Problem Statement

When `MUX_AI_ENABLED=true`, mux-ai adapter calls silently fall back to OpenRouter if imports or candidate function calls fail. This makes it difficult to know whether mux-ai is truly active in production-like runs.

## Findings

- `importMuxModule` swallows all import errors and returns `undefined` in `/videoforge/src/services/mux-ai.ts:24`.
- `callMuxFn` also swallows invocation errors and falls back without emitting signal in `/videoforge/src/services/mux-ai.ts:118`.
- With current behavior, operators can set `MUX_AI_ENABLED=true` yet still run fully on fallback path without any warning/metric.

## Proposed Solutions

### Option 1: Add Structured Logging on Fallback

**Approach:** Emit structured warnings whenever mux-ai import or function invocation fails and fallback is taken.

**Pros:**
- Immediate operational visibility
- Minimal code changes

**Cons:**
- Adds log noise if not throttled

**Effort:** Small

**Risk:** Low

---

### Option 2: Add Runtime Capability Snapshot

**Approach:** Resolve mux-ai capabilities once at startup and expose status via dashboard/API metadata.

**Pros:**
- Clear "mux-ai active/inactive" state
- Avoids repeated import attempts

**Cons:**
- Slightly more architecture surface

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Strict Mode Flag

**Approach:** Add optional `MUX_AI_STRICT=true` to fail job if mux-ai is enabled but unavailable.

**Pros:**
- Prevents silent fallback drift
- Useful for staged rollouts

**Cons:**
- Can reduce availability if enabled too early

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Start with Option 1. Add low-noise structured warnings and a per-job note in error metadata when fallback occurs.

## Technical Details

**Affected files:**
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/workflows/videoEnrichment.ts` (optional, if job-level fallback notes are stored)

## Resources

- Branch: `w-1`
- Related doc: `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`

## Acceptance Criteria

- [ ] Fallback events produce observable logs/telemetry
- [ ] Operators can distinguish mux-ai success vs fallback execution
- [ ] No regression in deterministic behavior/tests

## Work Log

### 2026-02-15 - Review Finding Created

**By:** Codex

**Actions:**
- Reviewed fallback pathways in mux-ai adapter
- Verified import and invocation failures are currently fully silent

**Learnings:**
- Silent fallback improves resilience but reduces operational trust unless surfaced.

## Notes

- Keep fallback itself; this todo is about observability, not behavior removal.
