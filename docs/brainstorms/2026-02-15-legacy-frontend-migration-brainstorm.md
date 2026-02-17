---
date: 2026-02-15
topic: legacy-reporting-orderflow-migration
---

# Legacy Reporting + Order Flow Migration

## What We're Building
Migrate the legacy frontend capabilities from `/videoforge/old-app-code/ai-media` into the current app by adding:
- coverage reporting visualization
- language/content selection workflow
- order flow that creates enrichment jobs

The current app remains the source of truth for workflow execution, job state, APIs, and engineering rules. Migration is additive only: no regression to existing routes (`/dashboard/jobs`, `/api/jobs`, `/api/jobs/:id`) and no new infrastructure.

## Why This Approach
Recommended approach: **strangler-style feature migration** into a new bounded feature module under current app architecture.

Alternatives considered:
- Big-bang copy of old app routes/CSS/components: fastest initial copy, highest regression risk.
- Rebuild from scratch from requirements: cleanest long-term, slower and risks missing behavior parity.

Chosen approach balances speed and safety by reusing proven UI logic while adapting contracts to current services and APIs.

## Key Decisions
- **Route isolation first**: add migrated UI under a new route (for example `/dashboard/coverage`) so existing jobs screens stay stable.
- **No global CSS copy**: port legacy styles into scoped CSS modules (or strict namespace class root) to avoid collisions with `/videoforge/src/app/globals.css`.
- **Gateway-first external data source**: language slugs and media API data are always fetched from external gateway (`CORE_API_ENDPOINT` fallback to `NEXT_STAGE_GATEWAY_URL`), replacing monorepo-internal imports like `@core/prisma/.../languageSlugs`.
- **Adapter boundary for legacy data**: keep gateway GraphQL/language-fetch logic behind service adapters and route handlers, not directly in UI components.
- **Preserve current job API contract**: keep `POST /api/jobs` unchanged; batch ordering will call existing endpoint repeatedly (or via thin wrapper route if needed later).
- **Selection drives job payload**: `muxAssetId` must be derived from selected media items in coverage report and passed into job creation payload.
- **Multi-select submit behavior**: create one enrichment job immediately per selected media item.
- **Principles precedence**: ignore old Nx/Jest/workflow conventions; only current app principles and contracts apply.

## Migration Plan
1. Baseline and freeze behavior
- Capture current passing tests (`tests/api-jobs-contract.test.ts`, smoke, dashboard tests).
- Add migration acceptance checklist for “no regressions” before feature work.

2. Extract and stage legacy UI as isolated feature
- Create `src/features/coverage/*` for migrated components from:
  - `/videoforge/old-app-code/ai-media/src/app/CoverageReportClient.tsx`
  - `/videoforge/old-app-code/ai-media/src/app/LanguageGeoSelector.tsx`
  - `/videoforge/old-app-code/ai-media/src/app/CoverageBar.tsx`
- Replace icon dependency usage only if needed; avoid dependency churn unless justified.

3. Migrate data layer via adapters
- Port collection/language fetching from `/videoforge/old-app-code/ai-media/src/app/page.tsx` and `/videoforge/old-app-code/ai-media/src/app/api/languages/route.ts` into current adapter style.
- Add optional env accessors for `CORE_API_ENDPOINT`, `NEXT_STAGE_GATEWAY_URL`, and watch URL configuration in `/videoforge/src/config/env.ts`, with deterministic precedence.
- Move static language population data into current repo-owned location and reference deterministically.

4. Integrate order flow with current workflow engine
- Replace legacy `console.info` translate action with actual job creation against `/api/jobs`.
- Build deterministic selection-to-job mapping where selected media must expose/resolve `muxAssetId` before submit, with explicit validation states.
- On submit, issue one job creation request per selected media item and return a success/error summary for the batch.
- Keep failures visible in UI without partial silent success.

5. Verify and clean up
- Add tests for migrated UI logic + order submission behavior.
- Re-run existing API/dashboard regression tests.
- After parity verification, delete `/videoforge/old-app-code`.

## Conflict Map and Mitigation
- Legacy dependency conflict: `@core/prisma/.../languageSlugs` is unavailable.
  - Mitigation: resolve all language labels/slugs via gateway adapters (`CORE_API_ENDPOINT` or `NEXT_STAGE_GATEWAY_URL`) and remove monorepo dependency assumptions.
- Styling conflict: legacy `globals.css` redefines `body/main/code` and many shared selectors.
  - Mitigation: scoped styles only; no direct merge into app global stylesheet.
- Contract conflict: legacy selection returns video IDs; current jobs require `muxAssetId`.
  - Mitigation: enforce selection payload enrichment to include `muxAssetId`; block submit and surface actionable errors for items lacking mapping.
- UX contract conflict: legacy “Translate Now” was a stub.
  - Mitigation: define real order semantics (single/batch job creation, success/error summary).
- Runtime/env conflict: old uses `CORE_API_ENDPOINT` and `NEXT_PUBLIC_WATCH_URL`, current env model does not expose them.
  - Mitigation: add optional typed env getters with precedence (`CORE_API_ENDPOINT` first, fallback `NEXT_STAGE_GATEWAY_URL`) and warning-safe behavior.

## Open Questions
- None currently.

## Next Steps
-> `/workflows:plan` to turn this into an implementation task list with file-by-file edits and test cases.
