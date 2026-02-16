---
date: 2026-02-16
topic: theology-language-subtitle-qa-pass
---

# Theology + Language Subtitle QA Pass

## What We're Building
Add a post-translation subtitle quality gate to the workflow that runs after STT/translation and before final subtitle attachment. This gate adds two external-model passes:
- Theology and doctrinal sanity analysis to detect mistranslations and doctrinal drift.
- Language quality pass to lightly improve readability and normalize biblical/theological terminology.

This is a business-specific capability on top of Mux AI. Mux remains responsible for core media/transcription/translation primitives, while this new step enforces domain quality and subtitle readability standards.

## Why This Approach
The best fit is a hybrid deterministic gate:
- Use Mux primitives as canonical media input retrieval.
- Use external LLMs only for constrained subtitle analysis/correction.
- Treat the non-AI validator as the source of truth.

This preserves your current architecture rules (single app, adapter isolation, deterministic workflows, no extra infrastructure) while adding your theology-specific QA requirement.

## Approach Options

### Option 1: Analysis-only theology + deterministic formatter rewrite
The theology pass outputs only issue annotations. A deterministic formatter applies all text changes and timing decisions.

Pros:
- Maximum determinism and auditability.
- Lower risk of uncontrolled model rewrites.

Cons:
- Large rule surface in deterministic code.
- Slower to reach high linguistic quality across many languages.

Best when: strict compliance and reproducibility are prioritized over nuanced language polish.

### Option 2 (Recommended): Dual-pass LLM with hard validator and deterministic fallback
Run two LLM passes after translation:
- Pass A theology review (analysis + suggested minimal edits).
- Pass B language quality rewrite (light corrections only).
Then enforce strict machine validation and fallback formatter if any output fails.

Pros:
- Meets theology + readability goals with limited additional complexity.
- Keeps deterministic safety net and bounded retries.
- Matches your PRD requirement: AI optional, validator is law.

Cons:
- Requires careful prompt/output contracts and schema validation.
- Needs explicit versioning for prompts/profiles/validator/fallback.

Best when: you need better subtitle quality now without building a large deterministic NLP rule engine.

### Option 3: Single combined LLM pass
One prompt handles theology and language quality in a single call.

Pros:
- Lowest token cost and shortest pipeline.
- Simplest execution graph.

Cons:
- Harder to diagnose failures (theology vs language issues mixed).
- Lower control and weaker observability.

Best when: cost minimization is more important than quality traceability.

## Key Decisions
- Choose Option 2: two explicit LLM passes plus deterministic validator/fallback.
- Keep Mux primitives-first by introducing one `MuxDataAdapter` as the canonical path for `fetchTranscriptForAsset(assetId, language)` and optional storyboard debug retrieval.
- Keep integration boundaries clean: workflow step orchestration in workflow layer, model calls in service adapters, no direct external API calls from workflow definitions.
- Roll out v1 on a configured language allowlist first.
- Add a hard provenance gate: run theology/language QA mutation only for `subtitleOrigin=ai-raw`.
- Treat `subtitleOrigin=ai-processed|ai-human|human` as non-mutation states.
- Treat unknown provenance as `human` and skip QA/mutation to avoid accidental edits.
- Define output contract per pass:
  - Theology pass: structured issue list with optional minimal patch hints.
  - Language pass: lightly corrected transcript/cues intended for final VTT shaping.
- Enforce retry policy: at most one AI retry after validator errors, then fallback formatter.
- Persist version/hash metadata (`languageProfileVersion`, `promptVersion`, `validatorVersion`, `fallbackVersion`, input hashes) for reproducibility.

## Resolved Questions
- Pipeline location: this belongs after translation and before final text-track attachment.
- Mux responsibility boundary: theology QA is custom and must run outside `@mux/ai` translation.
- Safety model: validator gate is mandatory; invalid outputs are never attached.
- Canonical LLM input/output unit (v1): cue-structured JSON with timestamps.
- Theology pass output mode (v1): annotations plus patch suggestions.
- Scope for first release: configured language allowlist.
- Human-protection rule: do not run QA edits on human subtitle tracks.
- Authoritative QA provenance gate (v1): explicit persisted `subtitleOrigin` metadata (`ai-raw|ai-processed|ai-human|human`) on created tracks; unknown/missing is treated as `human` for safety.

## Open Questions
- None.

## Next Steps
- Move to planning with `/workflows:plan` and define:
  - new workflow steps and idempotency key extensions,
  - adapter interfaces and prompt schema contracts,
  - validator/fallback module boundaries,
  - fixture/property/integration test matrix.
