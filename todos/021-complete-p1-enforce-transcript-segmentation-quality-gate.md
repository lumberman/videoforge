---
status: complete
priority: p1
issue_id: "021"
tags: [code-review, mux-ai, transcription, quality, workflow]
dependencies: []
---

# Enforce Transcript Segmentation Quality Gate

## Problem Statement

`transcribeWithMuxAi` currently accepts any payload that matches the minimal `Transcript` shape, including a single long segment covering the full media timeline. This allows jobs to complete with unusable subtitle granularity, which conflicts with the strict failure requirement for improper Mux transcript outputs.

## Findings

- `isTranscript` validates only type shape and does not enforce segment quality constraints: `/Users/o/GitHub/videoforge/src/services/mux-ai.ts:256`.
- `transcribeWithMuxAi` returns primitive `transcribe*` output immediately when present, with no segment-quality guard: `/Users/o/GitHub/videoforge/src/services/mux-ai.ts:1289`.
- Reproduction (review harness) confirmed a one-segment 86s transcript is accepted as success.
- Impact: the original symptom (“single segment transcript”) can still pass as completed transcription even after strict-fallback removal.

## Proposed Solutions

### Option 1: Hard gate transcript quality in adapter

**Approach:** Add validation in `transcribeWithMuxAi` requiring segment-level thresholds (for example: at least 2 segments for assets > N seconds, non-empty cue text, max segment duration cap).

**Pros:**
- Directly enforces user requirement at adapter boundary.
- Fails early with deterministic, actionable errors.

**Cons:**
- Requires careful threshold tuning to avoid false positives for short clips.

**Effort:** 2-4 hours

**Risk:** Medium

---

### Option 2: Prefer primitive VTT cue parsing path for segmentation fidelity

**Approach:** Use `fetchTranscriptForAsset + parseVTTCues` as primary path (or secondary verification) and reject coarse `transcribe*` outputs.

**Pros:**
- Uses cue-level source of truth already supported in adapter.
- Better segmentation consistency with downstream subtitle steps.

**Cons:**
- Requires Mux API credential availability and extra calls.

**Effort:** 3-5 hours

**Risk:** Medium

---

### Option 3: Add post-transcription normalization gate in workflow

**Approach:** Keep adapter behavior but add workflow-level quality check before marking transcription complete.

**Pros:**
- Minimal adapter churn.
- Explicit step-level failure messaging in workflow.

**Cons:**
- Quality contract lives outside adapter; weaker abstraction.

**Effort:** 2-3 hours

**Risk:** Medium

## Recommended Action

Completed with **Option 1**:
- Added a hard segmentation quality gate in Mux transcript adapter paths.
- Transcript now fails with `MUX_AI_INVALID_RESPONSE` when monolithic long-segment output is returned.
- Added adapter and workflow regression tests for this failure path.

## Technical Details

**Affected files:**
- `/Users/o/GitHub/videoforge/src/services/mux-ai.ts`
- `/Users/o/GitHub/videoforge/tests/mux-ai-adapter.test.ts`
- `/Users/o/GitHub/videoforge/tests/workflow-state.test.ts`

**Related components:**
- Transcription step in workflow orchestration.
- Subtitle post-process dependency on segment quality.

## Resources

- **Commit under review:** `e9b7c51`
- **Related solution doc:** `/Users/o/GitHub/videoforge/docs/solutions/integration-issues/strict-failure-mode-for-mux-openrouter-dependent-job-steps-20260220.md`
- **Known pattern:** `/Users/o/GitHub/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`

## Acceptance Criteria

- [x] Transcription step fails when segment quality is below defined threshold.
- [x] Error message clearly states transcript quality contract violation.
- [x] Adapter tests include single-segment-long-transcript rejection case.
- [x] Workflow test confirms job fails (not completes) for coarse transcript outputs.

## Work Log

### 2026-02-21 - Review Finding Capture

**By:** Codex

**Actions:**
- Reviewed strict-fail changes in `mux-ai.ts`.
- Verified shape-only acceptance path for transcripts.
- Reproduced acceptance of a one-segment transcript in isolated review harness.

**Learnings:**
- Removing fallback alone is insufficient unless transcript quality contracts are explicit.

### 2026-02-21 - Resolution

**By:** Codex

**Actions:**
- Implemented transcript segmentation quality checks in `/Users/o/GitHub/videoforge/src/services/mux-ai.ts`.
- Applied gate to both primitives `transcribe*` path and primitives transcript fetch path.
- Added tests:
  - `/Users/o/GitHub/videoforge/tests/mux-ai-adapter.test.ts` (monolithic segment rejection)
  - `/Users/o/GitHub/videoforge/tests/workflow-state.test.ts` (workflow fails transcription on monolithic transcript)
- Verified with:
  - `pnpm typecheck`
  - `pnpm tsx --test tests/mux-ai-adapter.test.ts tests/workflow-state.test.ts`

**Learnings:**
- Structural shape validation is not enough for subtitle-grade transcript quality; quality thresholds must be explicit.
