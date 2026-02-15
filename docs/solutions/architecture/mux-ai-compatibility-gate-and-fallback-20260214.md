---
module: Mux AI Integration
date: 2026-02-14
problem_type: runtime_dependency_reliability
component: service_adapters
symptoms:
  - "Mux AI import-time env checks can terminate process when credentials are missing."
  - "Silent provider fallback hides dependency failures and misleads operators."
root_cause: implicit_fallback_and_missing_structured_errors
resolution_type: required_dependency_with_predictable_failure
severity: high
tags: [mux-ai, deterministic-failure, operator-diagnostics, codex-cloud]
---

# Troubleshooting: Required Mux AI with Predictable Failure

## Problem
Mux AI is required for mux-enrichment paths, but direct runtime usage can hard-fail when credentials are absent. Previous fallback behavior could make jobs appear healthy when core mux-ai execution was actually unavailable.

## Solution
Implemented a strict but graceful dependency model:

1. Keep `@mux/ai` as a required dependency with runtime policy `engines.node >=21`.
2. Guard dynamic imports before loading `@mux/ai` to prevent process crashes on missing env.
3. Replace silent OpenRouter fallback for core mux steps with typed mux-ai errors:
   - `MUX_AI_CONFIG_MISSING`
   - `MUX_AI_IMPORT_FAILED`
   - `MUX_AI_OPERATION_FAILED`
   - `MUX_AI_INVALID_RESPONSE`
4. Persist structured error metadata on jobs (`code`, `operatorHint`, `isDependencyError`) so API and dashboard expose actionable operator context.
5. Keep primitives preprocessing non-fatal for optional artifacts (VTT/storyboard/chunks) and surface warnings in logs.
6. Move unit tests to adapter-level mocking instead of relying on live mux runtime.

## Why This Works
- Jobs fail deterministically when required dependency conditions are not met.
- Process health is preserved because import is guarded before mux-ai module evaluation.
- Operators get machine-readable diagnostics instead of ambiguous failures.
- Users get graceful API/UI behavior (job marked failed, with clear error details) rather than crashes or false success.

## Verification
- Adapter tests cover missing credentials and import failures with structured mux-ai errors.
- Workflow tests verify missing mux runtime produces failed jobs with preserved step context and dependency error metadata.
- API contract tests verify structured error fields are returned from `GET /api/jobs` and `GET /api/jobs/:id`.
- Smoke tests pass with mocked adapter boundary and no external network calls.

## Related Files
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/src/types/job.ts`
- `/videoforge/src/data/job-store.ts`
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/tests/mux-ai-adapter.test.ts`
- `/videoforge/tests/workflow-state.test.ts`
- `/videoforge/tests/api-jobs-contract.test.ts`
