---
title: "feat: Add coverage translate order cost estimate in action bar"
type: feat
status: completed
date: 2026-02-16
---

# feat: Add coverage translate order cost estimate in action bar

## Enhancement Summary

**Deepened on:** 2026-02-16  
**Sections enhanced:** 7  
**Research inputs used:** repo patterns, institutional learnings, OpenAI pricing/docs, speech-rate and comprehension literature

### Key Improvements
1. Added explicit estimation assumptions (speech rate, token conversion, language expansion, fallback duration) with calibration guidance.
2. Added compatibility guardrails for model naming drift (`OpenAI 5.2` logical name vs provider model IDs).
3. Expanded testing and rollout checks to validate both math correctness and gateway duration extraction contracts.

### New Considerations Discovered
- Pricing pages can differ by locale/version; plan now requires a single source-of-truth config with review-date metadata.
- Educational content pace should use a conservative baseline (slower than conversational) to avoid systematic underestimation.

## Section Manifest

Section 1: Overview/Problem Statement - clarify operator decision outcomes and no-infra constraints.  
Section 2: Proposed Solution - harden estimate formula assumptions and compatibility behavior.  
Section 3: Technical Approach - specify duration field mapping strategy, config boundaries, and deterministic computation rules.  
Section 4: SpecFlow Analysis - add states for missing data, stale config, and language/token variance.  
Section 5: Implementation Phases - add validation and calibration tasks.  
Section 6: Testing Plan - tighten contract/unit coverage for formula and gateway parsing.  
Section 7: Risks/Dependencies - add pricing drift and model-availability mitigations with operational review cadence.

## Planning Notes

Found brainstorm from 2026-02-16: `coverage-translate-estimated-cost`. Using as context for planning.

Selected decisions from brainstorm:
- Show a single inline USD estimate in the bottom coverage translation bar.
- Estimate scales with selected target language count.
- Estimate is directional only (not a quote).
- Total includes transcription plus translation and two post-processing passes.

## Overview

Add a deterministic, client-side estimated cost preview to the coverage page select-mode action bar near `Translate Now`. The estimate should update with current selection and stay lightweight (no new services, no persistence, no billing API).

This feature helps operators evaluate batch order cost before creating jobs, while preserving existing `/api/jobs` and workflow behavior.

## Problem Statement

Current coverage submit flow provides no spend visibility before job creation. Operators can select many videos and languages, then submit blindly. For translation-heavy batches, this increases operator uncertainty and operational friction.

Constraints:
- Keep single-app architecture and deterministic behavior.
- Avoid any new infrastructure.
- Preserve existing route contracts and submission semantics.

## Local Research Findings

### Existing patterns in repo

- Bottom action bar and submit trigger live in `/videoforge/src/features/coverage/coverage-report-client.tsx`.
- Selection order and submit summary are deterministic in `/videoforge/src/features/coverage/submission.ts`.
- Coverage data normalization is centralized in `/videoforge/src/services/coverage-gateway.ts`.
- Coverage video type currently has no duration field in `/videoforge/src/features/coverage/types.ts`.
- Translation bar rendering is already covered by SSR markup tests in `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`.

### Relevant institutional learnings from docs/solutions

- Keep fallback adapter behavior explicit and deterministic, with contract tests for query shape and required fields:
  - `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
- Keep API and workflow error boundaries explicit and tested; avoid silent fallback behavior:
  - `/videoforge/docs/solutions/logic-errors/malformed-json-body-misclassified-as-500-jobs-api-20260215.md`
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

Applied to this plan:
- If duration extraction fails, use explicit deterministic fallback values.
- Add contract tests for any new gateway query fields used to derive duration.
- Keep feature isolated to coverage UI + gateway adapter + pure estimate utility.

## External Research Decision

External research is required because model pricing and naming are time-sensitive and directly impact estimate quality.

Sources reviewed:
- OpenAI API pricing page:
  - [OpenAI Pricing](https://openai.com/api/pricing/)
- OpenAI API docs landing:
  - [OpenAI API Documentation](https://platform.openai.com/docs/overview)

Planning implication:
- Do not hardcode static vendor pricing in multiple files.
- Centralize per-model pricing assumptions in one local config module, with explicit version/date comments and easy override.

### Research Insights

**Best Practices:**
- Keep price assumptions versioned with `effectiveDate` and `sourceUrl` in one config file.
- Prefer directional estimation constants that bias slightly high over low for operator planning UX.

**Implementation Details:**
- OpenAI Help Center token guidance supports deterministic conversion assumptions (`1 token ≈ 0.75 words` for English).
- Speech/comprehension references support using an educational baseline near the low-mid range rather than fast conversational pace.

**References:**
- [OpenAI Pricing](https://openai.com/api/pricing/)
- [OpenAI Help: What are tokens and how to count them?](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)
- [Words per minute (speech/listening references)](https://en.wikipedia.org/wiki/Words_per_minute)
- [Instructional video speech-rate context (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10330257/)

## Proposed Solution

Implement a pure cost-estimation module used by coverage UI. The module computes a single total using:
- selected video duration,
- an average educational speech-rate constant,
- token estimation multipliers,
- per-model input/output token prices,
- selected language count,
- two fixed post-processing passes per language.

The bottom translation bar will render a compact estimate label when in select mode and `selectedCount > 0`.

### Estimation model (high level)

1. Estimate source transcript words from total selected duration and speech-rate assumption.
2. Convert words to tokens using deterministic conversion factors.
3. Compute:
   - transcription cost (source once per video set),
   - translation generation cost (per selected language),
   - post-processing pass cost (2 passes per selected language).
4. Sum and round to display value with stable formatting:
   - `Estimated cost: ~$X.XX`

### Research Insights

**Best Practices:**
- Keep formula monotonic: increasing selected duration or language count must never reduce estimate.
- Use explicit per-language expansion multipliers to avoid assuming translated text length equals source.

**Performance Considerations:**
- Cost computation is O(n) over selected videos and should run on every render only through memoized inputs (selected IDs, selected languages, normalized durations).

**Implementation Details:**
- Recommended default constants for first pass:
  - `speechRateWpm = 135` for educational content.
  - `wordsPerToken = 0.75` (thus `tokensPerWord ≈ 1.33`).
  - `translationOutputMultiplier = 1.1` (language-agnostic approximation).
  - `postProcessPassCount = 2`.
- Add clear TODO in plan implementation: calibrate constants against observed token usage and adjust if median error exceeds target threshold.

## Technical Approach

### 1) Extend coverage video shape with optional duration metadata

Update coverage types and normalization to include optional `durationSeconds`:
- `/videoforge/src/features/coverage/types.ts`
- `/videoforge/src/services/coverage-gateway.ts`

Duration extraction strategy:
- REST + GraphQL candidate fields mapped in adapter with strict numeric parsing.
- Keep `durationSeconds: null` when unavailable or invalid.
- Preserve existing selectable/unselectable semantics.

### 2) Add pure estimate utility

Create a new pure utility module for deterministic math:
- `/videoforge/src/features/coverage/estimate-cost.ts`

Responsibilities:
- input validation and safe defaults,
- token estimation helpers,
- total estimate calculation,
- stable USD formatting helper.

No network calls. No dependency on React or browser globals.

### 3) Centralize model/pricing assumptions

Create one config module consumed by estimate utility:
- `/videoforge/src/features/coverage/estimate-pricing.ts`

Config contains:
- transcription model identifier + input/output token rates,
- translation model identifier + rates,
- post-processing model identifier (`OpenAI 5.2` logical config name) + rates,
- speech-rate default for educational content,
- words-to-tokens conversion factors,
- fallback duration per selected item when duration is missing.

Guardrails:
- Include clear comments that values are estimate assumptions and must be periodically reviewed.
- Keep model names/rates centralized to avoid drift.

Research-informed additions:
- Add `assumptionRevisionDate` and `pricingSourceUrl` fields.
- Add a compatibility alias map so logical names in product language (`openai-5.2-postprocess`) can point to current provider IDs without changing UI copy.
- Add a deterministic fallback model-rate profile if configured model key is missing.

### 4) Wire estimate into translation action bar

Update action bar props and rendering:
- `/videoforge/src/features/coverage/coverage-report-client.tsx`

Behavior:
- Compute selected duration aggregate from selected videos.
- Compute estimate based on selected language count and config.
- Render single compact total in selection view only.
- Keep existing `Translate Now` and clear actions unchanged.

Research-informed additions:
- Include approximation marker in UX copy (tilde + estimated label) to reduce misinterpretation as a quote.
- Keep estimate visually secondary to the action button (informative, not blocking).

### 5) Preserve API/workflow contracts

No changes to:
- `/videoforge/src/app/api/jobs/route.ts` payload contract.
- `/videoforge/src/features/coverage/submission.ts` submit ordering/summary behavior.
- workflow orchestration modules.

## SpecFlow Analysis (Flow + Edge Cases)

Primary user flow:
1. Operator enters coverage page.
2. Operator selects subtitle select mode and chooses videos/languages.
3. Bottom action bar shows live estimate.
4. Operator submits via `Translate Now`.
5. Existing submit and redirect behavior remains unchanged.

Edge cases to cover:
- Zero selected videos: estimate is hidden.
- Zero selected languages: no estimate shown and existing validation remains.
- Missing duration for all selected videos: estimate uses deterministic fallback duration.
- Partial missing durations: mixed real + fallback durations.
- Very large selections: computation remains synchronous and lightweight.
- Invalid numeric values from gateway (negative/NaN): sanitized to null and fallback path.
- Model config mismatch (`OpenAI 5.2` alias missing): use deterministic fallback profile and log a non-fatal warning.
- High language counts: verify linear scaling remains understandable and does not overflow formatting.
- Mixed-language token variance: apply conservative multiplier rather than language-specific dynamic model calls.

## Alternative Approaches Considered

### Option A: Fetch real-time quote from provider API

Rejected:
- Adds runtime coupling and latency to ordering UI.
- Breaks “estimate only” scope and increases failure surface.

### Option B: Show only duration-based rough tiers (low/medium/high)

Rejected:
- Too imprecise versus requested model-aware estimate.
- Reduces operator trust for larger batch decisions.

### Option C: Single deterministic estimate (selected)

Chosen because it is minimal, testable, and directly satisfies request.

## Implementation Phases

### Phase 1: Data and config foundation

- Add optional `durationSeconds` to coverage video types.
- Extend gateway normalization to parse duration candidates from REST/GraphQL payloads.
- Add centralized estimate assumptions module (`estimate-pricing.ts`).

Deliverables:
- typed duration available in coverage client data model,
- deterministic defaults for missing durations and pricing inputs.
- config metadata (`sourceUrl`, `effectiveDate`, `revisionDate`) present for reviewability.

### Phase 2: Estimate engine + UI wiring

- Implement pure estimate utility (`estimate-cost.ts`).
- Integrate utility in coverage client select-mode action bar.
- Add display text near translation CTA: `Estimated cost: ~$X.XX`.

Deliverables:
- live estimate in bottom panel driven by current selection/languages,
- no behavior change in submission flow.

### Phase 3: Hardening and tests

- Add unit tests for estimate utility math and edge handling.
- Extend translation bar tests to assert estimate rendering and formatting.
- Add gateway adapter contract tests for duration extraction query/normalization behavior.

Deliverables:
- deterministic test coverage for estimate calculation and data extraction.
- calibration checklist documented for post-ship validation against sampled real runs.

## Acceptance Criteria

### Functional

- [x] In coverage subtitle select mode, action bar shows a single USD estimate near `Translate Now`.
- [x] Estimate increases/decreases as selected video set changes.
- [x] Estimate scales with number of selected target languages.
- [x] Estimate includes transcription + translation + two post-processing passes in total formula.
- [x] Estimate is hidden when no videos are selected.
- [x] Existing submit flow, result summary, and jobs redirect behavior remain unchanged.

### Non-functional

- [x] No new infrastructure/services/dependencies introduced.
- [x] Estimation logic is pure and deterministic.
- [x] Pricing/model assumptions are centralized in one module.
- [x] Missing/invalid duration data does not block UI and yields deterministic fallback estimate.

### Quality gates

- [x] Unit tests added for estimate math.
- [x] Coverage translation bar tests updated for new estimate UI.
- [x] Coverage gateway contract tests updated for duration mapping behavior.
- [x] Full relevant test subset passes in Codex Cloud constraints.

## Testing Plan

Add/extend tests:
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`
  - verify single estimated-cost text is present in interactive select mode.
  - verify estimate is hidden when selection is empty.
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`
  - assert GraphQL fallback query includes selected duration field paths when fallback is used.
  - verify normalized `durationSeconds` parsing for valid/invalid payloads.
- New file:
  - `/videoforge/tests/coverage-cost-estimate.test.ts`
  - table-driven cases for:
    - standard selection,
    - multi-language scaling,
    - missing duration fallback,
    - rounding/formatting stability,
    - invalid inputs clamped/ignored.

Regression checks:
- `/videoforge/tests/coverage-submission.test.ts`
- `/videoforge/tests/dashboard-jobs-page.test.tsx`

### Research Insights

**Best Practices:**
- Use table-driven tests for estimate math to lock monotonic behavior and rounding boundaries.
- Add one “configuration drift” unit test that fails if required pricing config keys are missing.

**Additional test cases to include:**
- Increasing language count from 1 -> 2 -> 3 strictly increases estimate for fixed duration.
- Missing duration fallback path yields deterministic repeatable value.
- Very short durations still produce non-negative values and stable 2-decimal formatting.
- Invalid config (negative rates) is rejected or clamped by utility guards.

**Verification order:**
1. `pnpm test tests/coverage-cost-estimate.test.ts`
2. `pnpm test tests/coverage-report-client-translation-bar.test.tsx`
3. `pnpm test tests/coverage-gateway-collections-contract.test.ts`
4. `pnpm test tests/coverage-submission.test.ts tests/dashboard-jobs-page.test.tsx`

## Risks and Mitigations

- Risk: Gateway schema differences for duration fields across environments.
  - Mitigation: keep multiple candidate extraction paths and add contract tests for fallback query shape.
- Risk: Estimate perceived as exact billing quote.
  - Mitigation: explicit microcopy (`Estimated`, `~`) and docs note that values are approximate.
- Risk: Pricing drift over time.
  - Mitigation: central config with review-date comment and one-place updates.
- Risk: Provider model naming drift (`gpt-5.2` vs alternate SKU naming).
  - Mitigation: logical model aliases in config and fallback profile coverage in tests.
- Risk: UI clutter in action bar.
  - Mitigation: single compact inline value only, no breakdown UI.
- Risk: Underestimation from optimistic speech-rate assumptions.
  - Mitigation: conservative baseline constants and periodic calibration pass.

## Dependencies

Internal:
- coverage gateway adapter and types.
- coverage translation action bar component.

External:
- OpenAI pricing references for initial assumption values:
  - [OpenAI Pricing](https://openai.com/api/pricing/)
  - [OpenAI API Documentation](https://platform.openai.com/docs/overview)
  - [OpenAI Help: token counting guidance](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)

## Out of Scope

- Real-time billing API integration.
- Persisting estimates in job records.
- Detailed breakdown UI or downloadable quote.
- Changing `/api/jobs` request/response contracts.

## References

### Internal

- `/videoforge/docs/brainstorms/2026-02-16-coverage-translate-estimated-cost-brainstorm.md`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/features/coverage/submission.ts`
- `/videoforge/src/features/coverage/types.ts`
- `/videoforge/src/services/coverage-gateway.ts`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`
- `/videoforge/tests/coverage-gateway-collections-contract.test.ts`
- `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`

### External

- [OpenAI Pricing](https://openai.com/api/pricing/)
- [OpenAI API Documentation](https://platform.openai.com/docs/overview)
- [OpenAI Help: What are tokens and how to count them?](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)
- [Words per minute (speech/listening)](https://en.wikipedia.org/wiki/Words_per_minute)
- [The Effect of Video Playback Speed on Learning (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10330257/)
