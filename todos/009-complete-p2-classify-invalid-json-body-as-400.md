---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, api, reliability]
dependencies: []
---

# Classify Invalid JSON Body as 400 in Jobs API

## Problem Statement

`POST /api/jobs` now classifies malformed JSON request bodies as internal server errors (`500`) rather than client errors (`400`). This regresses API semantics and can mislead clients, observability, and retry policies.

## Findings

- The route only maps `PayloadValidationError` to `400`; all other exceptions map to `500` (`/videoforge/src/app/api/jobs/route.ts:85`).
- `await request.json()` throws `SyntaxError` for malformed JSON before `parsePayload` runs, so malformed client payloads now return `500`.
- Reproduction in current branch:
  - Request: `POST /api/jobs` with body `'{'` and `content-type: application/json`
  - Response: `500 {"error":"Unable to create job."}`

## Proposed Solutions

### Option 1: Explicitly treat JSON parse failures as validation errors (recommended)

**Approach:** Wrap `request.json()` parsing and map `SyntaxError` (or a dedicated parse error class) to `400` with a clear message.

**Pros:**
- Restores correct client/server error boundary.
- Keeps status semantics deterministic for monitoring/retry.

**Cons:**
- Minor additional branching in handler.

**Effort:** Small

**Risk:** Low

---

### Option 2: Introduce a shared API error-normalization helper

**Approach:** Centralize request-parse and validation classification in a small utility used by route handlers.

**Pros:**
- Consistent behavior across APIs.
- Reduces future status-mapping drift.

**Cons:**
- Slightly broader refactor surface.

**Effort:** Medium

**Risk:** Low

## Recommended Action

Treat malformed JSON parse failures as client-side validation errors (`400`) while preserving `500` for internal persistence/runtime failures.

## Technical Details

**Affected files:**
- `/videoforge/src/app/api/jobs/route.ts`
- `/videoforge/tests/api-jobs-contract.test.ts`

**Related components:**
- `/videoforge/src/app/dashboard/jobs/new-job-form.tsx` (client-side behavior expectations for errors)

**Database changes (if any):**
- No

## Resources

- **Related todo:** `/videoforge/todos/001-complete-p2-fix-api-error-status-classification.md`

## Acceptance Criteria

- [x] Malformed JSON body in `POST /api/jobs` returns `400` with actionable error text.
- [x] Validation errors remain `400`.
- [x] Internal persistence/runtime failures remain `500`.
- [x] Tests cover malformed JSON parse path and pass.

## Work Log

### 2026-02-15 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed status-mapping logic after recent classification hardening.
- Reproduced malformed JSON request behavior directly against route handler.
- Confirmed regression from expected client error classification.

**Learnings:**
- Separating validation and internal errors must include request-body parse failures, not just payload-shape validation.

### 2026-02-15 - Remediation Completed

**By:** Codex

**Actions:**
- Added explicit JSON parse error mapping in `/videoforge/src/app/api/jobs/route.ts`.
- Added regression test for malformed JSON in `/videoforge/tests/api-jobs-contract.test.ts`.
- Re-ran typecheck and full test suite to confirm behavior.

**Learnings:**
- Parsing failures happen before payload validation and should be explicitly mapped to client error semantics.

## Notes

Not a merge blocker for local workflows, but should be fixed to preserve API contract quality and client correctness.
