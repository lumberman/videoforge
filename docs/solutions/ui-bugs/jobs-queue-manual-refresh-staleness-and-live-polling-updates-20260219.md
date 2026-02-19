---
module: Jobs Queue
date: 2026-02-19
problem_type: ui_bug
component: dashboard_jobs_page_and_live_jobs_table
symptoms:
  - "The jobs table on `/jobs` only reflected new jobs and step progress after clicking Refresh or reloading."
  - "Operators could not passively monitor running jobs in real time from the queue page."
  - "Queue status visibility lagged behind workflow state changes despite fresh data being available from `GET /api/jobs`."
root_cause: server_rendered_jobs_table_with_manual_refresh_only
resolution_type: code_fix
severity: medium
tags: [jobs, queue, live-updates, polling, nextjs, react]
---

# Troubleshooting: Jobs Queue Staleness Until Manual Refresh

## Problem
The queue UI at `/jobs` rendered from server data once and then stayed static until manual navigation. As a result, users had to click `Refresh` repeatedly to see job progression.

## Environment
- Module: Jobs Queue
- Route: `/jobs` (alias of `/dashboard/jobs`)
- Date solved: 2026-02-19
- Affected components:
  - `/videoforge/src/app/dashboard/jobs/page.tsx`
  - `/videoforge/src/app/globals.css`

## Symptoms
- Job rows did not update automatically when new jobs were created by other flows.
- Progress dots/summary text remained stale while workflows advanced in background.
- Operators relied on manual `Refresh` clicks to observe current queue state.

## What Didn't Work
- Server-only rendering for the jobs table (fresh on request, stale during session).
- Manual refresh affordance as the primary freshness mechanism.

These approaches were deterministic but did not meet operator UX needs for live queue monitoring.

## Solution
Implemented a client-side live update layer over the existing server shell, without changing API contracts or adding infrastructure.

### 1) Keep server shell, move table rendering into a live client component
- `/videoforge/src/app/dashboard/jobs/page.tsx` now loads initial jobs + language labels server-side and renders a client `LiveJobsTable`.

### 2) Add deterministic polling with race/cancellation guards
- New polling logic in `/videoforge/src/features/jobs/live-jobs-table.tsx`:
  - immediate fetch on mount
  - non-overlapping reschedule loop via `setTimeout`
  - `AbortController` cleanup on unmount/new request
  - stale-response gate via request sequence checks
  - keep last known-good table when a poll fails

```tsx
// /videoforge/src/features/jobs/live-jobs-table.tsx
const responseSeq = ++requestSeqRef.current;
activeControllerRef.current?.abort();
const controller = new AbortController();

const response = await fetch('/api/jobs', {
  cache: 'no-store',
  signal: controller.signal
});

if (shouldApplyPollResult({ ... })) {
  setJobs(payload);
}
```

### 3) Extract table presentation logic into pure helpers
- New module: `/videoforge/src/features/jobs/jobs-table-presenter.ts`
- Extracted grouping, badge mapping, progress summary, and step-dot symbol helpers for deterministic rendering and focused unit tests.

### 4) Replace refresh dependency with live status messaging + fallback action
- Queue header now shows auto-update status text and a non-required `Refresh now` button.
- Added styling for disabled refresh state and status text:
  - `/videoforge/src/app/globals.css`

### 5) Add regression coverage for presenter + polling behavior
- Added tests:
  - `/videoforge/tests/jobs-table-presenter.test.ts`
  - `/videoforge/tests/live-jobs-polling.test.ts`
  - `/videoforge/tests/live-jobs-table.test.tsx`

## Why This Works
- Preserves existing `GET /api/jobs` contract and UI semantics.
- Adds continuous freshness without requiring full-page reload.
- Prevents common async UI bugs (overlapping requests, stale state writes after unmount).
- Keeps behavior deterministic and testable in Codex Cloud constraints.

## Prevention
- For operator monitoring views, avoid one-shot server render as the only data-refresh mechanism.
- Use explicit polling contracts for mutable queue-style surfaces:
  - non-overlapping scheduling
  - cancellation on unmount
  - stale-response guards
  - non-destructive error handling (retain prior state)
- Extract presentation logic into pure modules before introducing client refresh behavior.

## Verification
Commands run:
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

Observed result:
- Typecheck passed.
- Test suite passed (101/101).
- Lint passed with warnings only (no blocking errors).

## Related Files
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/features/jobs/live-jobs-table.tsx`
- `/videoforge/src/features/jobs/live-jobs-polling.ts`
- `/videoforge/src/features/jobs/jobs-table-presenter.ts`
- `/videoforge/src/app/globals.css`
- `/videoforge/tests/jobs-table-presenter.test.ts`
- `/videoforge/tests/live-jobs-polling.test.ts`
- `/videoforge/tests/live-jobs-table.test.tsx`

## Related Issues
- Queue/job-state observability hardening:
  - `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- Coverage submit feedback + queue UX linkage:
  - `/videoforge/docs/solutions/ui-bugs/coverage-translate-submit-feedback-and-error-toast-20260216.md`
