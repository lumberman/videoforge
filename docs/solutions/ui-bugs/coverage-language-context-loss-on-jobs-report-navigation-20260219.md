---
module: Coverage Report + Jobs Navigation
date: 2026-02-19
problem_type: ui_bug
component: coverage_client_jobs_navigation_context
symptoms:
  - "Selected coverage language was reset to the default (for example, Auhelawa) after navigating `/dashboard/coverage` -> `/jobs` -> `/dashboard/coverage`."
  - "Navigation from Jobs back to Report felt slow because the Report page performed an extra client redirect to restore language context."
  - "Language context was preserved in some links but dropped in others (notably Jobs list rows and Job detail links)."
root_cause: language_query_context_not_propagated_consistently_across_jobs_routes
resolution_type: code_fix
severity: medium
tags: [coverage, jobs, navigation, language-selection, query-propagation, session-restore, ui]
---

# Troubleshooting: Coverage Language Context Loss Across Jobs/Report Navigation

## Problem
Coverage language selection was not stable across Report/Queue navigation. Operators selected a language on `/dashboard/coverage`, moved through `/jobs` or `/jobs/:id`, then returned to Report and saw fallback/default language selection instead of their prior choice.

This produced two UX failures:
- user-visible state loss (selected language reset)
- slower navigation due to a corrective redirect after Report mounted

## Environment
- Module: Coverage Report + Jobs Navigation
- Date solved: 2026-02-19
- Affected routes:
  - `/dashboard/coverage`
  - `/jobs` (alias of `/dashboard/jobs`)
  - `/jobs/[id]` (alias of `/dashboard/jobs/[id]`)
- Affected files:
  - `/videoforge/src/features/coverage/coverage-report-client.tsx`
  - `/videoforge/src/app/dashboard/jobs/page.tsx`
  - `/videoforge/src/features/jobs/live-jobs-table.tsx`
  - `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`

## Symptoms
- Returning from Jobs to Report showed default language instead of prior selection.
- Jobs-to-Report click sometimes required a second navigation hop (visible latency).
- Query params contained language context on some pages but were missing after row/detail navigation.

## What Didn’t Work
- Preserving language only on top-level Coverage -> Queue link.
  - Failed because language context was later dropped by Jobs row navigation and Job detail header links.
- Restoring language only with a client-side session fallback.
  - Worked as a safety net, but still introduced an extra redirect when URLs were missing `languageId`.

## Solution
Implemented end-to-end language context propagation and kept session restore as fallback only.

### 1) Propagate selected language from Coverage to Jobs
Coverage header Queue link now carries selected language IDs:

```tsx
// /videoforge/src/features/coverage/coverage-report-client.tsx
const jobsHref = useMemo(() => {
  if (selectedLanguageIds.length === 0) return '/jobs';
  const params = new URLSearchParams();
  params.set('languageId', selectedLanguageIds.join(','));
  return `/jobs?${params.toString()}`;
}, [selectedLanguageIds]);
```

### 2) Preserve language query in Jobs page links back to Report
Jobs page parses `languageId/languageIds` and uses it in Report links (logo + tab):

- `/videoforge/src/app/dashboard/jobs/page.tsx`

### 3) Preserve language query through Jobs list -> Job detail links
Jobs list row click and `Open` bubble link now append the same `languageId` query:

- `/videoforge/src/features/jobs/live-jobs-table.tsx`

This closed the major query-drop path.

### 4) Preserve language query throughout Job detail navigation
Job detail now parses `searchParams` and keeps `languageId` for:
- logo -> Report
- Report tab
- Queue tab
- Back to jobs

- `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`

### 5) Keep fallback restore on Coverage for robustness
Coverage retains a guarded session-restore helper when URL has no language query:

```ts
// /videoforge/src/features/coverage/coverage-report-client.tsx
buildCoverageUrlWithStoredLanguageSelection({
  currentHref,
  storedLanguageIds,
  availableLanguageIds
});
```

This only runs if language query is absent and stored IDs are valid for current options.

## Why This Works
- Primary path is now explicit URL state propagation, not implicit session state.
- All major transitions preserve `languageId`, including deep links and row-based navigation.
- Fallback restore remains deterministic and safe, but is no longer part of the normal path.
- Result: no reset to default language and fewer extra client redirects.

## Verification
Targeted tests run and passing:
- `pnpm exec tsx --test tests/dashboard-jobs-page.test.tsx`
- `pnpm exec tsx --test tests/dashboard-job-detail-page.test.tsx`
- `pnpm exec tsx --test tests/coverage-report-client-translation-bar.test.tsx`

Added/updated regression coverage:
- `/videoforge/tests/dashboard-jobs-page.test.tsx`
  - preserves selected language IDs in Report links
- `/videoforge/tests/dashboard-job-detail-page.test.tsx`
  - preserves selected language IDs in Report + Queue links
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`
  - restore helper behavior when query is missing/present/invalid

## Prevention
- Treat language selection as route state and propagate it through all navigation entry points.
- For route aliases (`/jobs`, `/dashboard/jobs`, detail routes), enforce shared query-propagation rules.
- Keep fallback restore logic pure and tested, but avoid relying on it for primary UX flow.
- Add tests for every navigation hop where context loss can occur:
  - list -> detail
  - detail -> list
  - jobs -> coverage
  - coverage -> jobs

## Additional Learnings from This Conversation
- Visual parity changes should reuse existing UI patterns instead of inventing new ones (for example, tooltip styling matched to existing Jobs `Open` bubble).
- CSS positioning bugs often come from wrong positioning context (tooltip anchored to divider instead of card).
- Mobile diagram-width bugs were caused by breakpoint caps (`max-width`) and non-stretch wrappers; fixing both container and child alignment is required.
- Badge rendering should prefer canonical language IDs over generated abbreviations to avoid labels like `ROM` and missing flags.

## Related Files
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/features/jobs/live-jobs-table.tsx`
- `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- `/videoforge/tests/dashboard-jobs-page.test.tsx`
- `/videoforge/tests/dashboard-job-detail-page.test.tsx`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`

## Related Issues
- `/videoforge/docs/solutions/ui-bugs/jobs-queue-manual-refresh-staleness-and-live-polling-updates-20260219.md`
- `/videoforge/docs/solutions/ui-bugs/coverage-translate-submit-feedback-and-error-toast-20260216.md`
- `/videoforge/docs/solutions/integration-issues/mux-ai-api-shape-mismatch-and-language-id-resolution-20260217.md`
