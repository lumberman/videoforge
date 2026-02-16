---
module: Jobs API
date: 2026-02-15
problem_type: logic_error
component: rails_controller
symptoms:
  - "POST /api/jobs returned 500 for malformed JSON request bodies."
  - "Clients received generic internal error payloads for invalid input: {\"error\":\"Unable to create job.\"}."
  - "Status-code semantics regressed: malformed JSON was classified as server failure instead of client validation failure."
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [jobs-api, error-classification, json-validation, api-contract]
---

# Troubleshooting: Malformed JSON Body Misclassified as 500 in Jobs API

## Problem
`POST /api/jobs` incorrectly returned `500` when the request body contained malformed JSON. Invalid client input should be treated as a `400` validation error, not an internal server error.

## Environment
- Module: Jobs API
- Stage: Post-implementation hardening
- Affected Component: `POST /api/jobs` route handler in `/videoforge/src/app/api/jobs/route.ts`
- Date: 2026-02-15

## Symptoms
- Sending `POST /api/jobs` with `Content-Type: application/json` and body `'{'` returned `500`.
- Response payload was generic internal failure text (`Unable to create job.`) instead of an actionable validation message.
- API clients and observability could not distinguish malformed request bodies from true internal failures.

## What Didn't Work

**Existing behavior:** The route only returned `400` for `PayloadValidationError`.
- **Why it failed:** `request.json()` throws before payload-shape validation runs, so malformed JSON bypassed validation classification and fell into the generic `500` branch.

## Solution

Add explicit classification for JSON parse failures and keep non-validation failures mapped to `500`.

**Code changes**:
```ts
// /videoforge/src/app/api/jobs/route.ts
let parsedJson: unknown;
try {
  parsedJson = await request.json();
} catch {
  throw new PayloadValidationError('Request body must be valid JSON.');
}

const payload = parsePayload(parsedJson);
```

```ts
// /videoforge/src/app/api/jobs/route.ts
if (error instanceof PayloadValidationError) {
  return NextResponse.json({ error: error.message }, { status: 400 });
}
return NextResponse.json({ error: 'Unable to create job.' }, { status: 500 });
```

Add regression tests that lock in both sides of the boundary.

```ts
// /videoforge/tests/api-jobs-contract.test.ts
assert.equal(response.status, 400); // malformed JSON body
assert.equal(response.status, 500); // internal persistence failure
```

## Why This Works
The root cause was error-classification logic that did not account for parse-time failures. By wrapping `request.json()` and rethrowing parse errors as `PayloadValidationError`, malformed input joins the same `400` validation path as other payload errors. Internal runtime failures still fall through to `500`, preserving correct client/server error boundaries.

## Prevention
- Treat parse errors and payload-shape validation as the same client-input category in route handlers.
- Add explicit contract tests for malformed JSON and internal failures whenever status mapping changes.
- Keep error classes narrow and intentional so status mapping cannot drift silently.

## Related Issues
- Related workflow hardening: `/videoforge/docs/solutions/logic-errors/pending-jobs-and-lost-step-context-video-enrichment-workflow-20260214.md`
- Related coverage gateway schema drift fix: `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
