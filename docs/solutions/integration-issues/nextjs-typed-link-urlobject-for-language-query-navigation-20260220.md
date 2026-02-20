---
module: Jobs + Coverage Navigation (Next.js Typed Routes)
date: 2026-02-20
problem_type: integration_issue
component: nextjs_link_typed_routes_navigation
symptoms:
  - "`pnpm typecheck` failed with `TS2322: Type 'string' is not assignable to type 'UrlObject | RouteImpl<string>'` on dynamic `next/link` href values."
  - "CI/typecheck became merge-blocking after introducing dynamic language-aware navigation links."
  - "Jobs and Coverage navigation depended on query propagation, but string interpolation violated typed-routes constraints."
root_cause: dynamic_string_href_used_with_typed_routes_contract
resolution_type: code_fix
severity: high
tags: [nextjs, typed-routes, link, urlobject, jobs, coverage, query-propagation]
---

# Troubleshooting: Next.js Typed `Link` Rejected Dynamic String Hrefs in Jobs/Coverage Navigation

## Problem
A recent navigation update introduced dynamic string `href` values for `next/link` so language context (`languageId`) could be preserved across:
- `/dashboard/coverage`
- `/jobs`
- `/jobs/[id]`

With typed routes enabled, those string hrefs failed compile-time checks and blocked merges.

## Environment
- Module: Jobs + Coverage Navigation
- Date solved: 2026-02-20
- Affected files:
  - `/videoforge/src/app/dashboard/jobs/page.tsx`
  - `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
  - `/videoforge/src/features/coverage/coverage-report-client.tsx`

## Symptoms
- `pnpm typecheck` failed with:
  - `TS2322: Type 'string' is not assignable to type 'UrlObject | RouteImpl<string>'`
- Failures appeared on typed `Link` callsites that used interpolated strings with query params.
- This became a P1 quality gate failure even though runtime behavior was otherwise correct.

## What Didn’t Work
- Keeping interpolated string URLs for dynamic query propagation.
  - Example pattern: `` `/jobs?languageId=${...}` ``
  - Why it failed: typed-routes expects `UrlObject` or typed route literals; dynamic strings do not satisfy the contract.
- Using string casts was considered but rejected.
  - Why: it weakens static guarantees and can hide future route regressions.

## Solution
Adopted typed `UrlObject` href construction for all dynamic query-driven links.

### 1) Jobs page: build typed Coverage link
```tsx
// /videoforge/src/app/dashboard/jobs/page.tsx
const coverageReportHref: UrlObject = {
  pathname: '/dashboard/coverage',
  query:
    requestedLanguageIds.length > 0
      ? { languageId: requestedLanguageIds.join(',') }
      : undefined
};

<Link href={coverageReportHref} aria-label="Go to coverage report">...</Link>
```

### 2) Job detail page: use typed hrefs for Report and Queue
```tsx
// /videoforge/src/app/dashboard/jobs/[id]/page.tsx
const sharedQuery =
  requestedLanguageIds.length > 0
    ? { languageId: requestedLanguageIds.join(',') }
    : undefined;

const coverageReportHref: UrlObject = { pathname: '/dashboard/coverage', query: sharedQuery };
const jobsQueueHref: UrlObject = { pathname: '/jobs', query: sharedQuery };
```

### 3) Coverage client: build typed Jobs link from selected languages
```tsx
// /videoforge/src/features/coverage/coverage-report-client.tsx
const jobsHref = useMemo<UrlObject>(() => {
  if (selectedLanguageIds.length === 0) {
    return { pathname: '/jobs' };
  }

  return {
    pathname: '/jobs',
    query: { languageId: selectedLanguageIds.join(',') }
  };
}, [selectedLanguageIds]);
```

## Why This Works
- `UrlObject` matches Next.js typed-routes expectations for dynamic navigation.
- Query context remains explicit and deterministic across navigation hops.
- Compile-time safety is preserved without type casts.

## Verification
- `pnpm typecheck`
- `pnpm tsx --test tests/dashboard-jobs-page.test.tsx tests/dashboard-job-detail-page.test.tsx tests/coverage-report-client-translation-bar.test.tsx`

All passed after the change.

## Prevention
- For dynamic `Link` destinations with query params, prefer `{ pathname, query }` over interpolated strings.
- Treat typecheck failures in navigation code as release blockers.
- Keep regression tests on query propagation for:
  - Coverage -> Jobs
  - Jobs -> Report
  - Jobs list -> Job detail -> Report/Queue

## Related Files
- `/videoforge/src/app/dashboard/jobs/page.tsx`
- `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- `/videoforge/src/features/coverage/coverage-report-client.tsx`
- `/videoforge/tests/dashboard-jobs-page.test.tsx`
- `/videoforge/tests/dashboard-job-detail-page.test.tsx`
- `/videoforge/tests/coverage-report-client-translation-bar.test.tsx`

## Related Issues
- `/videoforge/docs/solutions/ui-bugs/coverage-language-context-loss-on-jobs-report-navigation-20260219.md`
- `/videoforge/todos/020-complete-p1-fix-typed-link-href-in-jobs-and-coverage-navigation.md`
