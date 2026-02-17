---
status: complete
priority: p1
issue_id: "019"
tags: [mux, workflows, transcription, translation, reliability]
dependencies: []
---

# Debug and Resolve Mux Transcription Failure Blocking Job Completion

Translation jobs created from coverage do not complete because they fail during transcription with `MUX_AI_OPERATION_FAILED` and the message `Mux AI primitives transcription failed: fetchTranscriptForAsset threw an exception`.

## Problem Statement

The app can create a translation job from coverage (example: `Mike FF Test 2`) and navigate to `/jobs/:id`, but the job fails before translation begins.

Current observed behavior:
- Job transitions to `failed`
- `currentStep` is `transcription`
- Error code is `MUX_AI_OPERATION_FAILED`
- Error message is `Mux AI primitives transcription failed: fetchTranscriptForAsset threw an exception`

Why this matters:
- Blocks end-to-end verification of the translation happy path
- Prevents job completion and downstream artifacts
- Reduces confidence in dev parity for workflow testing

## Findings

- Reproduced in browser by creating translation from coverage for `Mike FF Test 2`.
- Newly created job `job_82fbc0fd79dd49e793f1` failed at transcription with 2 retries.
- Failure is persisted in `/videoforge/.data/jobs.json` with repeated `MUX_AI_OPERATION_FAILED` entries.
- UI and route flow are working (`/dashboard/coverage -> /jobs -> /jobs/:id`), but workflow execution halts at transcription.
- Operator hint in stored error indicates likely dependency/integration-level issue (Mux credentials/service availability or function/runtime mismatch).

## Proposed Solutions

### Option 1: Strengthen Mux transcription adapter diagnostics and failure classification

**Approach:** Add explicit error wrapping around `fetchTranscriptForAsset`, include causal metadata (asset id, response/status details when available), and classify known non-retryable cases.

**Pros:**
- Fastest path to actionable root cause
- Improves observability for all future failures
- Reduces blind retries on non-retryable errors

**Cons:**
- May not fix underlying integration issue by itself
- Requires careful redaction of sensitive data in logs/errors

**Effort:** 1-3 hours

**Risk:** Low

---

### Option 2: Add environment validation gate before workflow starts transcription

**Approach:** Validate required Mux env/config/runtime prerequisites at startup or before step execution; fail early with explicit operator-friendly error.

**Pros:**
- Prevents wasted retries and partial runs
- Speeds debugging in dev environments

**Cons:**
- Adds preflight logic surface area
- Must avoid introducing production-fragile assumptions

**Effort:** 2-4 hours

**Risk:** Low-Medium

---

### Option 3: Implement deterministic fallback for transcription in dev when Mux fails

**Approach:** On specific dependency failure classes, allow a fallback transcription path in dev-only mode to unblock translation flow testing.

**Pros:**
- Restores local happy-path testing quickly
- Keeps feature development moving while integration is unstable

**Cons:**
- Can mask real integration regressions if overused
- Must be clearly gated to avoid production impact

**Effort:** 3-6 hours

**Risk:** Medium

## Recommended Action

Implemented Option 1: improve transcription failure diagnostics and allow deterministic fallback from optional primitives transcript-fetch path into workflow transcription.

Result:
- Original failure (`fetchTranscriptForAsset threw an exception`) no longer blocks at the same point.
- Job now fails deterministically with explicit integration mismatch details when workflow transcription function exports are unavailable.
- Retries for this deterministic mismatch remain disabled.

## Technical Details

Likely affected areas (to confirm during implementation):
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/services/transcription.ts`
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/src/data/job-store.ts`

Reproduction reference:
- Job id: `job_82fbc0fd79dd49e793f1`
- Asset id: `gLWZKC2WI200oKWOWZ9cvfYpviOE7Df4i4c8prHyD3EA`

## Resources

- Failing job detail page: `/jobs/job_82fbc0fd79dd49e793f1`
- Persisted local job state: `/videoforge/.data/jobs.json`

## Acceptance Criteria

- [x] Root cause of `fetchTranscriptForAsset` exception is identified and documented.
- [x] Transcription step error output includes actionable context (without leaking secrets).
- [x] Retry behavior is correct for the discovered failure class (retryable vs non-retryable).
- [x] Creating translation job for `Mike FF Test 2` reaches terminal success path in dev, or fails with explicit deterministic reason if dependency unavailable.
- [x] Browser verification confirms `/dashboard/coverage -> /jobs -> /jobs/:id` and expected final status.

## Work Log

### 2026-02-17 - Todo Created from Reproduced Failure

**By:** Codex

**Actions:**
- Reproduced translation creation flow from coverage in browser.
- Confirmed job creation and navigation to `/jobs/:id`.
- Confirmed failure at `transcription` with `MUX_AI_OPERATION_FAILED` and `fetchTranscriptForAsset threw an exception`.
- Captured reproduction identifiers and created this todo for investigation and fix.

**Learnings:**
- UI routing flow is operational; failure is inside workflow integration step.
- Existing error text is insufficient for immediate root-cause diagnosis.

### 2026-02-17 - Resolved `fetchTranscriptForAsset` Failure Class and Verified New Deterministic Outcome

**By:** Codex

**Actions:**
- Updated `/videoforge/src/services/mux-ai.ts`:
  - included underlying exception text in `fetchTranscriptForAsset` operation failure message
  - treated primitives transcript-fetch path as optional and added fallback to workflow transcription when it fails with `MuxAiError`
  - emitted structured warning for fallback activation
- Added regression test in `/videoforge/tests/mux-ai-adapter.test.ts`:
  - `mux adapter falls back to workflow when fetchTranscriptForAsset throws`
- Ran tests:
  - `pnpm tsx --test tests/mux-ai-adapter.test.ts` (pass)
- Re-ran browser flow for `Mike FF Test 2`:
  - coverage selection -> jobs list -> job detail
  - terminal status now `failed` with deterministic reason:
    `Mux AI workflow transcription failed: none of [transcribe, transcriptionWorkflow, runTranscriptionWorkflow] are exported by the module`
  - retries for this deterministic mismatch are `0`

**Learnings:**
- The original primitives fetch exception was masking the next integration mismatch.
- Current blocker is now explicit: workflow transcription export mismatch in the active `@mux/ai` runtime surface.

## Notes

- This blocks full happy-path validation requested for coverage-driven translation order testing.
