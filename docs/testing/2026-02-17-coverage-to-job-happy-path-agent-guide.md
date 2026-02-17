# Coverage to Job Happy Path Test Guide (Agent Handoff)

This guide tells the next testing agent exactly how to validate the in-app happy path:

1. Select a translatable video in Coverage
2. Submit with `Translate Now`
3. Verify Jobs queue loads
4. Open job details
5. Verify progression toward completion

## Scope

- App flow only (UI + existing API routes)
- Local dev environment
- No code changes required for test execution

## Preconditions

- Dev server is running (default `http://127.0.0.1:3000`)
- Coverage page loads: `/videoforge/src/app/dashboard/coverage/page.tsx`
- Jobs queue route exists: `/videoforge/src/app/dashboard/jobs/page.tsx`
- Jobs canonical route is `/jobs` (implemented via app route alias)
- Job detail route exists: `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- Job detail canonical route is `/jobs/<jobId>` (implemented via app route alias)

## Known Caveat

- Some videos are intentionally unselectable because they have no mux mapping (`...is unavailable for translation`).
- In current env, `Conversation Starters` → `Perfect?` is unselectable, so do not use it as the happy-path selector unless mapping is fixed.

## Recommended Test Input

Use a currently selectable tile. In recent runs, `Mike FF Test 2` was selectable.

## Step-by-Step Happy Path

### 1) Open coverage and select language

- Navigate to: `http://127.0.0.1:3000/dashboard/coverage?languageId=529`
- Confirm page renders with collections and no fatal error banner.

### 2) Switch to Translate mode

- Click `Translate` mode toggle.
- Confirm translation action bar is visible and shows `Translate Now`.

### 3) Pick a selectable video

- In any collection, click a tile with `aria-label` starting `Select ...`.
- Avoid tiles with `aria-label` containing `is unavailable for translation`.
- Confirm action bar shows `1 video selected` (or higher).

### 4) Submit jobs

- Click `Translate Now`.
- Expected:
  - Redirect to `/jobs?from=coverage&created=...&failed=...&skipped=...`
  - Coverage flash card should render with created/failed/skipped counts.

### 5) Validate queue row

- On jobs table, confirm a newest row exists for the submitted mux asset.
- Click `Open` in that row.

### 6) Validate job detail

- URL should be `/jobs/<jobId>`.
- Confirm detail sections render:
  - Status and Current step
  - Step Execution table
  - Error Log and Artifacts sections
- Refresh until terminal state (`completed` or `failed`) is visible.

### 7) Verify completion semantics

- If `completed`: verify completed timestamp and final steps marked complete.
- If `failed`: verify deterministic error fields exist (step, code/message/hint).

## Pass/Fail Criteria

Pass when all are true:
- Coverage video can be selected.
- `Translate Now` submits without validation error.
- Jobs queue route loads (not 404).
- Job detail route opens.
- Job reaches terminal state with visible status evidence.

Fail on any of:
- 404 after submit redirect.
- No selected-count increase after clicking selectable tile.
- Validation error `Select at least one media item before submitting.` despite selected tile.
- Cannot open `/jobs/<jobId>`.

## Evidence Checklist for Test Report

Capture and include:
- Coverage URL used
- Selected video title
- Post-submit URL
- Queue flash values (`created`, `failed`, `skipped`)
- Opened job ID
- Final job status + currentStep
- If failed: first error code/message

## API Cross-check Commands

Use these only to confirm UI observations:

```bash
curl -s http://127.0.0.1:3000/api/jobs | jq '.[0:5] | map({id,status,currentStep,createdAt,muxAssetId})'
```

```bash
curl -s http://127.0.0.1:3000/api/jobs/<jobId> | jq '{id,status,currentStep,completedAt,retries,errors:(.errors|length)}'
```

## Related References

- Coverage submit URL builder: `/videoforge/src/features/coverage/submission.ts`
- Coverage submit interaction: `/videoforge/src/features/coverage/coverage-report-client.tsx`
- Jobs queue page: `/videoforge/src/app/dashboard/jobs/page.tsx`
- Job detail page: `/videoforge/src/app/dashboard/jobs/[id]/page.tsx`
- Jobs alias routes: `/videoforge/src/app/jobs/page.tsx`, `/videoforge/src/app/jobs/[id]/page.tsx`
- Queue flash tests: `/videoforge/tests/dashboard-jobs-page.test.tsx`
