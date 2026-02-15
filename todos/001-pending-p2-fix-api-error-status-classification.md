---
status: pending
priority: p2
issue_id: "001"
tags: [code-review, api, reliability]
dependencies: []
---

# Correct API Error Status Classification

## Problem Statement

`POST /api/jobs` currently returns `400` for all exceptions, including server-side persistence failures. This conflates client input errors with internal failures, making monitoring and client retry behavior incorrect.

## Findings

- `POST` catches all thrown errors and always returns `400` in `/videoforge/src/app/api/jobs/route.ts:80`.
- `createJob` can throw file-system/runtime errors unrelated to payload validation, but those currently appear to clients as bad request.
- The artifact route also maps all read failures to `404` in `/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts:60`, which can hide permission/IO faults.

## Proposed Solutions

### Option 1: Typed Validation Errors + Status Mapping

**Approach:** Introduce a small validation error class for payload failures and map other errors to `500`.

**Pros:**
- Clear contract for clients (`400` vs `500`)
- Better operational signal quality

**Cons:**
- Small refactor across route handlers

**Effort:** Small

**Risk:** Low

---

### Option 2: Message-Based Heuristics

**Approach:** Keep current structure but map only known validation messages to `400`; default to `500`.

**Pros:**
- Minimal code changes

**Cons:**
- Brittle coupling to error strings

**Effort:** Small

**Risk:** Medium

---

### Option 3: Route-Level Error Utility

**Approach:** Add shared helper to normalize API errors for all routes.

**Pros:**
- Reusable across API layer
- Consistent status handling

**Cons:**
- Slightly larger change surface

**Effort:** Medium

**Risk:** Low

## Recommended Action

Use Option 1. Introduce explicit validation error typing and return `500` for non-validation exceptions in both jobs and artifact routes.

## Technical Details

**Affected files:**
- `/videoforge/src/app/api/jobs/route.ts`
- `/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts`

## Resources

- Branch: `w-1`
- Review context: current uncommitted changes

## Acceptance Criteria

- [ ] `POST /api/jobs` returns `400` only for invalid payloads
- [ ] Internal write/read failures return `500`
- [ ] Tests cover both validation and internal-failure paths
- [ ] Existing success-path tests remain green

## Work Log

### 2026-02-15 - Review Finding Created

**By:** Codex

**Actions:**
- Reviewed API route error handling paths
- Identified misclassification at `/videoforge/src/app/api/jobs/route.ts:80`
- Identified broad catch behavior at `/videoforge/src/app/api/artifacts/[jobId]/[...artifact]/route.ts:60`

**Learnings:**
- Payload validation is strong, but failure class mapping is still too coarse for operations.

## Notes

- This does not block merge immediately, but it should be addressed before production rollout.
