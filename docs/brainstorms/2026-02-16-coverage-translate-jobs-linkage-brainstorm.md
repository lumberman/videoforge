---
date: 2026-02-16
topic: coverage-translate-jobs-linkage
---

# Coverage Translate Jobs Linkage

## What We're Building
Make the coverage-page `Translate Now` flow fully linked to the jobs experience, so users can immediately verify what was created and open those jobs without hunting through the queue manually.

Current behavior is partially linked:
- `Translate Now` does create jobs via `POST /api/jobs`.
- Coverage page has a `Queue` link to `/jobs`.
- Success feedback currently shows only counts, not direct links to created job IDs.

## Why This Approach
We should keep the current multi-select coverage workflow and auto-redirect users to `/jobs` after submit. This provides a stronger completion signal and moves users directly into the operational queue where they can inspect status and open job detail pages.

## Approach Options

### Option 1: Explicit success links, no redirect
After submit, keep users on the coverage page and show:
- `Open Queue` link
- `Open first created job` link
- Optional `View all created jobs` list

Pros:
- Lowest disruption to current flow
- Immediate visibility into created jobs
- Works for partial success (created/failed/skipped)

Cons:
- One extra click to open jobs

### Option 2 (Selected): Auto-redirect to queue on success
After submit, route to `/jobs` and carry a short success message.

Pros:
- Stronger completion signal
- Always lands users in operational queue

Cons:
- Interrupts coverage selection context
- Harder to review partial failures inline

### Option 3: Hybrid
Stay on page for partial failures, auto-redirect only when all selected jobs are created successfully.

Pros:
- Context-sensitive behavior
- Good for clean success runs

Cons:
- More logic and more edge cases

## Key Decisions
- Use existing `submitCoverageSelection` results as source of truth for created `jobId`s.
- Treat “fully linked” as both navigation to queue and direct access to created job detail(s).
- Keep implementation minimal and deterministic; no new infra.
- Default successful submit behavior to Option 2: auto-redirect to `/jobs`.

## Resolved Questions
- Successful submit behavior: Option 2 selected (auto-redirect to `/jobs`).

## Open Questions
- None.

## Next Steps
- Move to `/prompts:workflows-plan` for implementation details and acceptance tests.
