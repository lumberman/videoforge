---
status: completed
priority: p1
issue_id: "004"
tags: [code-review, reliability, mux-ai]
dependencies: []
---

# Trim Mux Credential Guard To Prevent Process Exit

`src/services/mux-ai.ts` currently treats whitespace-only credential values as valid. That can bypass our safety guard and still let `@mux/ai` import, which may call `process.exit(1)` and kill the process.

## Problem Statement

The new failure model requires: no process crash, deterministic job failure, clear operator diagnostics.

Current credential gating in `/videoforge/src/services/mux-ai.ts` uses raw truthiness:
- `process.env.MUX_AI_WORKFLOW_SECRET_KEY`
- `process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET`

Whitespace values are truthy and pass this gate, but `@mux/ai` trims env values internally and can reject them at import time. In that case the upstream package exits the process.

## Findings

- Guard logic does not trim values before deciding import safety (`/videoforge/src/services/mux-ai.ts:69`).
- `@mux/ai` env parser trims and exits on invalid env (`/videoforge/node_modules/@mux/ai/dist/primitives/index.js:84`).
- Reproduction (isolated subprocess) with whitespace token id:
  - `MUX_TOKEN_ID=' ' MUX_TOKEN_SECRET='secret' pnpm -s tsx -e "...transcribeWithMuxAi(...)"`
  - Output: `❌ Invalid env: {}` and exit code `1`.

## Proposed Solutions

### Option 1: Normalize/trim env before credential checks (recommended)

**Approach:** Add helper `readEnv(name)` that returns trimmed non-empty string or `undefined`, and use it in `hasMuxAiRuntimeCredentials()`.

**Pros:**
- Directly fixes crash path while keeping existing architecture.
- Minimal code change and low regression risk.

**Cons:**
- Requires touching env guard logic and tests.

**Effort:** Small

**Risk:** Low

---

### Option 2: Remove local guard and isolate `@mux/ai` import in subprocess

**Approach:** Never import `@mux/ai` in-process; call a worker/subprocess and parse structured result.

**Pros:**
- Full containment of import-time exits.

**Cons:**
- Adds process orchestration complexity and latency.
- Violates current simplicity goals.

**Effort:** Large

**Risk:** High

---

### Option 3: Preflight validate env with shared schema before import

**Approach:** Mirror `@mux/ai` schema locally and block import on local validation failures.

**Pros:**
- Strong explicit validation and clear error messages.

**Cons:**
- Risk of schema drift from upstream package.
- Duplicates logic.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Apply Option 1 with trim-normalized env reads in `/videoforge/src/services/mux-ai.ts` and keep the guarded import boundary.

Implemented behavior:
- `readEnvTrimmed()` returns `undefined` for empty/whitespace env values.
- `hasMuxAiRuntimeCredentials()` requires non-empty trimmed credentials.
- Missing/invalid credentials fail with structured `MUX_AI_CONFIG_MISSING` before attempting `@mux/ai` import.
- Regression coverage validates whitespace credentials do not call the module importer.

## Technical Details

**Affected files:**
- `/videoforge/src/services/mux-ai.ts`
- `/videoforge/tests/mux-ai-adapter.test.ts`

**Related components:**
- Workflow failure handling in `/videoforge/src/workflows/videoEnrichment.ts`

## Resources

- Review evidence command (process exit reproduction):
  - `cd /videoforge && MUX_TOKEN_ID=' ' MUX_TOKEN_SECRET='secret' pnpm -s tsx -e "import('./src/services/mux-ai.ts').then(async (m)=>{await m.transcribeWithMuxAi('asset-whitespace'); console.log('ok');}).catch((e)=>{console.error('caught', e?.name, e?.message); process.exit(2);})"; echo EXIT:$?`

## Acceptance Criteria

- [x] `hasMuxAiRuntimeCredentials()` treats whitespace-only values as missing.
- [x] Missing/invalid whitespace credentials do not allow `@mux/ai` import path.
- [x] Adapter returns structured `MUX_AI_CONFIG_MISSING` error instead of crashing process.
- [x] Add regression test for whitespace credential values.
- [x] `pnpm -s test tests/mux-ai-adapter.test.ts` passes.

## Work Log

### 2026-02-15 - Code Review Finding

**By:** Codex

**Actions:**
- Reviewed mux-ai guard and upstream package env behavior.
- Reproduced process exit with whitespace credentials in isolated subprocess.
- Documented remediations and acceptance criteria.

**Learnings:**
- Truthy checks are insufficient when upstream parser trims input.
- Import-time exits must be guarded by normalized validation, not raw env presence.

### 2026-02-15 - Remediation Completed

**By:** Codex

**Actions:**
- Implemented trim-aware credential gating in `/videoforge/src/services/mux-ai.ts`.
- Kept guarded import semantics and structured dependency errors.
- Verified whitespace credential regression in `/videoforge/tests/mux-ai-adapter.test.ts`.

**Result:**
- Whitespace-only credentials no longer bypass import safety guard.
- Process-crash path from invalid credential formatting is blocked at adapter boundary.

## Notes

This is a merge-blocking reliability issue because it violates the explicit no-process-crash policy.
