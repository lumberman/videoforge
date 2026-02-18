---
module: Coverage Translation Flow
date: 2026-02-17
problem_type: ui_bug
component: coverage_report_client
symptoms:
  - "The fixed translation action bar could render partially off-screen at the bottom on mobile viewport sizes."
  - "Action controls in the floating panel were harder to access/review when the panel content grew."
  - "Error toast + action panel stacking increased risk of content clipping near the viewport edge."
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [coverage, mobile, floating-panel, viewport, safe-area]
---

# Troubleshooting: Mobile Translation Bar Overflow on Coverage Screen

## Problem
On `/dashboard/coverage`, the fixed translation action bar could overflow below the bottom edge on mobile-sized screens, making controls and feedback difficult to access.

## Environment
- Module: Coverage Translation Flow
- Route: `/dashboard/coverage`
- Affected Component: `/videoforge/src/app/globals.css`
- Date solved: 2026-02-17

## Symptoms
- Floating translation panel appeared clipped at the bottom on narrow/mobile viewports.
- Large panel states (selection summary + controls + toast context) reduced usable visible area.
- Mobile interaction quality degraded when panel content height exceeded available space.

## What Didn’t Work

**Attempted behavior:** Keep desktop spacing/sizing rules for `.translation-bar` on mobile.
- **Why it failed:** Fixed `left/right/bottom` offsets and minimum sizing did not account for smaller viewport height and safe-area constraints.

**Attempted behavior:** Rely on default block expansion without bounded height.
- **Why it failed:** The panel could grow beyond the available viewport space and render outside visible bounds.

## Solution

Added mobile-specific CSS rules for the translation bar and related controls in `/videoforge/src/app/globals.css` under `@media (max-width: 720px)`:

- Constrained horizontal positioning for mobile:
  - `left: 12px; right: 12px;`
- Safe-area-aware bottom placement:
  - `bottom: max(12px, env(safe-area-inset-bottom));`
- Bounded panel height and internal scroll:
  - `max-height: calc(100dvh - max(24px, env(safe-area-inset-bottom) + 24px));`
  - `overflow-y: auto;`
- Reduced mobile padding/min-height pressure:
  - `min-height: 0; padding: 12px 14px;`
- Ensured mobile-friendly internal layout:
  - `.translation-view { width: 100%; align-items: stretch; }`
  - `.translation-controls { width: 100%; }`
  - `.translation-primary { flex: 1 1 auto; justify-content: center; }`
- Prevented toast positioning from forcing off-screen stacking:
  - `.translation-toast-wrap { position: static; margin-bottom: 10px; }`

## Why This Works
- The panel remains fixed and visible while respecting iOS/Android safe-area insets.
- Height is capped to available viewport space, so content scrolls inside the panel instead of overflowing off-screen.
- Mobile layout rules force controls into predictable full-width behavior, improving reachability.
- Toast positioning no longer depends on absolute placement above the bar in tight viewports.

## Prevention
- For fixed UI surfaces, always add mobile-specific max-height + internal scrolling rules.
- Use safe-area-aware bottom offsets for persistent controls near viewport edges.
- Verify fixed overlays in narrow viewport QA (e.g., 390x844) before release.
- Keep desktop and mobile overlay behaviors explicitly separated in CSS.

## Verification
- Browser validation performed at 390x844 viewport:
  - Translation bar rectangle remained fully visible (`fitsBottom: true`, `fitsTop: true`).
- Confirmed panel remained usable during translation selection and submit flow.
- Commit containing fix:
  - `1e733a1` (`fix: keep translation action bar within mobile viewport`)

## Related Files
- `/videoforge/src/app/globals.css`

## Related Issues
- See also: `/videoforge/docs/solutions/ui-bugs/coverage-translate-submit-feedback-and-error-toast-20260216.md`
- Follow-up integration blocker (not solved by this fix): `/videoforge/todos/019-pending-p1-debug-mux-transcription-fetchtranscript-failure.md`
