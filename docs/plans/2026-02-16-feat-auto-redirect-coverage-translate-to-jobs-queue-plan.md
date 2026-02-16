---
title: "feat: Auto-redirect coverage translate flow to jobs queue"
type: feat
status: completed
date: 2026-02-16
---

# feat: Auto-redirect coverage translate flow to jobs queue

## Enhancement Summary

**Deepened on:** 2026-02-16  
**Sections enhanced:** 10  
**Research inputs used:** local repo patterns, institutional learnings in `/videoforge/docs/solutions/`, targeted Next.js App Router docs via Context7

### Key Improvements
1. Added a strict redirect contract (`created > 0`) plus explicit non-redirect branches.
2. Added a typed query-param flash contract and validation guidance for jobs-page parsing.
3. Expanded test plan with redirect-loop prevention, mixed-result behavior, and malformed-query handling.

### New Considerations Discovered
- Because `/dashboard/jobs` is already `dynamic = 'force-dynamic'`, search-param flash rendering does not add new rendering-mode risk.
- Redirect logic should use a one-shot guard ref and avoid depending on mutable objects to prevent repeat navigation in re-renders.

## Overview
When operators click `Translate Now` in `/dashboard/coverage`, jobs are created, but the UI currently only shows a local count summary. This plan adds a deterministic success redirect to the jobs list so users land directly in queue operations after submission.

Selected behavior from brainstorm:
- Option 2: auto-redirect to jobs queue on successful submit.

## Found Brainstorm Context
Found brainstorm from 2026-02-16: `coverage-translate-jobs-linkage`. Using as context for planning.

Carried decisions:
- Keep existing multi-select coverage flow.
- Treat the flow as fully linked by routing users to jobs queue after successful submission.
- Do not add new infrastructure.

Reference:
- `/videoforge/docs/brainstorms/2026-02-16-coverage-translate-jobs-linkage-brainstorm.md`

## Section Manifest
- Section 1: Flow linkage contract — define exactly when redirect should and should not happen.
- Section 2: Queue flash semantics — define robust query-param parsing and rendering behavior.
- Section 3: Failure and mixed-result handling — preserve deterministic visibility for failed/skipped items.
- Section 4: Regression protection — ensure tests catch redirect regressions and noisy param handling.

## Local Research Summary

### Existing pattern findings (repo research)
- Coverage translate action already creates jobs via `POST /api/jobs`:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1548`
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1585`
- Submission output already contains per-item `jobId` and created/failed/skipped counts:
  - `/videoforge/src/features/coverage/submission.ts:53`
  - `/videoforge/src/features/coverage/submission.ts:97`
- Coverage header already links to queue (`/jobs` alias):
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1681`
- Jobs alias and list routes exist:
  - `/videoforge/src/app/jobs/page.tsx:3`
  - `/videoforge/src/app/dashboard/jobs/page.tsx:17`
- Current coverage success state is local-only text summary, no redirect:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1852`

### Institutional learnings (learnings research)
- Preserve deterministic status/error behavior for job flows and avoid hiding failures:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- Keep API error classification explicit and stable (client vs server distinction):
  - `/videoforge/docs/solutions/logic-errors/malformed-json-body-misclassified-as-500-jobs-api-20260215.md`
- Coverage-related patterns require explicit contracts and regression tests for user-visible runtime behavior:
  - `/videoforge/docs/critical-patterns.md`
  - `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`

### Framework documentation insights (targeted)
- App Router client navigation should use `next/navigation` routing primitives when doing in-app transitions from Client Components.
- Page-level query params are exposed as `searchParams` (string | string[] | undefined), so parsing must explicitly normalize arrays and invalid values.
- Navigation URLs must be trusted/sanitized; for this plan, URL values are internally generated numeric counts only.

References:
- https://nextjs.org/docs/app/api-reference/functions/use-router
- https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional

## Research Decision
Broad external research is not required.

Rationale:
- This feature is internal UI flow linkage using established local patterns.
- No novel third-party APIs or high-risk domain changes are introduced.
- Repo already has clear conventions for queue routes, submission summaries, and deterministic test style.
- Targeted framework documentation was still used to tighten navigation and query-param handling details.

## Problem Statement / Motivation
Current flow is only partially linked:
- User submits translations from coverage.
- Jobs are created successfully.
- User must manually click `Queue` and locate new jobs.

This increases operator friction and weakens completion feedback for a core workflow.

## SpecFlow Analysis

### User flow (target)
1. Operator selects one or more videos in coverage mode.
2. Operator clicks `Translate Now`.
3. Coverage creates jobs one-per-selectable-video.
4. If at least one job is created, UI redirects to jobs queue.
5. Jobs queue shows newly created jobs at top based on existing list ordering behavior.

### Edge cases
- No selected videos: stay on coverage, show validation error.
- No selected languages: stay on coverage, show validation error.
- Submit returns zero created (all failed/skipped): stay on coverage, keep explicit failure/summary state.
- Mixed results (created + failed/skipped): redirect because submit is successful for at least one job; preserve counts in queue flash message.
- Double-click/duplicate submits: existing `submitting` guard remains authoritative.

### Specification gaps to close
- Define “successful submit” explicitly as `result.created > 0`.
- Define redirect target and message contract.
- Ensure one-time redirect to avoid repeated navigation loops.

### Research Insights
**Best Practices:**
- Treat redirect decision as a pure branch based on immutable submission result fields.
- Keep flash rendering purely decorative; job list remains canonical source of truth.

**Edge Cases:**
- Query param poisoning/noise (e.g., `created=abc`) should suppress banner, not error.
- Multiple values (e.g., `created=1&created=2`) should resolve deterministically (first valid scalar only).

## Proposed Solution
Implement success redirect from coverage to jobs queue with lightweight query-param flash context.

- On `submitState.type === 'done'` and `result.created > 0`, navigate to:
  - `/dashboard/jobs?from=coverage&created=<n>&failed=<n>&skipped=<n>`
- Update jobs page to read these search params and render a small success info banner.
- Keep coverage-side error and non-success summary behavior for `created === 0` unchanged.

### Why this approach
- Meets selected Option 2 directly.
- Uses existing pages/routes and avoids any persistence/session complexity.
- Keeps deterministic behavior and transparent partial-failure reporting.

### Research Insights
**Implementation Detail:**
- Keep the query contract minimal and explicit:
  - `from=coverage`
  - `created=<int>`
  - `failed=<int>`
  - `skipped=<int>`

**Anti-patterns to Avoid:**
- Do not redirect for `created === 0`, even if failed/skipped > 0.
- Do not infer success from HTTP 200 alone; use normalized `submitCoverageSelection` result.

## Technical Considerations
- Prefer redirecting to `/dashboard/jobs` (canonical page) rather than `/jobs` alias to avoid query-loss ambiguity through alias redirects.
- Use one-time redirect guard in the client (`useRef`) to avoid repeated redirects during re-renders.
- Keep all changes within existing coverage UI + jobs page; no API contract changes required.
- Maintain accessibility for success/error banners (`role="status"`, concise copy).

### Research Insights
**Navigation Mechanism:**
- Recommended baseline: `router.push('/dashboard/jobs?...')` from `next/navigation` in Client Components.
- Acceptable consistency fallback in this codebase: `window.location.href`/`assign` (already used in coverage selector flow).
- Pick one and standardize in this feature to avoid mixed navigation semantics.

**Performance Considerations:**
- Jobs page already uses `dynamic = 'force-dynamic'`; flash params add negligible overhead.
- Keep flash parser O(1) over known keys and avoid broad object iteration.

**Security Considerations:**
- Construct redirect URL from local numeric values only.
- Never pass untrusted strings directly into navigation APIs.

## Implementation Plan

### Phase 1: Coverage redirect trigger
- [x] Add one-time success redirect effect in:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx`
- [x] Redirect only when:
  - `submitState.type === 'done'`
  - `submitState.result.created > 0`
- [x] Build deterministic target URL with summary params (`from`, `created`, `failed`, `skipped`).
- [x] Add one-shot redirect guard ref reset rules:
  - reset when a new submit attempt starts
  - keep set once redirect has been initiated for current result

Pseudo sketch:

```tsx
// /videoforge/src/features/coverage/coverage-report-client.tsx
useEffect(() => {
  if (submitState.type !== 'done') return
  if (submitState.result.created <= 0) return
  if (hasRedirectedRef.current) return

  hasRedirectedRef.current = true
  window.location.href = `/dashboard/jobs?from=coverage&created=${...}&failed=${...}&skipped=${...}`
}, [submitState])
```

Recommended helper extraction:

```ts
// /videoforge/src/features/coverage/coverage-report-client.tsx
function shouldRedirectToJobsQueue(
  submitState: SubmitState
): submitState is { type: 'done'; result: CoverageSubmitResult } {
  return submitState.type === 'done' && submitState.result.created > 0
}
```

### Phase 2: Jobs queue flash context
- [x] Update jobs page to accept `searchParams` and parse coverage summary params:
  - `/videoforge/src/app/dashboard/jobs/page.tsx`
- [x] Render compact non-blocking success banner when `from=coverage` and counts are valid.
- [x] Keep existing jobs list behavior unchanged.

Recommended parser contract:

```ts
// /videoforge/src/app/dashboard/jobs/page.tsx
type CoverageFlash = { created: number; failed: number; skipped: number } | null
// parse non-negative integers, return null on invalid input
```

Banner behavior:
- Show only when all three counters are present and valid non-negative integers.
- Copy example: `Coverage submission complete: 3 created, 1 failed, 0 skipped.`
- Use `role="status"` + `aria-live="polite"` to match existing status messaging style.

### Phase 3: Regression tests
- [x] Add/extend tests for redirect decision logic with deterministic inputs.
- [x] Add jobs page test for coverage-origin success banner rendering with query params.
- [x] Keep existing submission unit tests and ensure no behavior regressions for failure-only cases.

Target test files:
- `/videoforge/tests/coverage-submission.test.ts` (if helper extraction is used)
- `/videoforge/tests/dashboard-jobs-page.test.tsx`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx` (if UI copy/assertions change)

Additional test scenarios to include:
- `created > 0` triggers redirect target containing all summary params.
- `created = 0, failed > 0` does not redirect.
- malformed queue flash params (non-numeric/negative/array) do not render banner.
- redirect guard prevents double navigation when component re-renders.

## Acceptance Criteria
- [x] Clicking `Translate Now` with at least one created job redirects users to `/dashboard/jobs`.
- [x] Redirect includes stable coverage summary context (`created`, `failed`, `skipped`).
- [x] Jobs page shows a visible success banner when opened from coverage redirect.
- [x] Validation failures and zero-created submissions do not redirect.
- [x] Existing queue list and job detail navigation remain unchanged.

## Success Metrics
- [x] Operators can reach queue view in one step after successful translate submission.
- [x] No manual `Queue` click is required to inspect submitted jobs.
- [x] No increase in submission error rate or duplicate-submit behavior.

## Dependencies & Risks
- Risk: redirect could hide inline summary too quickly.
  - Mitigation: show summary banner on jobs page via query params.
- Risk: repeated client renders trigger multiple redirects.
  - Mitigation: one-time redirect guard ref.
- Risk: invalid query params create noisy banner behavior.
  - Mitigation: strict numeric parsing and banner fallback to hidden.
- Risk: inconsistent navigation API usage across coverage components.
  - Mitigation: document and enforce one navigation approach in this feature’s implementation PR.

## Non-Goals
- Adding persistent “last submission” state to job storage.
- Changing job creation API contracts or workflow semantics.
- Introducing background polling or queue auto-refresh changes.

## Quality Gates
- [x] `pnpm typecheck`
- [x] `pnpm test tests/dashboard-jobs-page.test.tsx`
- [x] `pnpm test tests/coverage-submission.test.ts`
- [x] `pnpm test` (full suite)

## References & Research
- Coverage translate submit handler:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1548`
- Jobs API invocation in coverage:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1585`
- Coverage queue link:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1681`
- Current coverage success summary rendering:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1852`
- Submission result contract:
  - `/videoforge/src/features/coverage/submission.ts:53`
- Jobs alias route:
  - `/videoforge/src/app/jobs/page.tsx:3`
- Jobs page:
  - `/videoforge/src/app/dashboard/jobs/page.tsx:17`
- Existing tests:
  - `/videoforge/tests/coverage-submission.test.ts:68`
  - `/videoforge/tests/dashboard-jobs-page.test.tsx:17`
  - `/videoforge/tests/coverage-report-client-translation-bar.test.tsx:7`
- Related learnings:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
  - `/videoforge/docs/solutions/logic-errors/malformed-json-body-misclassified-as-500-jobs-api-20260215.md`
  - `/videoforge/docs/critical-patterns.md`
- Framework docs:
  - https://nextjs.org/docs/app/api-reference/functions/use-router
  - https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional
