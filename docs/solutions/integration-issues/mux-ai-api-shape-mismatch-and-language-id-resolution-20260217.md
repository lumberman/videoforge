---
module: Mux AI Integration
date: 2026-02-17
problem_type: integration_issue
component: service_object
symptoms:
  - "Jobs created from coverage submit (`POST /api/jobs` returns 202) failed at `transcription` with `none of [...] are exported by the module` errors."
  - "Server logs repeatedly showed optional fallback noise: `primitives transcription` export mismatch warnings."
  - "Runtime import errors appeared in some environments: `Cannot find module '@mux/ai/primitives'` and fallback `Cannot find module '@mux/ai'`."
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [mux-ai, integration, api-shape, language-mapping, translation-jobs]
---

# Troubleshooting: Mux AI API Shape Mismatch and Language ID Resolution

## Problem
The enrichment adapter expected legacy `@mux/ai` function names and argument shapes, but installed/runtime `@mux/ai` exports use a different API surface. Coverage submit looked successful, but background jobs failed during transcription/translation because adapter calls did not match real module exports.

## Environment
- Module: Mux AI Integration
- Affected Component: Mux service adapter + enrichment workflow orchestration
- Date solved: 2026-02-17

## Symptoms
- `POST /api/jobs` succeeded (`202`), but jobs moved to `failed` at `transcription`.
- Workflow error: `Mux AI workflow transcription failed: none of [transcribe, transcriptionWorkflow, runTranscriptionWorkflow] are exported by the module`.
- Logs showed repeated optional fallback messages for primitives transcription export mismatch.
- In some runtime/bundle contexts, imports failed with `Cannot find module '@mux/ai/primitives'` and fallback `Cannot find module '@mux/ai'`.

## What Didn't Work

**Attempted Solution 1:** Add import fallback from `@mux/ai/primitives` to `@mux/ai` only.
- **Why it failed:** Import fallback alone did not solve runtime failures when adapter still called outdated function names/signatures.

**Attempted Solution 2:** Keep legacy candidate lists (`transcribe`, `extractMetadata`, `translateTranscript`) as primary execution path.
- **Why it failed:** Current `@mux/ai` workflows expose functions like `generateChapters`, `getSummaryAndTags`, `generateEmbeddings`, and `translateCaptions` with asset/language-code-based signatures.

## Solution

Implemented a compatibility + API-shape alignment fix across adapter and workflow layers.

### 1) Make `@mux/ai` imports deterministic and runtime-safe
- Replaced dynamic `import(moduleName)` with explicit static import switch.
- Kept root namespace fallback (`@mux/ai`) for versions/environments without subpath exports.

### 2) Align transcription with current primitives API
- Added primitives path using `fetchTranscriptForAsset` when legacy primitives functions are absent.
- Added Mux asset fetch (`/video/v1/assets/:id`) to obtain playback/track metadata required for transcript fetch.
- Normalized transcript result into internal `Transcript` shape.

### 3) Align workflow operations with current `@mux/ai/workflows` API
- Chapters: prefer `generateChapters(assetId, languageCode)` and map result.
- Metadata: prefer `getSummaryAndTags(assetId)` and map to internal metadata type.
- Embeddings: prefer `generateEmbeddings(assetId)` and map chunks.
- Translation: prefer `translateCaptions(assetId, from, to, options)` and convert VTT to plain text result payload.

### 4) Resolve internal language IDs before workflow translation
- Added language code resolver for numeric IDs (example: `3934`) via Core GraphQL `language(id) { bcp47 iso3 }`.
- Cache resolved codes in-memory for repeated calls.
- Pass resolved ISO-639-1 codes to `translateCaptions`.

### 5) Thread `muxAssetId` through all service boundaries that now require asset-based workflow calls
- Updated service signatures and workflow invocation paths for chapters, metadata, embeddings, and translation.

### 6) Reduce noisy retry/fallback behavior for deterministic adapter mismatches
- Treat export-mismatch operation errors as deterministic (non-retryable) in workflow retry gate.
- Keep optional fallback for known compatibility cases without warning spam.

## Why This Works
1. Import resolution is explicit and bundler-friendly, eliminating expression-based module resolution ambiguity.
2. Adapter now targets the real `@mux/ai` API surface and signatures used by installed versions.
3. Language IDs from product flows are translated to workflow-compatible language codes before translation calls.
4. Deterministic mismatch errors stop being retried, so failures are clearer and faster to diagnose.

## Prevention
- Keep adapter contract tests pinned to current exported function names/signatures from `@mux/ai`.
- When upgrading `@mux/ai`, run a schema check against `dist/*.d.ts` exports and update adapter mappings in the same change.
- Keep language-ID-to-code resolution tests for translation paths that originate from internal language IDs.
- Treat `none of [...] are exported` failures as deterministic integration mismatches, not transient runtime errors.

## Verification
- `pnpm tsx --test tests/mux-ai-adapter.test.ts`
- `pnpm tsx --test tests/workflow-state.test.ts`
- `pnpm typecheck`

All passed after the fix set.

## Related Files
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/services/chapters.ts`
- `/videoforge/src/services/metadata.ts`
- `/videoforge/src/services/embeddings.ts`
- `/videoforge/src/services/translation.ts`
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/tests/mux-ai-adapter.test.ts`
- `/videoforge/tests/workflow-state.test.ts`

## Related Issues
- Base compatibility gate pattern: `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- Coverage/Core schema drift reference: `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
