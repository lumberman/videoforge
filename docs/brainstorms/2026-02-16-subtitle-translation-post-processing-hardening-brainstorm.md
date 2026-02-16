---
date: 2026-02-16
topic: subtitle-translation-post-processing-hardening
---

# Subtitle + Translation Post-Processing Hardening

## What We're Building
Expand the subtitle/translation post-processing pass into a deterministic, language-aware quality system that outputs validated broadcast-grade WebVTT before Mux attachment.  
This extends the existing theology + language QA concept with strict subtitle engineering controls: language/script classification (LTR/RTL/CJK), per-class CPS/CPL/line/duration limits, hard WebVTT validation, one-retry policy, and deterministic fallback formatting.

Scope includes two business QA prompts (theology sanity + language readability), but only for eligible AI-origin subtitle tracks. Human-created or human-edited subtitles are never mutated.

## Why This Approach
Recommendation: deterministic validator-centered pipeline with constrained AI passes.

It satisfies both business quality goals (doctrinal and readability checks) and platform reliability goals (reproducibility, bounded retries, fallback coverage, no invalid attachments). It also aligns with current architecture constraints: single Next.js app, adapter isolation, and no extra infrastructure.

## Approach Options

### Option 1: AI-first rewrite, light validation
Pros: fastest to ship.  
Cons: weak determinism, unstable quality under edge cases.

### Option 2 (Selected): Deterministic core + constrained AI passes
Pros: validator is authoritative, retry/fallback bounded, robust across LTR/RTL/CJK, clear observability and versioning.  
Cons: higher upfront design effort for profiles and fallback rules.

### Option 3: Deterministic-only (no AI passes)
Pros: maximum reproducibility.  
Cons: weaker theological/language nuance and lower output quality ceiling.

## Key Decisions
- Use `@mux/ai/primitives` as canonical media retrieval via a centralized `MuxDataAdapter` (`fetchTranscriptForAsset(assetId, language)`), with optional storyboard retrieval for QA/debug.
- Keep theology and language QA as separate constrained prompts, with structured cue-JSON input/output.
- Enforce validator gate as law: invalid AI output cannot be attached.
- Failure ladder: AI pass #1, one retry with structured validator errors, deterministic fallback, then hard fail.
- Run QA only when `subtitleOrigin=ai-raw`; skip mutation for `subtitleOrigin=ai-processed|ai-human|human` or unknown.
- Roll out on configured language allowlist first.
- Version and persist all control surfaces: profile/prompt/validator/fallback versions and input hashes.

## Resolved Questions
- Canonical LLM interface: cue-structured JSON with timestamps.
- Theology output mode: annotations + patch suggestions.
- Provenance gate: explicit persisted `subtitleOrigin` metadata (`ai-raw|ai-processed|ai-human|human`), unknown treated as `human`.
- v1 scope: language allowlist rollout.

## Open Questions
- None.

## Next Steps
→ Run `/prompts:workflows-plan` to produce the implementation plan and test matrix for workflow steps, adapters, validator/fallback modules, and fixture/property/integration coverage.
