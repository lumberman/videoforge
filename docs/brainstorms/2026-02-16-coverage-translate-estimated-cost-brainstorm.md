---
date: 2026-02-16
topic: coverage-translate-estimated-cost
---

# Coverage Translate Estimated Cost in Action Bar

## What We're Building
Add an estimated order cost to the bottom coverage action bar next to `Translate Now` so operators can see likely spend before submitting.

The estimate should:
- be a single USD total (not a precise quote),
- use selected video duration plus an average educational speech rate,
- include transcription cost (OpenAI model),
- include translation/post-processing cost with two OpenAI model 5.2 passes,
- scale with the number of selected target languages.

## Why This Approach
Operators currently submit translation orders without cost visibility. A lightweight estimate directly in the action bar improves decision quality without introducing billing infrastructure or slowing the current order flow.

## Approach Options

### Option 1 (Selected): Single inline total estimate
Show one compact value in the bottom panel, such as `Estimated cost: ~$12.40`, updating as video/language selection changes.

Pros:
- Fastest to scan during ordering.
- Minimal UI complexity.
- Matches request for approximate guidance.

Cons:
- Less transparency on which stage drives cost.

### Option 2: Inline total plus expandable breakdown
Show total by default with a small reveal for transcription, translation, and post-processing components.

Pros:
- Better operator explainability.
- Easier to debug estimate shifts.

Cons:
- More UI and state complexity.
- Not required for current need.

### Option 3: Estimate range only
Show low/high band instead of a single number.

Pros:
- Better communicates uncertainty.

Cons:
- Harder to compare quickly across selections.
- User asked for a single estimate style.

## Key Decisions
- Display one single total USD estimate in the bottom translation panel.
- Estimate scales with selected language count.
- Treat output as directional guidance only, not a billing quote.
- Include three cost buckets in the total:
  - transcription (OpenAI),
  - translation,
  - two post-processing passes using OpenAI model 5.2.

## Assumptions
- Educational speech-rate averages are stable enough to estimate transcript token volume from duration.
- Pricing inputs are centrally configurable and can be revised without changing UX intent.
- Missing duration data falls back to deterministic defaults rather than blocking the UI.

## Resolved Questions
- Output format: single total USD estimate.
- Language scaling: estimate increases with selected target language count.

## Open Questions
- None for brainstorm scope.

## Next Steps
- Move to `/prompts:workflows-plan` to define formula constants, UX copy, edge cases, and test coverage.
