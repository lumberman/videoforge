---
date: 2026-02-15
topic: coverage-report-design-parity
---

# Coverage Report Design Parity

## What We're Building
Bring `/videoforge/src/app/dashboard/coverage` to pixel and interaction parity with the legacy coverage report experience in `/videoforge/old-ai-media`, while keeping current deterministic workflow and API constraints as the source of truth.

Parity target includes:
- Visual parity: layout, typography, spacing, colors, bars, tiles, and section hierarchy.
- Interaction parity: explore/select mode behavior, filters, selection flows, hover details, collection expansion, and load-more behavior.
- Page shell parity: coverage page should use the legacy standalone shell experience rather than the current shared top header/card shell.

Out of scope for this brainstorm:
- Introducing new backend infrastructure.
- Changing core contracts for `/api/jobs` or workflow persistence.
- Re-architecting the coverage data model beyond what parity requires.

## Why This Approach
Three approaches were considered:

1. Legacy transplant (copy legacy UI mostly as-is)
- Fastest path to parity but higher risk of importing old structural debt.

2. Rebuild parity in current component architecture (chosen)
- Reproduces legacy look and behavior, but keeps the code aligned with current module boundaries, typing, and testing standards.
- Reduces long-term maintenance risk versus direct transplant.

3. Two-phase rollout (visual first, interactions second)
- Safer increments, but delays true parity and creates temporary mismatch.

Chosen approach is #2 because it balances parity accuracy with maintainability and keeps the current feature boundaries intact.

## Key Decisions
- Target is pixel + interaction parity, not just a visual refresh.
- `/dashboard/coverage` uses a standalone legacy-like shell for this page.
- Rebuild behavior in current architecture (`/videoforge/src/features/coverage`) rather than copying legacy component internals wholesale.
- Deterministic workflow constraints take precedence when legacy UX conflicts with current workflow/API correctness.
- Primary validation gate is side-by-side manual QA against `/videoforge/old-ai-media` at defined breakpoints.

## Success Criteria
- At agreed desktop and mobile breakpoints, the migrated page matches legacy visual composition closely enough for side-by-side QA sign-off.
- Core interaction flows match legacy behavior:
  - report mode switching
  - filter behavior
  - tile/detail hover behavior
  - selection semantics
  - collection expansion/collapse
  - load-more collection behavior
- Any required deviations are explicit, documented, and justified by deterministic workflow constraints.
- Existing deterministic job-creation behavior remains correct and testable.

## Constraints and Guardrails
- Keep adapters and API usage behind current service boundaries.
- Do not add new infrastructure/services/dependencies unless required.
- Keep tests deterministic and runnable in Codex Cloud constraints.
- Preserve current `POST /api/jobs` contract semantics and error classification behavior.

## Resolved Questions
- Parity target:
  - Decision: Pixel + interaction parity.
- Shell behavior:
  - Decision: Use standalone legacy shell on `/dashboard/coverage`.
- Implementation strategy:
  - Decision: Rebuild parity in current architecture (not direct transplant).
- Primary acceptance check:
  - Decision: Side-by-side manual QA against `/videoforge/old-ai-media`.
- Conflict precedence:
  - Decision: Deterministic workflow constraints win over legacy UX when they conflict.

## Open Questions
- None currently.

## Next Steps
-> `/prompts:workflows-plan` to convert this into an implementation plan with file-level edits, explicit parity checklist, and verification steps.
