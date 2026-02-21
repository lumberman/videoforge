---
status: complete
priority: p2
issue_id: "022"
tags: [code-review, workflow, observability, step-status, mux-ai]
dependencies: []
---

# Attribute Missing VTT Failure to Structured Transcript Step

## Problem Statement

The workflow validates `primitivePreprocess.vtt` before entering `runStep` for `structured_transcript`. If VTT is missing, the thrown error is attributed to the previously completed `transcription` step (currentStep remains transcription), while `structured_transcript` stays pending. This misclassifies failure location in Job Details and error logs.

## Findings

- Missing-VTT guard is outside structured step wrapper: `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts:376`.
- `structured_transcript` step is started only after the guard: `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts:384`.
- Impact: operator sees wrong failed step context during troubleshooting and may investigate the wrong integration boundary.

## Proposed Solutions

### Option 1: Move VTT guard inside `structured_transcript` task

**Approach:** Wrap the guard in the `runStep({ step: 'structured_transcript', ... })` task body and throw there.

**Pros:**
- Correct step attribution with no orchestration redesign.
- Minimal code change.

**Cons:**
- Slightly less linear code flow in `startVideoEnrichment`.

**Effort:** 30-60 minutes

**Risk:** Low

---

### Option 2: Add a dedicated preprocessing step

**Approach:** Introduce a distinct step (e.g., `preprocess_transcript`) for primitive preprocessing contract validation.

**Pros:**
- Explicit pipeline semantics.
- Clear future extension point.

**Cons:**
- Requires workflow schema/state/UI step updates.
- Higher change surface than needed.

**Effort:** 3-5 hours

**Risk:** Medium

## Recommended Action

Completed with a stricter contract approach:
- Made `MuxAiPreprocessResult.vtt` required in adapter contract.
- Removed redundant workflow pre-check guard and wrote structured transcript directly from required `primitivePreprocess.vtt`.
- This eliminates the ambiguous "missing VTT between steps" branch and keeps failure attribution at the actual failing dependency boundary.

## Technical Details

**Affected files:**
- `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
- `/Users/o/GitHub/videoforge/tests/workflow-state.test.ts`

**Related components:**
- Job step status model and dashboard error visibility.

## Resources

- **Commit under review:** `e9b7c51`
- **Related logic-error reference:** `/Users/o/GitHub/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

## Acceptance Criteria

- [x] Ambiguous missing-VTT branch between transcription and structured step is removed.
- [x] VTT contract is explicit (`vtt` required), so failures occur at the source boundary.
- [x] Regression coverage validates strict dependency-failure behavior in workflow and adapter tests.

## Work Log

### 2026-02-21 - Review Finding Capture

**By:** Codex

**Actions:**
- Traced orchestration control flow between transcription and structured transcript steps.
- Confirmed VTT precondition failure occurs before `structured_transcript` enters `runStep`.

**Learnings:**
- Step-attribution correctness is as important as fail-fast behavior for operator debugging.

### 2026-02-21 - Resolution

**By:** Codex

**Actions:**
- Updated adapter type contract to require VTT:
  - `/Users/o/GitHub/videoforge/src/services/mux-ai.ts`
- Removed redundant VTT null/trim guard before structured step in workflow:
  - `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
- Verified regression suites:
  - `pnpm typecheck`
  - `pnpm tsx --test tests/workflow-state.test.ts tests/mux-ai-adapter.test.ts`
  - `pnpm tsx --test tests/workflow-subtitle-post-process.test.ts tests/subtitle-post-process/post-process.test.ts`

**Learnings:**
- Strengthening upstream contract guarantees can remove downstream ambiguous attribution branches.
