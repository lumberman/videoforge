---
title: "feat: AI Video Enrichment Platform implementation"
type: feat
status: completed
date: 2026-02-14
---

# feat: AI Video Enrichment Platform implementation

## Overview

Deliver a production-ready, single-app Next.js platform that orchestrates AI video enrichment workflows, exposes job status and artifacts via API/UI, and runs consistently in both local/Codex Cloud (`WORKFLOW_WORLD=local`) and production (`WORKFLOW_WORLD=vercel`).

This plan converts the PRD in `/videoforge/prd/ai-video-enrichment-platform-prd.md` into implementation phases with explicit quality gates and test requirements.

## Research Summary

### Local Findings

- Existing implementation already includes core scaffolding:
  - workflow orchestration: `/videoforge/src/workflows/videoEnrichment.ts`
  - job persistence: `/videoforge/src/data/job-store.ts`
  - API routes: `/videoforge/src/app/api/jobs/route.ts`, `/videoforge/src/app/api/jobs/[id]/route.ts`
  - artifact route: `/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts`
  - dashboard routes: `/videoforge/src/app/dashboard/jobs/page.tsx`, `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- Project constraints in `/videoforge/AGENTS.md` require:
  - no added infrastructure (DB/queues/microservices)
  - tests for every new feature
  - tests runnable in Codex Cloud without local port binding
- Institutional learning captured:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
  - Key lesson: keep startup state transitions inside guarded error paths and fail loudly on malformed persistence data.

### External Research Decision

External research was completed for Mux AI adoption:

- `@mux/ai/workflows` provides prebuilt workflow functions and states they are compatible with Workflow DevKit via `"use workflow"`/`"use step"` directives.
- `@mux/ai/primitives` provides low-level transcript/image/chunking utilities and all workflows are composed from these primitives.
- `@mux/ai` README lists Node.js prerequisite as `>= 21.0.0`; runtime policy should be aligned to Node 21+ (Node 22 supported/pinnable in Codex Cloud).
- Mux blog positioning: reduce video-AI integration complexity by using packaged workflows/primitives instead of custom glue code.

## Problem Statement / Motivation

The product vision is clear, but execution needs a concrete sequence with enforceable acceptance criteria, especially around:

- deterministic workflow state tracking
- artifact reliability and path safety
- dashboard/API contract stability
- Codex Cloud compatible test coverage for every feature addition

Without a structured plan, implementation can drift and miss reliability/testing requirements.

## Scope

### In Scope

- Enrichment workflow steps and step-state persistence
- Job APIs and artifact retrieval API
- Dashboard list/detail UX for workflow observability
- Optional integrations behind adapters (Mux upload, Strapi notify)
- Adopt `@mux/ai/workflows` for standard Mux video AI operations where supported
- Enforce `@mux/ai/primitives`-first handling for transcript/storyboard/chunking on every Mux video path
- Codex-Cloud-safe automated tests for all added features
- Documentation updates (PRD learnings and solution docs)

### Out of Scope

- New infrastructure (relational DB, Redis, queue broker, extra services)
- Built-in vector database/search productization
- Authentication/authorization overhaul (unless explicitly requested)

## SpecFlow Gap Analysis

### Coverage Gaps To Close

1. Recovery semantics after process interruptions are implied but not explicitly validated.
2. Optional-step behavior (translation/voiceover/mux/cms) needs explicit contract tests for skipped/completed paths.
3. Artifact API traversal/path-safety needs negative-path tests.
4. Dashboard behavior for failed jobs and empty states needs explicit UI checks.
5. Production-world readiness criteria (`WORKFLOW_WORLD=vercel`) need smoke-level config verification.

### Edge Cases To Include

- malformed jobs DB JSON file
- startup failure before first workflow step
- empty `languages` array (translation step skipped)
- failures in optional integrations while required core artifacts still persist correctly
- missing artifact file requests returning 404

## Proposed Solution

Implement in five phases with strict quality gates and Cloud-safe tests. `@mux/ai/workflows` is the default enrichment path for suitable Mux jobs, with `@mux/ai/primitives` used heavily for transcript/media preprocessing.

## Technical Approach

### Phase 1: Mux AI Integration Baseline (Default Path)

Goal: adopt Mux-maintained workflows/primitives as the primary implementation and minimize bespoke code.

Tasks:

- [x] Add a runtime policy update in `/videoforge/package.json` planning notes:
  - validate runtime policy alignment to Node 21+ for `@mux/ai`
  - define environment pinning strategy (Node 22 supported in Codex Cloud)
- [x] Wire `@mux/ai/workflows` directly into existing service entry points first:
  - `/videoforge/src/services/transcription.ts`
  - `/videoforge/src/services/chapters.ts`
  - `/videoforge/src/services/embeddings.ts`
  - `/videoforge/src/services/translation.ts`
- [x] Use `@mux/ai/primitives` as the default preprocessing layer for every Mux video path (transcript/VTT/storyboard/chunking) before any custom logic
- [x] Only introduce `/videoforge/src/services/mux-ai/` if duplication appears after integrating existing service entry points
- [x] Add `@mux/ai` as an explicit dependency and runtime policy guard (`engines.node >=21`)
- [x] Add contract tests in `tests/mux-ai-adapter.test.ts` (new file) with mocked Mux inputs

Deliverables:

- explicit go/no-go decision on Node/runtime compatibility
- default mux-ai-first enrichment path with minimal structural churn

### Phase 2: Foundation Hardening

Goal: lock down workflow/job-state correctness and error handling.

Tasks:

- [x] Validate workflow startup and terminal transitions in `/videoforge/src/workflows/videoEnrichment.ts`
- [x] Ensure `currentStep`, retries, and error logs remain consistent in `/videoforge/src/data/job-store.ts`
- [x] Keep JSON persistence fail-fast on corruption in `/videoforge/src/lib/json-store.ts`
- [x] Add/expand deterministic helper coverage in `tests/workflow-state.test.ts` (new file)

Deliverables:

- deterministic state machine behavior for pending/running/completed/failed
- no silent data reset on malformed job store files

### Phase 3: API Contract Reliability

Goal: make job/artifact endpoints robust and contract-tested.

Tasks:

- [x] Assert request validation and response schemas in `/videoforge/src/app/api/jobs/route.ts`
- [x] Assert 404 behavior and response shape in `/videoforge/src/app/api/jobs/[id]/route.ts`
- [x] Assert safe artifact reads/path handling in `/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts`
- [x] Add route-level tests in `tests/api-jobs-contract.test.ts` and `tests/api-artifacts-route.test.ts` (new files)

Deliverables:

- stable job API behavior for valid/invalid payloads
- secure artifact route behavior for missing/invalid requests

### Phase 4: Dashboard Observability UX

Goal: ensure operators can reliably understand job state and failures.

Tasks:

- [x] Verify and refine list/detail rendering in `/videoforge/src/app/dashboard/jobs/page.tsx`
- [x] Verify and refine job detail error/step/artifact sections in `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- [x] Improve form feedback flows in `/videoforge/src/app/dashboard/jobs/new-job-form.tsx`
- [x] Add UI behavior tests in `tests/dashboard-jobs-page.test.tsx` and `tests/dashboard-job-detail-page.test.tsx` (new files)

Deliverables:

- clear states for empty/running/failed/completed jobs
- actionable failure visibility for operators

### Phase 5: Optional Integrations, Tests, and Docs

Goal: keep optional integrations deterministic while finishing a lean test+documentation rollout.

Tasks:

- [x] Verify adapter boundaries and interfaces in `/videoforge/src/services/openrouter.ts`, `/videoforge/src/services/mux.ts`, `/videoforge/src/cms/strapiClient.ts`
- [x] Confirm optional behavior for `uploadMux` and `notifyCms` in `/videoforge/src/workflows/videoEnrichment.ts`
- [x] Maintain in-process smoke route test in `/videoforge/tests/api-smoke.test.ts`
- [x] Add/update scripts in `/videoforge/package.json` for deterministic local/cloud runs
- [x] Ensure tests avoid bound ports, GUI deps, and external network calls
- [x] Add test-data isolation helpers in `tests/helpers/temp-env.ts` (new file)
- [x] Update PRD decisions/learned constraints in `/videoforge/prd/ai-video-enrichment-platform-prd.md`
- [x] Add additional solution docs in `/videoforge/docs/solutions/` when non-trivial issues are resolved
- [x] Add operator runbook notes in `/videoforge/README.md` (local run, smoke test, troubleshooting)

Deliverables:

- synchronized architecture and testing documentation
- optional integrations do not break core artifact pipeline
- lean, Cloud-safe test harness with minimal duplication
- maintainable implementation trail for future agents

## Acceptance Criteria

### Functional

- [x] `POST /api/jobs` creates a job and triggers workflow execution.
- [x] `GET /api/jobs` and `GET /api/jobs/:id` expose status, current step, retries, errors, and artifact URLs.
- [x] Optional steps (`translation`, `voiceover`, `mux_upload`, `cms_notify`) correctly complete or skip based on options/input.
- [x] Artifact route serves known artifacts and rejects invalid/missing paths safely.
- [x] For every Mux video job, transcript/media preprocessing uses `@mux/ai/primitives` first; custom logic only fills uncovered gaps.
- [x] For suitable jobs, enrichment logic uses `@mux/ai/workflows` as the default path (not optional preference).

### Non-Functional

- [x] Workflow behavior is deterministic in local/Codex Cloud test runs.
- [x] No architecture boundary violations from `AGENTS.md` (no extra infra/services).
- [x] External services remain adapter-isolated and mockable.
- [x] Node runtime compatibility decision for `@mux/ai` is documented and enforced by tests/tooling.

### Testing & Quality Gates

- [x] Every new feature/change includes automated tests in same change set.
- [x] Tests pass in Codex Cloud-compatible mode (no local port binding required).
- [x] `pnpm -s typecheck` passes.
- [x] `pnpm -s test:smoke` passes.
- [x] Contract/unit tests for touched areas pass.

## Dependencies & Risks

### Dependencies

- OpenRouter and Mux credentials for non-mocked integration runs
- local artifact/job filesystem write access
- Next.js runtime compatibility on Node 21+
- `@mux/ai` package runtime requirement (documented as Node.js `>= 21.0.0`)

### Risks

1. Adapter behavior drift between mock and production providers.
2. Workflow state corruption from unexpected file mutations.
3. Dashboard confidence loss if API contracts change silently.
4. Runtime drift between environments may cause inconsistent behavior if Node versions differ.
5. Partial migration may duplicate logic across custom services and `@mux/ai`.

### Mitigations

- keep adapter interfaces strict and tested with mocks
- fail-fast on JSON corruption and test negative paths
- require contract tests for API response shapes on each feature change
- enforce runtime policy with `engines.node >=21` and optional Node 22 pinning in Codex Cloud
- keep mux-ai as default required path and remove duplicated fallback logic where safe

## Implementation Order (Actionable Checklist)

1. Complete `@mux/ai` runtime decision + default integration through existing services (`src/services/*`, `tests/mux-ai-*`).
2. Harden workflow/job-state transitions (`src/workflows`, `src/data`, `src/lib`).
3. Finalize API contract tests (`src/app/api`, `tests/api-*`).
4. Improve and test dashboard behavior (`src/app/dashboard`, `tests/dashboard-*`).
5. Finish optional integrations, lean Cloud-safe test harness, and documentation (`src/cms`, `package.json`, `tests/helpers`, `prd`, `README`).

## Follow-up Update (2026-02-15)

- Finalized mux-ai dependency policy for production behavior:
  - mux-ai remains required for core Mux enrichment steps
  - workflow must fail deterministically when mux runtime/config/import is unavailable
  - process remains healthy (guarded import), with no silent success fallback for core steps
- Added structured operator diagnostics through job errors:
  - `errors[].code`
  - `errors[].operatorHint`
  - `errors[].isDependencyError`
- Confirmed test strategy shift:
  - unit tests isolate mux-ai behind adapter-level mocking
  - workflow/API tests assert structured dependency failures
  - optional primitives preprocessing remains non-fatal and emits warnings instead of failing jobs

## Post-Review Reliability Hardening (2026-02-15)

- [x] Trimmed mux credential checks so whitespace-only values are treated as missing before import.
- [x] Kept guarded dynamic imports and structured `MUX_AI_CONFIG_MISSING` failures for invalid/missing mux runtime env.
- [x] Enforced no-retry behavior for deterministic mux dependency errors (`MUX_AI_CONFIG_MISSING`, `MUX_AI_IMPORT_FAILED`, `MUX_AI_INVALID_RESPONSE`).
- [x] Simplified orchestration catch-path dedupe by using `appendJobError(..., { dedupeLast: true })` as the single dedupe mechanism.
- [x] Reduced duplication in primitives preprocessing by introducing a shared optional-call fallback helper for VTT/chunk generation.
- [x] Added regression coverage for invalid mux response shape and deterministic non-retry workflow behavior.

## Definition of Done for This Plan

- All acceptance criteria are satisfied.
- No prohibited infrastructure changes were introduced.
- Test coverage exists for every delivered feature increment and passes in Codex Cloud constraints.
- Documentation is updated (PRD + solution docs as needed).

## References

### Internal

- `/videoforge/prd/ai-video-enrichment-platform-prd.md`
- `/videoforge/AGENTS.md`
- `/videoforge/src/workflows/videoEnrichment.ts`
- `/videoforge/src/data/job-store.ts`
- `/videoforge/src/app/api/jobs/route.ts`
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

### External

- https://github.com/muxinc/ai
- https://github.com/muxinc/ai/blob/main/docs/WORKFLOWS.md
- https://github.com/muxinc/ai/blob/main/docs/PRIMITIVES.md
- https://www.mux.com/blog/video-ai-shouldn-t-be-hard-so-we-built-mux-ai
