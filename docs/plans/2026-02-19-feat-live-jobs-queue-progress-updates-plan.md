---
title: "feat: Live-update jobs queue and progress without manual refresh"
type: feat
status: completed
date: 2026-02-19
---

# feat: Live-update jobs queue and progress without manual refresh

## Enhancement Summary

**Deepened on:** 2026-02-19  
**Sections enhanced:** 12  
**Skill/research lenses applied:** `repo-research-analyst`, `learnings-researcher`, `spec-flow-analyzer`, `performance-oracle`, `security-sentinel`, `julik-frontend-races-reviewer`, `kieran-typescript-reviewer`, plus official Next.js/React/MDN docs.

### Key Improvements
1. Replaced interval-only concept with a safer polling contract (non-overlapping loop, abort + stale-response guards).
2. Added explicit architecture split between server shell and client live table to keep behavior deterministic and testable.
3. Expanded test strategy to match this repo’s `tsx --test` setup (pure-function tests + controlled async polling logic tests).
4. Added visibility-aware cadence recommendations and request-budget constraints to reduce unnecessary load.
5. Added clear fallback/error behavior so transient API failures never wipe the queue UI.

### New Considerations Discovered
- `router.refresh()` is route-level and can re-fetch too broadly; direct `/api/jobs` polling is simpler and lower-risk for table-only updates in this case.
- `setInterval` can overlap network calls; a recursive `setTimeout` loop is safer when requests may exceed interval duration.
- React Effect cleanup must explicitly prevent stale async responses from mutating state after unmount/remount.

## Section Manifest
- Section 1: Problem and operator impact — refine measurable goals for queue monitoring UX.
- Section 2: Data freshness architecture — define server shell + client live-update boundary.
- Section 3: Polling strategy — determine cadence, cancellation, overlap prevention, and stale-response handling.
- Section 4: Rendering strategy — preserve existing table semantics while enabling incremental updates.
- Section 5: Error resilience — keep last known-good state and surface non-blocking poll degradation.
- Section 6: Testability — add deterministic tests for polling and presenter behavior under this repo’s test stack.
- Section 7: Risk and performance — set request budgets, race-condition controls, and non-goals.

## Overview
The jobs queue currently requires manual page reload to reflect new jobs and step progression. This plan adds deterministic live updates on `/jobs` so rows and progress indicators update automatically.

### Research Insights

**Best Practices:**
- Keep server-rendered initial content for fast first paint and SEO-safe baseline, then layer client polling for freshness.
- Keep route/API contracts unchanged and move refresh behavior into a narrowly-scoped client component.

**Implementation Detail:**
- Hydrate a client `LiveJobsTable` with initial `JobRecord[]`, then update via `GET /api/jobs` using `cache: 'no-store'`.

**References:**
- [Next.js App Router `useRouter`](https://nextjs.org/docs/app/api-reference/functions/use-router)
- [React `useEffect` reference](https://react.dev/reference/react/useEffect)

## Found Brainstorm Context
Found brainstorm from 2026-02-16: `coverage-translate-jobs-linkage`. Using as context for planning.

Relevant carry-forward decisions:
- Keep queue behavior simple and deterministic.
- Avoid introducing new infrastructure.
- Continue using existing jobs API as source of truth.

Reference:
- `/videoforge/docs/brainstorms/2026-02-16-coverage-translate-jobs-linkage-brainstorm.md`

## Local Research Summary

### Repo patterns (implementation context)
- Jobs list page is server-rendered and only updates on navigation/reload:
  - `/videoforge/src/app/dashboard/jobs/page.tsx:277`
- Manual refresh is currently explicit UI:
  - `/videoforge/src/app/dashboard/jobs/page.tsx:365`
- Progress rendering is already implemented in-table (dot track + summary text):
  - `/videoforge/src/app/dashboard/jobs/page.tsx:221`
  - `/videoforge/src/app/dashboard/jobs/page.tsx:428`
- Jobs API already exposes all row/progress data needed for live updates:
  - `/videoforge/src/app/api/jobs/route.ts:112`
- Existing codebase precedent for client polling loop + cleanup:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx:1683`
- Existing codebase precedent for fetch cancellation + stale update guards:
  - `/videoforge/src/features/coverage/LanguageGeoSelector.tsx:170`
  - `/videoforge/src/features/coverage/LanguageGeoSelector.tsx:221`

### Institutional learnings (docs/solutions)
- Keep workflow status visibility explicit and avoid stale/hidden state in job UI:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- Operator workflows should provide immediate in-context status feedback:
  - `/videoforge/docs/solutions/ui-bugs/coverage-translate-submit-feedback-and-error-toast-20260216.md`
- Preserve deterministic behavior and add regression tests when changing runtime behavior:
  - `/videoforge/docs/critical-patterns.md`

### Skill-Matched Analysis (Deepening Pass)
- `repo-research-analyst`: confirmed queue status rendering and refresh-link dependency are centralized in `/dashboard/jobs/page.tsx`.
- `learnings-researcher`: reinforced requirement to avoid silent stale states and to test failure branches deterministically.
- `spec-flow-analyzer`: highlighted non-happy paths (API failure, slow network, overlapping polls, tab hidden).
- `performance-oracle`: flagged overlap risk and recommended non-overlapping polling loop + conservative cadence.
- `julik-frontend-races-reviewer`: emphasized cleanup discipline and race protection for async polling effects.
- `kieran-typescript-reviewer`: favored extracting pure presenter and polling helpers for type-safe, testable logic.
- `security-sentinel`: no new auth/secrets risk introduced; continue avoiding dynamic code paths and untrusted URL construction.

## External Documentation Research (Targeted)
The original quick plan skipped broad external research. In this deepening pass, targeted official docs were added for implementation precision.

- Next.js `useRouter` and `router.refresh` behavior:
  - [https://nextjs.org/docs/app/api-reference/functions/use-router](https://nextjs.org/docs/app/api-reference/functions/use-router)
- React effects, cleanup, and stale async response handling:
  - [https://react.dev/learn/synchronizing-with-effects](https://react.dev/learn/synchronizing-with-effects)
  - [https://react.dev/reference/react/useEffect](https://react.dev/reference/react/useEffect)
- MDN timer and cancellation guidance:
  - [https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval](https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval)
  - [https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

## Research Decision
Proceeding with implementation using local patterns plus targeted official documentation.

Rationale:
- This remains a UI/runtime behavior enhancement using existing app patterns.
- No new provider API, auth, payment, or security-sensitive external integration.
- Targeted docs materially improve polling correctness (cleanup, overlap prevention, cache behavior).

## Problem Statement / Motivation
Operators currently need to click `Refresh` on `/jobs` to see:
- newly queued jobs
- status changes (`pending` -> `running` -> terminal)
- step progression dots and summary text

This adds friction to a queue-monitoring workflow and delays visibility into failures/completions.

### Research Insights

**Best Practices:**
- Monitoring screens should default to passive freshness and avoid requiring repeated manual user action.
- Failure visibility should degrade gracefully: stale-but-visible data is better than empty/blank state on transient errors.

**Measurable UX Target:**
- Status changes should be visible on `/jobs` within a single polling window under normal API availability.

## Proposed Solution
Add a client-side live-updating jobs table component that:
1. renders immediately from server-provided initial jobs
2. polls `GET /api/jobs` on a fixed interval
3. updates rows and progression in place without full-page reload

Selected approach:
- Use polling with `fetch('/api/jobs', { cache: 'no-store' })`
- Do not add websockets/SSE/background workers
- Keep `listJobs` and API contracts unchanged

### Research Insights

**Why direct API polling (not `router.refresh`)**
- `router.refresh()` re-fetches the current route’s server payload; this is broader than needed for table-only freshness.
- Direct polling of `/api/jobs` isolates updates to the queue dataset and avoids unnecessary page-level rerender churn.

**Polling mechanism refinement**
- Prefer non-overlapping self-scheduled polling (`setTimeout` loop) over fixed `setInterval` when network latency can exceed interval.
- Use abortable fetches and cleanup guards to avoid stale writes on unmount.

## Technical Approach

### Scope
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- New client table component under `/videoforge/src/features/jobs/`
- Optional extraction of pure presentation helpers from page to shared module
- Tests in `/videoforge/tests/`

### Architecture

#### Server shell responsibilities
- Keep `/dashboard/jobs/page.tsx` as `force-dynamic` server entry.
- Load initial jobs snapshot with `listJobs()` for first render.
- Load language label mapping once per request and pass to client component.

#### Client live table responsibilities
- Own polling lifecycle and mutable jobs state.
- Render same visual rows/progress semantics as current table.
- Avoid clearing data on poll failures.

### Data Contract
- Input type for live table: `initialJobs: JobRecord[]`.
- Poll payload contract: unchanged `GET /api/jobs` response.
- Display contract: preserve existing grouping/sorting/progress summary behavior.

### Polling Contract (Deepened)
- Start one immediate fetch on mount.
- Use recursive `setTimeout` to schedule next fetch only after current fetch settles.
- Default cadence:
  - foreground tab: `5000ms`
  - hidden tab (optional optimization): `30000ms`
- On unmount:
  - abort in-flight request via `AbortController`
  - cancel pending timeout
- Guard against stale updates:
  - request sequence id OR `ignore` flag pattern before calling `setState`

Recommended helper extraction:
- `/videoforge/src/features/jobs/live-jobs-polling.ts`

Example sketch:

```ts
// /videoforge/src/features/jobs/live-jobs-polling.ts
export function getNextPollDelayMs(isDocumentHidden: boolean): number {
  return isDocumentHidden ? 30_000 : 5_000;
}
```

```tsx
// /videoforge/src/features/jobs/live-jobs-table.tsx
useEffect(() => {
  let cancelled = false;
  let timeoutId: number | null = null;
  let requestSeq = 0;
  let activeController: AbortController | null = null;

  const schedule = () => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    timeoutId = window.setTimeout(run, getNextPollDelayMs(hidden));
  };

  const run = async () => {
    const seq = ++requestSeq;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;

    try {
      const response = await fetch('/api/jobs', {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return;
      const payload = (await response.json()) as JobRecord[];
      if (!cancelled && seq === requestSeq) {
        setJobs(payload);
      }
    } finally {
      if (!cancelled) schedule();
    }
  };

  void run();

  return () => {
    cancelled = true;
    activeController?.abort();
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}, []);
```

### Rendering Contract
- Keep existing table columns and badge/step-dot semantics unchanged.
- Keep error-row behavior unchanged for failed jobs.
- Maintain stable keys by `job.id` and `step.name`.
- Optionally skip `setJobs` if payload is identical by lightweight signature to reduce rerenders.

### UX Contract
- Replace current `Refresh` dependency with passive indicator copy (for example: `Auto-updating every 5s`).
- Optional fallback action: `Refresh now` button can still trigger an immediate fetch.
- If polls fail, preserve last data and show subtle non-blocking status (`Last updated`, `Reconnecting...`).

### Security & Reliability Notes
- Keep polling URL hardcoded to internal `/api/jobs`; do not derive from user input.
- Do not execute string-based timers.
- Keep failure handling non-throwing in UI to avoid full-page disruption.

### Implementation phases

#### Phase 1: Extract deterministic jobs table presentation
- [x] Move table/grouping/formatting helpers into pure functions module.
- [x] Keep output structure unchanged (same columns, step-dot states, error row behavior).
- [x] Keep language badge logic deterministic and re-usable by server + client rendering paths.

Target files:
- `/videoforge/src/features/jobs/jobs-table-presenter.ts`
- `/videoforge/src/app/dashboard/jobs/page.tsx`

#### Phase 2: Add live polling client component
- [x] Create a `LiveJobsTable` client component with `initialJobs`, `languageLabelsById`, and internal jobs state.
- [x] Implement non-overlapping polling loop using `setTimeout`, not fixed-overlap interval behavior.
- [x] Add cancellation and stale-response guard (`AbortController` + sequence/ignore guard).
- [x] Keep stale data visible when poll fails.
- [x] Replace static table rendering on page with `LiveJobsTable`.

Target files:
- `/videoforge/src/features/jobs/live-jobs-table.tsx`
- `/videoforge/src/features/jobs/live-jobs-polling.ts`
- `/videoforge/src/app/dashboard/jobs/page.tsx`

#### Phase 3: UX update for refresh affordance
- [x] Replace hard dependency on manual refresh button with passive auto-update copy.
- [x] Optionally keep a manual `Refresh now` trigger for immediate poll.
- [x] Ensure status messaging remains accessible (`role="status"`, `aria-live="polite"` where appropriate).

Target files:
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/app/globals.css` (only if styling updates are needed)

#### Phase 4: Regression test coverage
- [x] Add unit tests for presenter helpers:
  - day grouping
  - progress summary
  - language badge normalization
- [x] Add polling helper tests:
  - delay selection (visible vs hidden)
  - stale response guard behavior
  - no-state-reset on non-OK/error fetch paths
- [x] Add live table behavior tests that mock `globalThis.fetch` deterministically.
- [x] Preserve existing jobs page tests and update only where copy changes.

Target files:
- `/videoforge/tests/jobs-table-presenter.test.ts`
- `/videoforge/tests/live-jobs-polling.test.ts`
- `/videoforge/tests/live-jobs-table.test.tsx`
- `/videoforge/tests/dashboard-jobs-page.test.tsx`

## SpecFlow Analysis

### Primary user flow
1. User opens `/jobs`.
2. Server shell renders existing jobs immediately.
3. Client live table starts polling loop.
4. Workflow updates job status/steps in backend.
5. Next successful poll updates rows and progress indicators.
6. User opens a job detail page without needing a manual list refresh.

### Flow permutations matrix

| Context | Expected behavior |
| --- | --- |
| No jobs exist | Empty state persists; polling continues in background. |
| New job queued elsewhere | New row appears on next successful poll. |
| Running -> completed | Progress dots and summary text update on next successful poll. |
| Poll error (single) | Existing rows remain; optional stale indicator shown. |
| Poll errors (repeated) | UI remains usable with last known data; retries continue. |
| Tab hidden for long period | Cadence may slow (optional); freshness restored when visible. |
| Component unmount/remount | Prior polling work is cleaned up; no stale setState warnings. |

### Edge cases
- No jobs exist: empty state remains stable between polls.
- New job arrives between polls: row appears on next interval.
- Running job completes: dot track and summary update on next interval.
- Poll failure/network hiccup: existing table remains visible (no destructive reset).
- Slow response + rapid re-scheduling: stale response is ignored.
- Strict Mode remount behavior: cleanup must prevent duplicate active poll loops.

### Specification gaps resolved by this plan
- Defines update trigger contract (non-overlapping client polling loop).
- Defines failure behavior (retain last good state and continue retry cadence).
- Defines stale-response handling (ordered response guard + abort on unmount).

## Alternative Approaches Considered

### Option A: `router.refresh()` timer loop
Pros:
- Reuses server rendering path only.

Cons:
- Broader rerender scope than needed.
- Harder to isolate polling correctness and race behavior.

Decision: Not selected.

### Option B: SSE/WebSocket push
Pros:
- Near-real-time updates.

Cons:
- Adds infrastructure/runtime complexity not requested.
- Violates current simplicity constraints for this feature scope.

Decision: Not selected.

### Option C (Selected): Direct `/api/jobs` client polling with deterministic guards
Pros:
- Minimal change footprint.
- Uses existing contracts and patterns.
- Deterministic and testable in current CI constraints.

## Acceptance Criteria
- [x] `/jobs` updates queue rows and progression automatically without user clicking `Refresh`.
- [x] Running job status/progress text changes become visible within the polling interval (target: <= 5s foreground).
- [x] Newly created jobs appear on `/jobs` within the polling interval.
- [x] Transient polling errors do not clear existing visible queue state.
- [x] Polling effect cleanup prevents duplicate active loops and stale post-unmount state writes.
- [x] No new infrastructure/services/queues are introduced.
- [x] Existing tests continue to pass, and new tests for live update logic are added.

## Success Metrics
- [ ] Operators can monitor queue progression hands-free on `/jobs`.
- [ ] Manual refresh usage drops to near-zero for normal queue monitoring.
- [x] No regression in deterministic job status rendering.
- [ ] Poll request volume stays within expected budget for active queue sessions.

## Dependencies & Risks
- Risk: too-frequent polling increases request volume.
  - Mitigation: start with 5s foreground cadence and optional 30s hidden-tab cadence.
- Risk: overlapping requests cause stale/incorrect UI state.
  - Mitigation: non-overlapping loop + sequence guard + abort cleanup.
- Risk: duplicated table logic between server/client increases maintenance burden.
  - Mitigation: extract pure presenter helpers and reuse.
- Risk: language labels for newly added IDs not in initial map.
  - Mitigation: keep existing fallback badge normalization to raw abbreviation/ID.
- Risk: subtle regressions in grouped rendering.
  - Mitigation: presenter-focused tests with representative fixture jobs across multiple dates/statuses.

## Non-Goals
- WebSocket or Server-Sent Events infrastructure.
- Changes to job persistence model or workflow orchestration.
- Background daemons, external queues, or new data stores.
- Reworking `/jobs/[id]` detail page auto-refresh in this change (separate follow-up if needed).

## Quality Gates
- [x] `pnpm typecheck`
- [x] `pnpm test tests/jobs-table-presenter.test.ts`
- [x] `pnpm test tests/live-jobs-polling.test.ts`
- [x] `pnpm test tests/live-jobs-table.test.tsx`
- [x] `pnpm test tests/dashboard-jobs-page.test.tsx`
- [x] `pnpm test`

## AI-Era Considerations
- Keep polling contract and renderer behavior explicit to avoid accidental non-deterministic logic from future AI-assisted edits.
- Prefer pure function extraction for grouping/progress/polling utilities so generated diffs stay small and reviewable.
- Keep UX copy and cadence values centralized as constants for easier human review/tuning.

## References & Research
### Internal references
- `/videoforge/src/app/dashboard/jobs/page.tsx:277`
- `/videoforge/src/app/dashboard/jobs/page.tsx:365`
- `/videoforge/src/app/dashboard/jobs/page.tsx:428`
- `/videoforge/src/app/api/jobs/route.ts:112`
- `/videoforge/src/features/coverage/coverage-report-client.tsx:1683`
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx:170`
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx:221`
- `/videoforge/tests/dashboard-jobs-page.test.tsx:6`
- `/videoforge/docs/critical-patterns.md`
- `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- `/videoforge/docs/solutions/ui-bugs/coverage-translate-submit-feedback-and-error-toast-20260216.md`

### External references
- [Next.js `useRouter` API](https://nextjs.org/docs/app/api-reference/functions/use-router)
- [React: Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- [React: `useEffect` reference](https://react.dev/reference/react/useEffect)
- [MDN: `Window.setInterval()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval)
- [MDN: `AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
