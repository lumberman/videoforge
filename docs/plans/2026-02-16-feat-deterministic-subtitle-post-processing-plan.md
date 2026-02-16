---
title: "feat: Add deterministic subtitle post-processing with theology and language QA"
type: feat
status: active
date: 2026-02-16
---

# feat: Add deterministic subtitle post-processing with theology and language QA

## Enhancement Summary

**Deepened on:** 2026-02-16  
**Sections enhanced:** 11  
**Research inputs used:** local repo patterns, institutional learnings in `/videoforge/docs/solutions/`, and skill-driven review lenses (`architecture-strategist`, `security-sentinel`, `performance-oracle`, `spec-flow-analyzer`, `code-simplicity-reviewer`, `kieran-typescript-reviewer`).

### Key Improvements
1. Added deterministic contracts for provenance transitions, validator rules, and one-retry enforcement aligned to current workflow retry behavior.
2. Added explicit idempotency-key and metadata persistence requirements to prevent duplicate/ambiguous subtitle attachments.
3. Expanded test strategy with invariant/property cases, malformed-output handling, and rollback/flag behavior checks.

### New Considerations Discovered
- Current `runStep` default retries (2) must be explicitly overridden for subtitle post-processing to satisfy the PRD one-retry rule.
- Translation data model currently lacks cue timing payloads, so adapter contract changes are required before deterministic WebVTT shaping can be authoritative.
- Human-touched subtitle states need explicit transition rules to avoid accidental re-processing (`ai-processed` vs `ai-human`).

## Section Manifest
- Section 1: Problem and scope hardening: align PRD constraints with current workflow gaps and avoid architecture drift.
- Section 2: Provenance model and gating: formalize `subtitleOrigin` states and no-mutation behavior.
- Section 3: Validator/fallback law: define measurable validation rules and deterministic fallback guarantees.
- Section 4: Workflow integration details: step ordering, retry behavior, idempotency keys, artifact contracts.
- Section 5: Test and rollout controls: add staged rollout gates, regression protections, and measurable success criteria.

## Overview
Introduce a deterministic subtitle post-processing capability in the existing video enrichment workflow so translated subtitle tracks are validated to broadcast-grade WebVTT constraints before attachment.

This plan incorporates:
- the selected brainstorm decisions (dual QA passes, allowlist rollout, AI-only provenance gating), and
- the PRD hard requirements (language/script classification, strict profile constraints, non-AI validator gate, one retry, deterministic fallback, versioned reproducibility).

The output is an implementation-ready plan for a single Next.js app architecture with adapter boundaries and no new infrastructure.

## Found Brainstorm Context
Found brainstorm from 2026-02-16: `subtitle-translation-post-processing-hardening`. Using as context for planning.

Primary references:
- `/videoforge/docs/brainstorms/2026-02-16-subtitle-translation-post-processing-hardening-brainstorm.md`
- `/videoforge/docs/brainstorms/2026-02-16-theology-language-subtitle-qa-pass-brainstorm.md`

Carried decisions:
- Use deterministic validator-centered pipeline with constrained AI passes.
- Run QA only for tracks with explicit provenance states (`ai-raw`, `ai-processed`, `ai-human`, `human`), and only mutate `ai-raw`; do not mutate human-touched tracks.
- Start with language allowlist rollout.
- Canonical LLM interface is cue-structured JSON with timestamps.
- Theology pass returns annotations plus patch suggestions.

## Local Research Summary

### Existing implementation patterns (repo)
- Workflow currently writes `subtitles.vtt` directly from primitives VTT or segment-to-VTT fallback, without CPS/CPL/line/duration validation:
  - `/videoforge/src/workflows/videoEnrichment.ts:56`
  - `/videoforge/src/workflows/videoEnrichment.ts:178`
- Translation currently returns language/text only (no cue/timing structure):
  - `/videoforge/src/services/translation.ts:4`
  - `/videoforge/src/types/enrichment.ts:33`
- Workflow step list is static and will need extension for subtitle post-processing visibility:
  - `/videoforge/src/lib/workflow-steps.ts:3`
  - `/videoforge/src/types/job.ts:10`
- Mux adapter already enforces deterministic dependency failures and supports optional primitives preprocessing with warnings:
  - `/videoforge/src/services/mux-ai.ts:296`
  - `/videoforge/src/services/mux-ai.ts:319`
- Existing coverage status logic distinguishes `ai` vs `human`, useful as precedent for provenance semantics:
  - `/videoforge/src/services/coverage-gateway.ts:76`
  - `/videoforge/src/services/coverage-gateway.ts:99`

### Institutional learnings (docs/solutions)
- Keep mux-ai dependency behavior explicit and deterministic with structured operator diagnostics:
  - `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- Preserve workflow step context and deterministic error/retry semantics:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- Maintain explicit integration contracts and regression tests when fallback paths are involved:
  - `/videoforge/docs/critical-patterns.md`

### Skill-driven review lenses applied
- Architecture lens: keep adapter boundaries strict (`workflow` orchestration only, integrations in service adapters).
- Security lens: provenance defaults must fail safe (`unknown -> human/no mutation`) and prompt payloads must avoid untrusted metadata interpolation.
- Performance lens: validator and formatter must remain linear with respect to cue count; avoid multi-pass quadratic splitting logic.
- Simplicity lens: centralize profile/version constants in one config module and keep step names minimal (single `subtitle_post_process` step).
- Type-safety lens: use discriminated unions for provenance and validation error types to prevent ambiguous states.

## Research Decision
Proceeding without external research.

Rationale:
- The user provided a detailed, implementation-ready PRD with explicit numeric constraints and behavior.
- The codebase already has clear patterns for workflow orchestration, adapter boundaries, deterministic errors, and test style.
- This plan’s risk is primarily integration and contract discipline, not unknown external platform behavior.

## Problem Statement / Motivation
Current subtitle creation treats transcript segments as cues and accepts generated VTT without hard broadcast validation. This creates known quality risks (CPS/CPL overflow, line overflow, awkward breaks, script-specific failures, and timing quality drift).

Business requirements add a second layer: doctrinal accuracy and language readability checks for AI-generated subtitles, while explicitly protecting human-authored subtitle tracks from mutation.

## Proposed Solution
Add a new subtitle post-processing subsystem that runs in workflow after subtitle/translation generation and before Mux attachment.

Core model:
1. Build canonical cue JSON from transcript/translated source.
2. Classify language/script (LTR/RTL/CJK) via BCP-47.
3. Apply constrained AI review passes:
   - theology/doctrine analysis (annotations + patch suggestions),
   - language quality/canonical term pass.
4. Render candidate WebVTT and run strict non-AI validator.
5. Retry once with structured validator errors.
6. If still invalid, use deterministic fallback formatter and validate again.
7. Attach only valid track; otherwise hard fail while preserving diagnostic artifacts.

Safety and scope gates:
- Only run mutation passes when `subtitleOrigin=ai-raw`.
- `ai-processed`, `ai-human`, and `human` are non-mutation states by default.
- Unknown/missing provenance is treated as `human` (safe pass-through, no edits).
- v1 rollout behind configured language allowlist.

### Research Insights

**Best Practices:**
- Treat the validator as the system of record and keep AI steps side-effect free until validation passes.
- Store both intermediate and final artifacts so failures can be debugged without rerunning transcription.
- Keep provenance transitions explicit and one-way for safety:
  - `ai-raw -> ai-processed` on successful automated post-process attach.
  - `ai-processed -> ai-human` only on explicit human verification/editing workflows.
  - `human` remains terminal for this pipeline.

**Implementation Details:**
```ts
// /videoforge/src/services/subtitle-post-process/provenance.ts
export type SubtitleOrigin = 'ai-raw' | 'ai-processed' | 'ai-human' | 'human';

export function canMutateSubtitle(origin: SubtitleOrigin | undefined): boolean {
  return origin === 'ai-raw';
}
```

**Edge Cases to Lock:**
- Re-run on already processed tracks must be idempotent (no second mutation if `ai-processed`).
- Unknown origin on legacy records must default to non-mutation and emit diagnostic event.
- Failed post-process must not downgrade/erase existing human track metadata.

## SpecFlow Analysis

### Primary flow
1. Job starts and transcript is generated.
2. For each target subtitle language, workflow resolves subtitle source via `MuxDataAdapter` primitives-first path.
3. Workflow checks provenance gate:
   - `subtitleOrigin=ai-raw` and language in allowlist -> run post-processor.
   - `subtitleOrigin=ai-processed|ai-human|human` -> skip mutation and keep current track.
   - unknown/missing provenance -> treat as `human` and skip mutation.
4. Post-processor produces validated WebVTT or deterministic hard failure.
5. Valid output is attached with metadata/version hashes.
6. Job state and artifacts expose outcomes for dashboard/API.

### Edge cases
- Missing/invalid BCP-47 script: fallback classification mapping must be deterministic.
- Translation produced text but no cue timing data: step fails with actionable structured error.
- RTL mixed text with digits/acronyms: preserve logical order, no manual reversal.
- CJK long runs without whitespace: split via punctuation then grapheme-safe boundaries.
- Empty or malformed AI output: validator rejects, retry once, fallback formatter executes.
- Fallback cannot satisfy absolute constraints: hard fail and do not attach.
- Human-authored track encountered accidentally: must skip mutation.

### Specification gaps closed by this plan
- Explicit provenance authority: persisted `subtitleOrigin` metadata (`ai-raw|ai-processed|ai-human|human`), unknown treated as `human`.
- Explicit retry boundary: one retry in subtitle post-processor output generation path.
- Explicit version/hash persistence contract for reproducibility.

### Critical Flow Checks
- Retry budget enforcement must happen at the subtitle post-process layer even if generic workflow step helpers permit more retries.
- Retry eligibility is validation-only:
  - retry once when validator returns structured rule violations,
  - fail fast (no retry) for dependency/config/runtime errors unrelated to validation output quality.
- Workflow completion criteria must require at least one valid subtitle artifact for each processed language or explicit skip reason.
- Failure path must preserve `currentStep` as `subtitle_post_process` (not reset to prior steps), following existing workflow-state reliability patterns.

## Prompt Contracts

### 10.3 System prompt (Mandatory, versioned)
Store as `promptVersion: "v1"` and persist it.

System prompt content (v1):
- You are a subtitle post-processing engine.
- Convert Whisper segments into broadcast-grade WebVTT.
- Strictly obey numeric/structural constraints from the profile.
- If a constraint would be violated, split into multiple cues.
- Never exceed max lines, max CPL, max CPS.
- Do not paraphrase, invent, or drop information.
- Output must be valid WebVTT only.

### 10.4 User prompt (Mandatory, versioned)
User prompt content (v1):
- Reformat provided segments into WebVTT cues.
- Apply the profile exactly.
- Compute CPS and enforce limits.
- Split cues or extend timing only within duration bounds and non-overlap rules.
- One thought per cue when possible.
- Preserve meaning exactly.

## Deterministic Methods and Constraints

### Validation Math Contract
- `normalizeCueText(text)`:
  - trim edges,
  - collapse internal whitespace runs to one space while preserving explicit `\\n`,
  - remove styling tags for metric calculation,
  - keep punctuation/casing unchanged.
- `countChars(text)`:
  - prefer grapheme clusters (`Intl.Segmenter`),
  - fallback to Unicode code points if unavailable,
  - always exclude `\\n` for CPS.
- `durationSeconds = end - start`
- `CPS = countChars(normalizeCueText(cueWithoutNewlines)) / durationSeconds`
- `CPL = max(countChars(normalizeCueText(line)))`
- `maxLines = cueText.split("\n").length`

### Cue Decision Priority (enforced order)
1. Prevent overlaps
2. Enforce max lines
3. Enforce max CPL
4. Enforce max CPS (split before extending)
5. Enforce max duration
6. Enforce min duration (borrow/merge only if absolutes remain valid)
7. Prefer semantic/punctuation boundaries
8. Visual balance

### Idempotency Key Contract
Compute and persist a deterministic key from:
- `assetId`
- `trackType` (`captions`)
- `bcp47`
- `subtitleOrigin`
- `whisperSegmentsSha256`
- `profileVersion`
- `promptVersion`
- `validatorVersion`
- `fallbackVersion`

If the same key has already produced a valid attached artifact, reuse prior outputs and skip mutation.

## Technical Approach

### Architecture boundaries
- Workflow orchestration stays in `/videoforge/src/workflows/videoEnrichment.ts`.
- Mux media retrieval/attachment details stay behind adapters.
- Post-processor logic stays in deterministic service modules.
- No direct third-party API calls in workflow definition.

### Research Insights

**Best Practices:**
- Keep `MuxDataAdapter` read operations separate from subtitle mutation logic to avoid coupling media retrieval and policy checks.
- Persist one manifest artifact per language so operators can inspect class/profile/version/hash values without parsing logs.
- Reuse existing job-store step/error mechanics instead of introducing new persistence layers.

**Performance Considerations:**
- Keep formatter/validator complexity bounded to O(cues) with bounded split retries per cue.
- Cache BCP-47 classification per language tag within one job run.
- Avoid repeated WebVTT parse/serialize loops; validate parsed cues directly when possible.

**Implementation Details:**
```ts
// /videoforge/src/workflows/videoEnrichment.ts
const subtitleResult = await runStep({
  jobId,
  step: 'subtitle_post_process',
  world,
  maxRetries: 1, // PRD cap; runtime must still gate retry to validator-failure cases only
  task: async () => runSubtitlePostProcess(job, transcript, translations)
});
```

### Planned modules (new/updated)
- New: `/videoforge/src/services/mux-data-adapter.ts`
  - Canonical transcript/caption retrieval using `@mux/ai/primitives`.
  - Expose `fetchTranscriptForAsset(assetId, language)` and optional storyboard getter.
- New: `/videoforge/src/config/subtitle-post-process.ts`
  - Profiles, version constants, allowlist, feature flags (`bidi isolates`, `styling tags`).
- New: `/videoforge/src/services/subtitle-post-process/types.ts`
- New: `/videoforge/src/services/subtitle-post-process/language-classifier.ts`
- New: `/videoforge/src/services/subtitle-post-process/validator.ts`
- New: `/videoforge/src/services/subtitle-post-process/fallback-formatter.ts`
- New: `/videoforge/src/services/subtitle-post-process/theology-pass.ts`
- New: `/videoforge/src/services/subtitle-post-process/language-quality-pass.ts`
- New: `/videoforge/src/services/subtitle-post-process/index.ts` (orchestrator)
- Update: `/videoforge/src/workflows/videoEnrichment.ts`
- Update: `/videoforge/src/lib/workflow-steps.ts`
- Update: `/videoforge/src/types/job.ts`
- Update: `/videoforge/src/services/mux.ts` (track metadata support)
- Update: `/videoforge/src/types/enrichment.ts` (cue/caption model additions)

### Implementation Phases

#### Phase 1: Contract and configuration foundation
- [ ] Add subtitle post-processing domain types:
  - cue model (`id,start,end,text`),
  - language class (`LTR|RTL|CJK`),
  - validation error schema (`rule`, `cueIndex`, `measured`, `limit`),
  - provenance union (`ai-raw|ai-processed|ai-human|human`).
- [ ] Add centralized config/constants:
  - profiles (LTR/RTL/CJK),
  - `languageProfileVersion`, `promptVersion`, `validatorVersion`, `fallbackVersion`,
  - allowlist and optional flags.
- [ ] Add normalization/counting utilities implementing PRD rules (whitespace normalization, grapheme counting fallback behavior).
- [ ] Add explicit transition helpers for provenance state changes and forbidden transitions.

Deliverables:
- deterministic shared contracts with no workflow wiring yet.

#### Phase 2: Mux data adapter and provenance gate
- [ ] Introduce `MuxDataAdapter` primitives-first retrieval surface.
- [ ] Add subtitle provenance model (`subtitleOrigin`: `ai-raw|ai-processed|ai-human|human`) to retrieved/generated track metadata.
- [ ] Implement strict gate function:
  - process only when `subtitleOrigin=ai-raw` and language allowlist contains target.
  - treat `ai-processed|ai-human|human` as non-mutation states.
- [ ] Ensure unknown provenance defaults to safe skip (`human` behavior).
- [ ] Persist provenance in generated subtitle metadata and artifact manifest.
- [ ] Define a compatibility strategy for legacy tracks missing provenance (backfill as `human`).

Deliverables:
- canonical source retrieval and mutation eligibility logic.

#### Phase 3: Deterministic formatter/validator core
- [ ] Implement BCP-47 parsing + language class inference.
- [ ] Implement profile-aware cue shaping constraints:
  - maxLines/maxCPL/maxCPS/minDuration/maxDuration/minGap,
  - overlap prevention and monotonic timing,
  - LTR/RTL line-break heuristics,
  - CJK grapheme-safe splitting.
- [ ] Implement strict WebVTT parser/validator with machine-readable violations.
- [ ] Implement deterministic fallback formatter with same validation contract.
- [ ] Lock timestamp formatter to `HH:MM:SS.mmm` and monotonic checks.
- [ ] Add explicit non-speech token policy (`[Music]`, `[Applause]`, `♪...♪`) as first-class cue handling.

Deliverables:
- validator as authoritative gate, fallback as guaranteed deterministic recovery path.

#### Phase 4: AI theology + language passes
- [ ] Add theology pass (analysis + patch suggestions) using cue-JSON payload.
- [ ] Add language quality pass (light corrective rewrite) using same cue structure.
- [ ] Bound model settings (`temperature=0`, bounded tokens, prompt versioning).
- [ ] Implement retry contract:
  - quality output validated,
  - at most one retry with structured validator errors,
  - no retry for non-validation failures (dependency/config/runtime/classification errors).
- [ ] Preserve strict no-invent/no-drop/no-paraphrase constraints in prompt contracts.
- [ ] Persist theology annotations and language-pass deltas as separate artifacts for audit.

Deliverables:
- constrained dual-pass AI pipeline integrated with deterministic validator/fallback ladder.

#### Phase 5: Workflow integration and metadata persistence
- [ ] Add explicit workflow step(s) for subtitle post-processing visibility (e.g., `subtitle_post_process`).
- [ ] Wire post-processor into `startVideoEnrichment` before Mux attach stage.
- [ ] Persist output artifacts:
  - final `subtitles.vtt`,
  - per-language QA report (annotations/errors),
  - post-process manifest including versions/hashes and provenance outcome.
- [ ] Extend attach metadata contract:
  - `source`, `ai_post_processed`, versions, input hashes, language class.
- [ ] Keep step status/retry/error observability consistent with existing job-store patterns.
- [ ] Extend workflow step enums and initial step builder:
  - `/videoforge/src/types/job.ts`
  - `/videoforge/src/lib/workflow-steps.ts`
- [ ] Keep jobs API schema backward-compatible while surfacing new subtitle artifacts/metadata fields.

Deliverables:
- end-to-end workflow behavior with deterministic state transitions and artifacts.

#### Phase 6: Test matrix and rollout controls
- [ ] Golden fixture tests (LTR/RTL/CJK/mixed/non-speech cases) with exact expected VTT.
- [ ] Property tests for randomized segment streams and invariant checks.
- [ ] Integration tests for retry/fallback ladder and non-attachment on failure.
- [ ] Workflow tests for step sequencing, skip behavior for non-AI/human provenance, and idempotent rerun behavior.
- [ ] Feature-flag/allowlist tests to support staged rollout.
- [ ] API contract tests for new artifacts and provenance metadata exposure.
- [ ] Seeded randomized tests for deterministic replay (`same input + versions => same output`).

Deliverables:
- confidence gates that lock PRD invariants and rollout safety.

## Alternative Approaches Considered
1. AI-only rewrite with light validation.
   - Rejected: too non-deterministic and hard to debug.
2. Deterministic-only without AI.
   - Rejected for v1: misses theology/readability quality goals.
3. Combined single AI prompt for theology + language.
   - Rejected: weaker observability and less controllable failure handling.

## Acceptance Criteria

### Functional requirements
- [ ] Post-processor mutation runs only for `subtitleOrigin=ai-raw`.
- [ ] `subtitleOrigin=ai-processed|ai-human|human` tracks are never mutated by this pass.
- [ ] Successful automated post-processing transitions provenance from `ai-raw` to `ai-processed`.
- [ ] Unknown/missing provenance defaults to non-mutation behavior equivalent to `human`.
- [ ] WebVTT output always passes strict syntax/timing/constraint validation before attach.
- [ ] LTR/RTL/CJK profile rules are applied with deterministic classification and constraint enforcement.
- [ ] One retry max is enforced for invalid AI output, then deterministic fallback is attempted.
- [ ] Retry is only permitted for validator-rule failures; non-validation failures fail fast and proceed to deterministic fallback or terminal failure per ladder.
- [ ] Invalid outputs are never attached to Mux.

### Non-functional requirements
- [ ] All profile/prompt/validator/fallback versions are centralized and persisted.
- [ ] Hashes (`whisperSegmentsSha256`, `postProcessInputSha256`) are persisted for reproducibility.
- [ ] Idempotency key contract prevents duplicate processing/attachment for identical inputs.
- [ ] Job step status/retries/errors are observable via existing jobs APIs.
- [ ] Processing p95 target and attach success targets from PRD are measurable.

### Quality gates
- [ ] `pnpm typecheck`
- [ ] `pnpm test tests/mux-ai-adapter.test.ts`
- [ ] `pnpm test tests/workflow-state.test.ts`
- [ ] `pnpm test tests/api-jobs-contract.test.ts`
- [ ] `pnpm test` (full suite)
- [ ] New subtitle post-process test files pass (listed below).

## Test Plan (Planned Files)

### Unit tests
- `/videoforge/tests/subtitle-post-process/language-classifier.test.ts`
- `/videoforge/tests/subtitle-post-process/validator.test.ts`
- `/videoforge/tests/subtitle-post-process/fallback-formatter.test.ts`
- `/videoforge/tests/subtitle-post-process/line-breaker.test.ts`
- `/videoforge/tests/subtitle-post-process/timing-normalizer.test.ts`

### Golden fixtures
- `/videoforge/tests/fixtures/subtitle-post-process/en-ltr-long.json`
- `/videoforge/tests/fixtures/subtitle-post-process/ar-rtl-mixed.json`
- `/videoforge/tests/fixtures/subtitle-post-process/ja-cjk-no-spaces.json`
- `/videoforge/tests/fixtures/subtitle-post-process/ar-mixed-script.json`
- `/videoforge/tests/fixtures/subtitle-post-process/non-speech-tokens.json`
- `/videoforge/tests/fixtures/subtitle-post-process/*.expected.vtt`

### Property and integration tests
- `/videoforge/tests/subtitle-post-process/property-invariants.test.ts`
- `/videoforge/tests/workflow-subtitle-post-process.test.ts`
- `/videoforge/tests/mux-data-adapter.test.ts`

### Required scenario assertions
- [ ] Validator rejects:
  - malformed headers/timestamps,
  - overlaps and min-gap violations,
  - CPS/CPL/max-lines overflow,
  - disallowed markup when styling is disabled.
- [ ] Retry ladder behavior:
  - pass #1 invalid -> pass #2 valid (no fallback),
  - pass #1 invalid -> pass #2 invalid -> fallback valid,
  - fallback invalid -> hard fail and no attach.
- [ ] Provenance gating behavior:
  - `ai-raw` processed,
  - `ai-processed|ai-human|human|unknown` skipped.
- [ ] Determinism replay:
  - same input payload + versions + model params => stable output and stable hashes.

## Dependencies & Prerequisites
- Existing Mux adapter boundary remains authoritative for imports and dependency error handling.
- Workflow step model and job-store must be extended without breaking jobs API contract.
- Test harness (`withMockMuxAi`) must support new primitives/translation/caption retrieval shapes.

## Risk Analysis & Mitigation
- Risk: large scope introduces regression in current job flow.
  - Mitigation: ship behind feature flag + allowlist and keep fallback deterministic.
- Risk: translated cue timing data may be unavailable in current adapter response shapes.
  - Mitigation: make adapter contract explicit and fail with typed actionable errors.
- Risk: strict validator over-rejects valid subtitles in early rollout.
  - Mitigation: collect failure diagnostics + tune profiles via versioned config updates.
- Risk: extra workflow retries inflate cost/latency.
  - Mitigation: bound retries to one in subtitle output generation path and log token/cost metrics.

## Rollout Strategy
- Stage 1: Internal/staging on small language allowlist.
- Stage 2: Expand allowlist after validation/fallback and attach-success metrics are stable.
- Stage 3: Promote to default for all `ai-raw` subtitle tracks (while preserving non-mutation behavior for `ai-processed|ai-human|human`).

Operational checkpoints between stages:
- [ ] Validate p95 latency and attach success metrics for at least 3 consecutive daily runs.
- [ ] Confirm fallback rate and retry rate remain within PRD thresholds.
- [ ] Manually review sampled RTL/CJK outputs before allowlist expansion.

Rollback:
- disable feature flag or clear allowlist to return to existing subtitle behavior.
- preserve previous `subtitles.vtt` artifact references so operators can revert attachment source quickly.

## Success Metrics
- [ ] CPS/CPL distributions stay within class profile limits (p95 and max).
- [ ] Attach success rate >= 98% of attempted post-processed tracks.
- [ ] AI retry rate <= 10% and fallback rate <= 5% after warm-up.
- [ ] Processing latency p95 < 60s per track (excluding upstream transcription latency).

## Non-Goals
- Subtitle translation model redesign.
- Real-time subtitle processing.
- Karaoke or word-level timing.
- Shot/scene-aware segmentation.
- UI redesign.

## References & Research

### Internal references
- `/videoforge/src/workflows/videoEnrichment.ts:56`
- `/videoforge/src/workflows/videoEnrichment.ts:178`
- `/videoforge/src/services/mux-ai.ts:296`
- `/videoforge/src/services/mux-ai.ts:319`
- `/videoforge/src/lib/workflow-steps.ts:3`
- `/videoforge/src/types/job.ts:10`
- `/videoforge/src/services/translation.ts:4`
- `/videoforge/src/types/enrichment.ts:33`
- `/videoforge/src/services/coverage-gateway.ts:76`
- `/videoforge/src/services/coverage-gateway.ts:99`
- `/videoforge/src/data/job-store.ts:75`
- `/videoforge/src/config/env.ts:13`
- `/videoforge/src/services/storage.ts:9`
- `/videoforge/src/app/api/jobs/route.ts:70`
- `/videoforge/tests/api-jobs-contract.test.ts:139`

### Institutional learnings
- `/videoforge/docs/critical-patterns.md`
- `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

### Related documents
- `/videoforge/docs/brainstorms/2026-02-16-subtitle-translation-post-processing-hardening-brainstorm.md`
- `/videoforge/docs/brainstorms/2026-02-16-theology-language-subtitle-qa-pass-brainstorm.md`

### External standards references
- https://www.w3.org/TR/webvtt1/
- https://www.rfc-editor.org/rfc/rfc5646
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
- https://unicode.org/reports/tr29/
