---
title: "fix: Generate Mux subtitles when transcript track is missing"
type: "fix"
status: "completed"
date: "2026-02-18"
---

# fix: Generate Mux subtitles when transcript track is missing

## Enhancement Summary

**Deepened on:** 2026-02-18
**Sections enhanced:** 10
**Research inputs used:**
- Internal learnings from `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- Internal learnings from `/videoforge/docs/solutions/integration-issues/mux-ai-api-shape-mismatch-and-language-id-resolution-20260217.md`
- Internal learnings from `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- `@mux/ai` docs (`PRIMITIVES.md`, `API.md`, `WORKFLOWS.md`)
- Mux Video API docs for generate-subtitles and asset/track status

### Key Improvements

1. Added deterministic decision table for when to generate subtitles vs fail fast.
2. Added explicit polling/timeout contract to avoid infinite waits and noisy retries.
3. Added structured error taxonomy and logging requirements consistent with existing Mux adapter patterns.
4. Added concrete test matrix including idempotency and non-regression checks.

### New Considerations Discovered

- `fetchTranscriptForAsset(...)` is a fetch/read primitive, not a generation primitive.
- Recovery path must remain inside service adapter boundaries to respect architecture guardrails.
- Missing-track failures should be handled as deterministic integration outcomes, not open-ended retries.

## Overview

Jobs currently fail in the `transcription` step when `@mux/ai/primitives` `fetchTranscriptForAsset(...)` cannot find a ready text track on the Mux asset. This plan adds a deterministic recovery path: if transcript tracks are missing, request Mux-generated subtitles on the asset audio track, wait for the new text track to become ready, then fetch transcript again.

### Research Insights

**Best Practices:**
- Keep enrichment API calls isolated in `/videoforge/src/services/mux-ai.ts`; do not call external APIs from workflow definitions.
- Prefer one recovery flow with bounded retries over layered fallback chains.

**Performance Considerations:**
- Avoid generation API calls when asset already has ready/preparing text track.
- Poll only as long as needed and stop early on terminal track states.

## Problem Statement / Motivation

`/videoforge/src/services/mux-ai.ts` currently treats missing tracks as a hard failure from `fetchTranscriptForAsset(...)` and may fall back to workflow exports that are version-dependent. In production behavior, the common failure mode is:

- `MUX_AI_OPERATION_FAILED`
- `fetchTranscriptForAsset threw an exception`
- `No transcript track found. Available languages: none`

This is recoverable when Mux can generate subtitles for the asset after ingest. The workflow should proactively request generation instead of failing immediately.

### Research Insights

**Failure-model alignment:**
- Existing incident docs show silent fallback obscures operator diagnosis. This fix keeps strict, typed failures when recovery is not possible.
- Existing workflow state learnings require preserving accurate `currentStep` and structured error details when generation fails.

## Research Findings

### Internal findings

- Existing transcription path fetches asset metadata and playback ID, then calls `fetchTranscriptForAsset(...)` directly: `/videoforge/src/services/mux-ai.ts`.
- Existing track status parsing already understands `tracks[].status` and `language_code`: `/videoforge/src/services/mux-ai.ts`.
- Existing tests already cover primitives fetch failures and fallback semantics: `/videoforge/tests/mux-ai-adapter.test.ts`.
- Prior solved issue documents API-shape mismatch and compatibility behavior; this plan should preserve deterministic error handling patterns: `/videoforge/docs/solutions/integration-issues/mux-ai-api-shape-mismatch-and-language-id-resolution-20260217.md`.

### External findings

- `@mux/ai` primitives `fetchTranscriptForAsset(...)` fetches existing transcript/caption tracks; it does not create missing tracks.
  - Source: [PRIMITIVES.md](https://github.com/muxinc/ai/blob/main/docs/PRIMITIVES.md)
- Mux Video API provides endpoint to generate subtitles for an existing asset track:
  - `POST /video/v1/assets/{ASSET_ID}/tracks/{TRACK_ID}/generate-subtitles`
  - Source: [Generate track subtitles](https://www.mux.com/docs/api-reference/video/assets/generate-asset-track-subtitles)
- Generated text tracks transition asynchronously and must be polled before transcript fetch can succeed.
  - Source: [Assets API reference](https://www.mux.com/docs/api-reference/video)

## Proposed Solution

Add a server-side recovery flow inside the mux adapter used by transcription:

1. Attempt transcript fetch as today.
2. If failure indicates missing transcript/text track:
   - Re-fetch latest asset details.
   - If ready or preparing text track exists for desired language, skip generation request and poll readiness.
   - Else find primary audio track and call Mux generate-subtitles endpoint.
   - Poll asset tracks until a `text` track in target language is `ready` (or timeout).
3. Retry transcript fetch once track is ready.
4. If still missing/failing, return deterministic error with actionable operator hint and preserve transcription step context.

### Research Insights

**Decision table:**
- `ready text track exists` -> no generation call, fetch transcript.
- `preparing text track exists` -> no generation call, poll then fetch.
- `no text track + audio track exists` -> request generation, poll then fetch.
- `no text track + no audio track` -> fail fast with `MUX_AI_OPERATION_FAILED` and operator hint.

**Idempotency requirement:**
- Re-running transcription for same asset must not spam generation requests if generation is already in progress or already produced a ready track.

**Deterministic generation trigger (must implement exactly):**
- Trigger generation only when all conditions are true:
  - `fetchTranscriptForAsset(...)` throws, and
  - error text indicates missing transcript/caption track (for example: `No transcript track found`), and
  - latest asset inspection shows no `text` track in `ready` or `preparing` for target language (or any language when target is unspecified), and
  - asset has at least one eligible audio track.
- Do not trigger generation when:
  - transcript fetch failed for config/import/runtime causes (`MUX_AI_CONFIG_MISSING`, `MUX_AI_IMPORT_FAILED`), or
  - a qualifying `text` track already exists and only needs readiness polling.
- Fail fast (no generation attempt) when:
  - asset has no eligible audio track, returning `MUX_AI_OPERATION_FAILED` with explicit operator hint.

## Technical Approach

### Phase 1: Mux adapter primitives for subtitle generation

Files:
- `/videoforge/src/services/mux-ai.ts`

Tasks:
- Add typed helpers for:
  - selecting candidate audio track ID from asset tracks
  - requesting generated subtitles via Mux API
  - polling asset track readiness with bounded retry window
- Keep all Mux REST calls in adapter layer (no direct API calls from workflow definitions).
- Reuse existing credential and error helpers (`readMuxApiCredentials`, `toOperationFailed`, etc.).

### Research Insights

**Implementation details:**
- Add helper boundaries similar to `fetchMuxAsset(...)`:
  - `requestMuxGeneratedSubtitles(assetId, audioTrackId, languageCode?)`
  - `waitForMuxTextTrackReady(assetId, languageCode, options)`
  - `selectAudioTrackForSubtitleGeneration(asset)`
- Keep new helpers pure in contract (input/output explicit), with network side effects isolated and mockable.

**Polling contract (recommended defaults):**
- interval: 2s
- max attempts: 30
- max wait: 60s
- early exit on terminal track status (`errored`) when surfaced by API

### Phase 2: Integrate recovery into transcription path

Files:
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/services/transcription.ts` (only if signature changes are needed)

Tasks:
- In `transcribeWithPrimitiveFetch(...)`, detect “no transcript track” failure and trigger generation flow before surfacing failure.
- Add one controlled retry of `fetchTranscriptForAsset(...)` after generation and readiness poll completes.
- Preserve compatibility gate behavior for `@mux/ai` import/runtime errors.

### Research Insights

**Error taxonomy requirements:**
- Preserve existing `MuxAiError` codes (`MUX_AI_CONFIG_MISSING`, `MUX_AI_IMPORT_FAILED`, `MUX_AI_OPERATION_FAILED`, `MUX_AI_INVALID_RESPONSE`).
- New generation failure paths should map to `MUX_AI_OPERATION_FAILED` with specific operation names:
  - `subtitle generation request`
  - `subtitle generation poll`
  - `primitives transcription fetch`

**Observability requirements:**
- Emit a single warning log for optional fallback points.
- Include `assetId`, operation name, and concise cause in structured warning text.

### Phase 3: Deterministic errors, observability, and tests

Files:
- `/videoforge/tests/mux-ai-adapter.test.ts`
- `/videoforge/tests/workflow-state.test.ts` (if retry/failure semantics require updates)
- `/videoforge/tests/api-jobs-contract.test.ts` (if structured error payload assertions need expansion)

Tasks:
- Add tests for:
  - missing track -> generate subtitles -> ready -> transcript succeeds
  - missing track -> preparing track exists -> poll only -> transcript succeeds
  - missing track -> generate request succeeds but never ready -> deterministic failure
  - missing track -> generate endpoint fails (4xx/5xx) -> deterministic failure with operator hint
  - no audio track -> deterministic fail-fast with operator hint
  - existing ready track path remains unchanged (no extra API calls)
- Validate warnings/logging stay useful without noisy retries.

### Research Insights

**Quality gates:**
- All new network behavior must be mocked in adapter tests.
- Workflow tests must confirm terminal job status is `failed` with `currentStep: transcription` preserved on irrecoverable paths.
- No tests should require opening ports or live Mux network access.

## Spec Flow Analysis (Gaps and Edge Cases)

- Assets with no audio track: generation is impossible; fail fast with explicit operator hint.
- Assets with signed playback only: ensure playback ID selection still works for transcript URL generation.
- Language selection mismatch:
  - if requested language unknown, default to `auto` for subtitle generation
  - if generated language differs, still accept first ready text track and normalize language code
- Long-running generation:
  - enforce timeout + bounded polling interval
  - record clear reason in error message
- Duplicate generation calls:
  - avoid re-requesting generation when matching ready/preparing track already exists.
- Multi-audio assets:
  - choose deterministic first-eligible audio track selection rule and document it.

### Research Insights

**Anti-patterns to avoid:**
- Unbounded polling loops.
- Silent fallback from generation failure into unrelated workflow exports.
- Dropping root-cause details from persisted error metadata.

## Acceptance Criteria

- [x] Jobs no longer fail immediately on missing transcript track when Mux can generate subtitles for the asset.
- [x] Adapter requests subtitle generation through Mux API and retries transcript fetch after track readiness.
- [x] Failures are deterministic and actionable when generation cannot proceed (no audio track, timeout, API error).
- [x] Existing happy path (ready text track already present) remains fast and unchanged.
- [x] Automated tests cover success and failure branches for the new recovery logic.
- [x] Job error payload continues exposing structured `code` and `operatorHint` on failure.

## Success Metrics

- `transcription` step failure rate due to `No transcript track found` drops significantly in dev and staging runs.
- Median completion time impact for assets with existing text tracks remains negligible.
- Error logs for true non-recoverable cases include explicit operator hints.
- Zero increase in failures caused by adapter import/runtime mismatch paths.

## Dependencies & Risks

Dependencies:
- Valid `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` credentials.
- Mux asset contains a usable audio track for subtitle generation.

Risks:
- Subtitle generation latency can increase transcription step duration.
- Additional polling can increase API calls.
- Misclassified retryable vs deterministic errors could cause noisy retries.

Mitigations:
- Use bounded retries/timeouts and short polling window.
- Skip generation when ready or preparing text track already exists.
- Keep deterministic classification aligned with existing workflow retry policy.

## Verification Plan

- Run focused tests:
  - `pnpm tsx --test /videoforge/tests/mux-ai-adapter.test.ts`
  - `pnpm tsx --test /videoforge/tests/workflow-state.test.ts`
  - `pnpm tsx --test /videoforge/tests/api-jobs-contract.test.ts`
- Type safety:
  - `pnpm typecheck`
- Manual smoke:
  - Create job for asset without text tracks.
  - Confirm `transcription` step requests generated subtitles and later proceeds.
  - Confirm job reaches `completed` when downstream steps are healthy.
  - Confirm irrecoverable case surfaces structured failure in job details.

## References & Research

### Internal references

- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/services/transcription.ts`
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/tests/mux-ai-adapter.test.ts`
- `/videoforge/tests/workflow-state.test.ts`
- `/videoforge/tests/api-jobs-contract.test.ts`
- `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- `/videoforge/docs/solutions/integration-issues/mux-ai-api-shape-mismatch-and-language-id-resolution-20260217.md`
- `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

### External references

- [Mux AI primitives docs](https://github.com/muxinc/ai/blob/main/docs/PRIMITIVES.md)
- [Mux AI API docs](https://github.com/muxinc/ai/blob/main/docs/API.md)
- [Mux AI workflows docs](https://github.com/muxinc/ai/blob/main/docs/WORKFLOWS.md)
- [Mux Video API: Generate track subtitles](https://www.mux.com/docs/api-reference/video/assets/generate-asset-track-subtitles)
- [Mux Video API: Assets and track status](https://www.mux.com/docs/api-reference/video)
