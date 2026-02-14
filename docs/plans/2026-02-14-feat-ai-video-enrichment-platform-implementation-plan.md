---
title: "feat: AI Video Enrichment Platform implementation"
type: feat
status: active
date: 2026-02-14
---

# feat: AI Video Enrichment Platform implementation

## Overview

Deliver a production-ready, single-app Next.js platform that orchestrates AI video enrichment workflows, exposes job status and artifacts via API/UI, and runs consistently in both local/Codex Cloud (`WORKFLOW_WORLD=local`) and production (`WORKFLOW_WORLD=vercel`).

This plan converts the PRD in `/Users/o/GitHub/videoforge/prd/ai-video-enrichment-platform-prd.md` into implementation phases with explicit quality gates and test requirements.

## Research Summary

### Local Findings

- Existing implementation already includes core scaffolding:
  - workflow orchestration: `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
  - job persistence: `/Users/o/GitHub/videoforge/src/data/job-store.ts`
  - API routes: `/Users/o/GitHub/videoforge/src/app/api/jobs/route.ts`, `/Users/o/GitHub/videoforge/src/app/api/jobs/[id]/route.ts`
  - artifact route: `/Users/o/GitHub/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts`
  - dashboard routes: `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/page.tsx`, `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- Project constraints in `/Users/o/GitHub/videoforge/AGENTS.md` require:
  - no added infrastructure (DB/queues/microservices)
  - tests for every new feature
  - tests runnable in Codex Cloud without local port binding
- Institutional learning captured:
  - `/Users/o/GitHub/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
  - Key lesson: keep startup state transitions inside guarded error paths and fail loudly on malformed persistence data.

### External Research Decision

External research was completed for Mux AI adoption:

- `@mux/ai/workflows` provides prebuilt workflow functions and states they are compatible with Workflow DevKit via `"use workflow"`/`"use step"` directives.
- `@mux/ai/primitives` provides low-level transcript/image/chunking utilities and all workflows are composed from these primitives.
- `@mux/ai` README lists Node.js prerequisite as `>= 21.0.0`, which conflicts with current project requirement of Node 20 and must be resolved before full adoption.
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

- [ ] Add a dependency compatibility gate in `/Users/o/GitHub/videoforge/package.json` planning notes:
  - validate whether runtime can move from Node 20 to Node 21+ for `@mux/ai`
  - if Node 20 must remain, define a pinned fallback strategy and compatibility tests before rollout
- [ ] Wire `@mux/ai/workflows` directly into existing service entry points first:
  - `/Users/o/GitHub/videoforge/src/services/transcription.ts`
  - `/Users/o/GitHub/videoforge/src/services/chapters.ts`
  - `/Users/o/GitHub/videoforge/src/services/embeddings.ts`
  - `/Users/o/GitHub/videoforge/src/services/translation.ts`
- [ ] Use `@mux/ai/primitives` as the default preprocessing layer for every Mux video path (transcript/VTT/storyboard/chunking) before any custom logic
- [ ] Only introduce `/Users/o/GitHub/videoforge/src/services/mux-ai/` if duplication appears after integrating existing service entry points
- [ ] Add feature flag in env/config for controlled rollout: `MUX_AI_ENABLED=true|false`
- [ ] Add contract tests in `tests/mux-ai-adapter.test.ts` (new file) with mocked Mux inputs

Deliverables:

- explicit go/no-go decision on Node/runtime compatibility
- default mux-ai-first enrichment path with minimal structural churn

### Phase 2: Foundation Hardening

Goal: lock down workflow/job-state correctness and error handling.

Tasks:

- [ ] Validate workflow startup and terminal transitions in `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
- [ ] Ensure `currentStep`, retries, and error logs remain consistent in `/Users/o/GitHub/videoforge/src/data/job-store.ts`
- [ ] Keep JSON persistence fail-fast on corruption in `/Users/o/GitHub/videoforge/src/lib/json-store.ts`
- [ ] Add/expand deterministic helper coverage in `tests/workflow-state.test.ts` (new file)

Deliverables:

- deterministic state machine behavior for pending/running/completed/failed
- no silent data reset on malformed job store files

### Phase 3: API Contract Reliability

Goal: make job/artifact endpoints robust and contract-tested.

Tasks:

- [ ] Assert request validation and response schemas in `/Users/o/GitHub/videoforge/src/app/api/jobs/route.ts`
- [ ] Assert 404 behavior and response shape in `/Users/o/GitHub/videoforge/src/app/api/jobs/[id]/route.ts`
- [ ] Assert safe artifact reads/path handling in `/Users/o/GitHub/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts`
- [ ] Add route-level tests in `tests/api-jobs-contract.test.ts` and `tests/api-artifacts-route.test.ts` (new files)

Deliverables:

- stable job API behavior for valid/invalid payloads
- secure artifact route behavior for missing/invalid requests

### Phase 4: Dashboard Observability UX

Goal: ensure operators can reliably understand job state and failures.

Tasks:

- [ ] Verify and refine list/detail rendering in `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/page.tsx`
- [ ] Verify and refine job detail error/step/artifact sections in `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- [ ] Improve form feedback flows in `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/new-job-form.tsx`
- [ ] Add UI behavior tests in `tests/dashboard-jobs-page.test.tsx` and `tests/dashboard-job-detail-page.test.tsx` (new files)

Deliverables:

- clear states for empty/running/failed/completed jobs
- actionable failure visibility for operators

### Phase 5: Optional Integrations, Tests, and Docs

Goal: keep optional integrations deterministic while finishing a lean test+documentation rollout.

Tasks:

- [ ] Verify adapter boundaries and interfaces in `/Users/o/GitHub/videoforge/src/services/openrouter.ts`, `/Users/o/GitHub/videoforge/src/services/mux.ts`, `/Users/o/GitHub/videoforge/src/cms/strapiClient.ts`
- [ ] Confirm optional behavior for `uploadMux` and `notifyCms` in `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
- [ ] Maintain in-process smoke route test in `/Users/o/GitHub/videoforge/tests/api-smoke.test.ts`
- [ ] Add/update scripts in `/Users/o/GitHub/videoforge/package.json` for deterministic local/cloud runs
- [ ] Ensure tests avoid bound ports, GUI deps, and external network calls
- [ ] Add test-data isolation helpers in `tests/helpers/temp-env.ts` (new file)
- [ ] Update PRD decisions/learned constraints in `/Users/o/GitHub/videoforge/prd/ai-video-enrichment-platform-prd.md`
- [ ] Add additional solution docs in `/Users/o/GitHub/videoforge/docs/solutions/` when non-trivial issues are resolved
- [ ] Add operator runbook notes in `/Users/o/GitHub/videoforge/README.md` (local run, smoke test, troubleshooting)

Deliverables:

- synchronized architecture and testing documentation
- optional integrations do not break core artifact pipeline
- lean, Cloud-safe test harness with minimal duplication
- maintainable implementation trail for future agents

## Acceptance Criteria

### Functional

- [ ] `POST /api/jobs` creates a job and triggers workflow execution.
- [ ] `GET /api/jobs` and `GET /api/jobs/:id` expose status, current step, retries, errors, and artifact URLs.
- [ ] Optional steps (`translation`, `voiceover`, `mux_upload`, `cms_notify`) correctly complete or skip based on options/input.
- [ ] Artifact route serves known artifacts and rejects invalid/missing paths safely.
- [ ] For every Mux video job, transcript/media preprocessing uses `@mux/ai/primitives` first; custom logic only fills uncovered gaps.
- [ ] For suitable jobs, enrichment logic uses `@mux/ai/workflows` as the default path (not optional preference).

### Non-Functional

- [ ] Workflow behavior is deterministic in local/Codex Cloud test runs.
- [ ] No architecture boundary violations from `AGENTS.md` (no extra infra/services).
- [ ] External services remain adapter-isolated and mockable.
- [ ] Node runtime compatibility decision for `@mux/ai` is documented and enforced by tests/tooling.

### Testing & Quality Gates

- [ ] Every new feature/change includes automated tests in same change set.
- [ ] Tests pass in Codex Cloud-compatible mode (no local port binding required).
- [ ] `pnpm -s typecheck` passes.
- [ ] `pnpm -s test:smoke` passes.
- [ ] Contract/unit tests for touched areas pass.

## Dependencies & Risks

### Dependencies

- OpenRouter and Mux credentials for non-mocked integration runs
- local artifact/job filesystem write access
- Next.js runtime compatibility on Node 20+
- `@mux/ai` package runtime requirement (documented as Node.js `>= 21.0.0`)

### Risks

1. Adapter behavior drift between mock and production providers.
2. Workflow state corruption from unexpected file mutations.
3. Dashboard confidence loss if API contracts change silently.
4. Node 20 vs `@mux/ai` Node 21+ requirement may block direct adoption.
5. Partial migration may duplicate logic across custom services and `@mux/ai`.

### Mitigations

- keep adapter interfaces strict and tested with mocks
- fail-fast on JSON corruption and test negative paths
- require contract tests for API response shapes on each feature change
- add a Phase 1 compatibility gate before broad `@mux/ai` rollout
- migrate feature-by-feature behind `MUX_AI_ENABLED` and remove duplicated paths after parity validation

## Implementation Order (Actionable Checklist)

1. Complete `@mux/ai` runtime decision + default integration through existing services (`src/services/*`, `tests/mux-ai-*`).
2. Harden workflow/job-state transitions (`src/workflows`, `src/data`, `src/lib`).
3. Finalize API contract tests (`src/app/api`, `tests/api-*`).
4. Improve and test dashboard behavior (`src/app/dashboard`, `tests/dashboard-*`).
5. Finish optional integrations, lean Cloud-safe test harness, and documentation (`src/cms`, `package.json`, `tests/helpers`, `prd`, `README`).

## Definition of Done for This Plan

- All acceptance criteria are satisfied.
- No prohibited infrastructure changes were introduced.
- Test coverage exists for every delivered feature increment and passes in Codex Cloud constraints.
- Documentation is updated (PRD + solution docs as needed).

## References

### Internal

- `/Users/o/GitHub/videoforge/prd/ai-video-enrichment-platform-prd.md`
- `/Users/o/GitHub/videoforge/AGENTS.md`
- `/Users/o/GitHub/videoforge/src/workflows/videoEnrichment.ts`
- `/Users/o/GitHub/videoforge/src/data/job-store.ts`
- `/Users/o/GitHub/videoforge/src/app/api/jobs/route.ts`
- `/Users/o/GitHub/videoforge/src/app/dashboard/jobs/page.tsx`
- `/Users/o/GitHub/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`

### External

- https://github.com/muxinc/ai
- https://github.com/muxinc/ai/blob/main/docs/WORKFLOWS.md
- https://github.com/muxinc/ai/blob/main/docs/PRIMITIVES.md
- https://www.mux.com/blog/video-ai-shouldn-t-be-hard-so-we-built-mux-ai
