---
status: complete
priority: p2
issue_id: "010"
tags: [code-review, reliability, coverage, language-selector]
dependencies: []
---

# Enforce Local-First Language Search With Remote Miss Fallback

Make local language data the authoritative source (especially speaker counts), and only call remote language search when the local dataset has no match for the query.

## Problem Statement

The coverage language selector must preserve local speaker-count quality, while still allowing discovery of rare new languages not yet synced into local JSON. We cannot change the upstream remote languages API quality, so our client/server logic should treat remote data as a narrow fallback path only.

## Findings

- Local dataset is currently the trusted source for speaker estimates and percentage display.
- Rare new languages may exist remotely before local sync.
- Remote language data is not authoritative for speaker counts and should not overwrite local confidence.
- Existing search flow includes local-first logic, but fallback behavior should be explicitly documented and hardened to avoid broad remote-data blending.

## Proposed Solutions

### Option 1: Strict local-first with query-scoped remote fallback (Recommended)

**Approach:**
- Search local payload first.
- If no local match for the current query, call remote search.
- Return/use remote results only for that query context.
- Do not globally merge remote speaker counts into local canonical data.

**Pros:**
- Preserves local speaker-count integrity.
- Supports rare remote-only languages.
- Keeps behavior deterministic and easy to reason about.

**Cons:**
- Remote-only language entries may have limited speaker detail.

**Effort:** 1-2 hours

**Risk:** Low

---

### Option 2: Local-first with gated merge metadata

**Approach:**
Allow merge of remote-only language rows, but mark provenance and block remote speaker values from replacing local values.

**Pros:**
- Wider reuse of remote discoveries across future searches.

**Cons:**
- More state complexity and cache/merge edge cases.

**Effort:** 2-4 hours

**Risk:** Medium

## Recommended Action

Completed with strict local-first behavior:
- local matches are used directly for search results,
- remote search is called only on local miss,
- remote search results are query-scoped and no longer merged into local canonical data.

## Technical Details

**Affected files:**
- `/videoforge/src/features/coverage/LanguageGeoSelector.tsx`
- `/videoforge/src/app/api/languages/route.ts`
- `/videoforge/tests` (add/adjust selector and route fallback tests)

**Related components:**
- Coverage language selector
- Local country-language population dataset
- Remote language GraphQL fallback search

**Database changes (if any):**
- No

## Resources

- **Branch:** `prev-version-merge-code-1`
- **Related pattern:** `/videoforge/docs/critical-patterns.md`
- **Related solution:** `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`

## Acceptance Criteria

- [x] Language search uses local dataset first for every query.
- [x] Remote language API is called only when local search yields zero matches.
- [x] Remote fallback does not overwrite authoritative local speaker counts.
- [x] Tests cover: local hit (no remote call), local miss (remote call), and remote-only language display behavior.
- [x] Behavior is documented in code comments or solution docs where needed.

## Work Log

### 2026-02-16 - Requirement Update

**By:** Codex

**Actions:**
- Replaced prior todo scope with product constraint from user.
- Captured local-authoritative speaker data requirement.
- Captured remote-miss-only fallback requirement.

**Learnings:**
- Upstream remote language API cannot be made authoritative here, so local data quality must be protected by design.

### 2026-02-16 - Implemented and Verified

**By:** Codex

**Actions:**
- Updated `/videoforge/src/features/coverage/LanguageGeoSelector.tsx` to keep local data authoritative and stop broad remote merge behavior.
- Updated `/videoforge/src/app/api/languages/route.ts` to resolve gateway URL from `CORE_API_ENDPOINT` or `NEXT_STAGE_GATEWAY_URL`.
- Added regression tests in `/videoforge/tests/api-languages-route.test.ts` for local-hit/no-remote-call and local-miss/remote-fallback behavior.

**Learnings:**
- Query-scoped remote fallback preserves rare-language discoverability without diluting local speaker-count authority.

## Notes

- This item supersedes the previous `010` framing focused on env resolution drift.
