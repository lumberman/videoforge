---
module: Mux AI Integration
date: 2026-02-18
problem_type: integration_issue
component: service_object
symptoms:
  - "Jobs failed at transcription with: Mux AI subtitle generation request failed: Mux API returned HTTP 400 while generating subtitles for asset <asset_id>."
  - "Mux transcript fetch fallback path could not recover because subtitle generation request payload did not match Mux API contract."
root_cause: request_contract_mismatch
resolution_type: code_fix
severity: high
tags: [mux, subtitles, transcription, api-contract, error-diagnostics]
---

# Troubleshooting: Mux `generate-subtitles` HTTP 400 Due to Request Payload Mismatch

## Problem
During transcription recovery, the adapter attempted to generate subtitles when no text track existed. Jobs failed with HTTP 400 from Mux because the request body shape sent to `generate-subtitles` was not valid for the endpoint.

## Environment
- Module: Mux AI Integration
- Affected Component: Mux adapter subtitle-generation fallback in `/videoforge/src/services/mux-ai.ts`
- Date solved: 2026-02-18

## Symptoms
- Job details showed:
  - `Status: failed`
  - `Current step: Transcription`
  - Error: `Mux AI subtitle generation request failed: Mux API returned HTTP 400 while generating subtitles for asset QAv8HB5RWTNF5WdlBfvLPRstq8Edslr02ouvCL8qovPM`
- Retries did not resolve the failure because the payload contract was deterministically wrong.

## What Didn't Work

**Attempted behavior (before fix):**
- Request body sent either empty object or top-level `language_code` shape.
- Endpoint returned HTTP 400.

**Why it failed:**
- Mux `generate-subtitles` expects `generated_subtitles` array payload.
- Contract mismatch caused deterministic request rejection.

## Solution
Implemented adapter-side request-contract and diagnostics fix.

### 1) Send correct Mux payload shape
Updated subtitle generation request body to:

```json
{
  "generated_subtitles": [
    { "language_code": "auto" }
  ]
}
```

Implementation notes:
- Normalize requested language code when present.
- Default to `auto` when missing/unresolvable.

### 2) Surface Mux error response details
When HTTP response is not OK:
- Parse response body (JSON or text)
- Extract `error.message` / `message` when available
- Append that detail into `MUX_AI_OPERATION_FAILED` message

This turns opaque `HTTP 400` into actionable operator diagnostics.

### 3) Add contract tests
Added/updated adapter tests to verify:
- Payload includes `generated_subtitles[0].language_code === "auto"` in missing-track flow.
- HTTP 400 includes Mux error text in surfaced exception.

## Why This Works
- The request now matches the documented Mux API contract for generated subtitles.
- The fallback path can proceed to `preparing -> ready` track states instead of failing on request creation.
- Operators now see specific rejection reasons from Mux without additional reproduction steps.

## Prevention
- Keep endpoint contract tests for Mux request payload shape in adapter tests.
- For every non-2xx Mux response, preserve API-provided error detail in thrown adapter error.
- Treat deterministic contract mismatches as non-transient integration errors and fix at adapter boundary.

## Verification

Automated:
- `pnpm tsx --test tests/mux-ai-adapter.test.ts`
- `pnpm typecheck`

Manual API verification (same failing asset):
- Retrieved asset and confirmed no text tracks initially.
- Called `POST /video/v1/assets/:asset_id/tracks/:audio_track_id/generate-subtitles` with corrected payload.
- Mux returned `201` and created a `text` track with `status: preparing`.

## Related Files
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/tests/mux-ai-adapter.test.ts`

## Related Issues
- `/videoforge/docs/solutions/architecture/mux-ai-compatibility-gate-and-fallback-20260214.md`
- `/videoforge/docs/solutions/integration-issues/mux-ai-api-shape-mismatch-and-language-id-resolution-20260217.md`
