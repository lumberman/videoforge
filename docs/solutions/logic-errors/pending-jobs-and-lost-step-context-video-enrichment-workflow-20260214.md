---
module: Video Enrichment Workflow
date: 2026-02-14
problem_type: logic_error
component: service_object
symptoms:
  - "Jobs could remain in pending state when startup state updates failed before the workflow try/catch."
  - "Failed jobs lost currentStep context because status updates cleared it when no step argument was provided."
  - "Malformed JSON in the jobs store could be silently replaced with default data."
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [workflow, job-state, error-handling, data-integrity, codex-cloud]
---

# Troubleshooting: Pending Jobs and Lost Step Context in Workflow

## Problem
The job orchestration flow had state-management edge cases that could hide failures and reduce observability. Under specific startup and persistence failure conditions, jobs could remain in incorrect states or lose debugging context.

## Environment
- Module: Video Enrichment Workflow
- Affected Component: Workflow orchestration and JSON job persistence helpers
- Date: 2026-02-14

## Symptoms
- `POST /api/jobs` returned a job ID, but startup failures before the workflow `try/catch` could produce unhandled rejections and leave the job in `pending`.
- Job detail responses could show missing `currentStep` after terminal failure updates.
- Corrupt JSON in the job store could be treated as empty state and overwritten.

## What Didn't Work

**Direct solution:** The problems were identified during code review and fixed directly in one change set.

## Solution

The fixes were:
1. Move initial startup state updates inside the workflow `try/catch` so startup errors follow the same failure path.
2. Preserve existing `currentStep` when status updates omit an explicit step.
3. Return default JSON only for missing files (`ENOENT`), and throw parse/runtime errors for malformed store files.

**Code changes**:
```ts
// src/workflows/videoEnrichment.ts
try {
  await setJobStatus(jobId, 'running', 'download_video');
  await world.onJobStart(jobId);
  // ...
} catch {
  await setJobStatus(jobId, 'failed');
  await world.onJobComplete(jobId, 'failed');
}
```

```ts
// src/data/job-store.ts
currentStep: currentStep ?? job.currentStep,
```

```ts
// src/lib/json-store.ts
if ((error as { code?: string }).code === 'ENOENT') {
  return defaultValue;
}
throw error;
```

## Why This Works
The root cause was state-transition logic that assumed early setup and persistence reads were always successful. Wrapping startup state calls in the guarded workflow path ensures failures are recorded consistently. Preserving `currentStep` prevents loss of failure context in terminal updates. Restricting default fallbacks to `ENOENT` protects existing data by surfacing malformed JSON instead of silently resetting job state.

## Prevention
- Keep all workflow state transitions within a single error-handled path.
- Treat malformed persistence data as an explicit failure, not a recoverable default.
- Add route-level smoke tests that assert terminal job states and key response fields without depending on local server ports.
- Require tests for each feature/change and ensure they are runnable in Codex Cloud constraints.

## Related Issues
No related issues documented yet.
