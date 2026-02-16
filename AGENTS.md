# AGENTS.md

This file contains implementation guidance and engineering rules for agents.

See `README.md` for complete product vision, architecture, and technical overview.
See `/videoforge/docs/critical-patterns.md` for required incident-prevention patterns.

---

# Core principles (non-negotiable)

- **Single app**: Next.js app contains API + workflow orchestration. Do not introduce additional services unless explicitly requested.
- **Deterministic + testable**: Prefer pure functions, explicit inputs/outputs, and predictable behavior.
- **Refuse complexity**: If a change introduces new infrastructure, persistence layers, queues, schedulers, or background daemons, **do not implement it unless explicitly instructed by the user**.
- **No unnecessary dependencies**: Do not introduce major libraries or frameworks unless clearly required.
- **Artifacts are external**: Workflow state must remain small. Large outputs must be stored in object storage and referenced by URL.
- **Environment parity**: Code must run in both Codex Cloud (Local World) and production (Vercel World) without modification.

---

## Workflow behavior

Requirements:

- persist per-step status
- persist retries and errors
- expose status/artifacts in API + dashboard
- keep behavior deterministic for local and test execution

## API contracts

### POST /api/jobs

Payload:

```json
{ "muxAssetId": "string", "languages": ["es"], "options": { "generateVoiceover": false, "uploadMux": false, "notifyCms": false } }
```

Response:

```json
{ "jobId": "string", "status": "pending" }
```

### GET /api/jobs

Returns all jobs with status, current step, retries, timestamps, and artifact URLs.

### GET /api/jobs/:id

Returns one job including:

- workflow state
- current step
- step history
- errors
- artifact URLs

---

## Implementation guardrails

Agents must not call external APIs directly from workflow definitions.

All integrations must be isolated behind service adapters.

---

# OpenRouter integration rules

- Use OpenRouter as AI gateway.
- Do not hardcode model names throughout the codebase.
- Centralize model configuration.
- Handle retries at workflow layer.

---

# Mux integration rules

Mux integration must be isolated behind a service adapter.

For any suitable Mux-video enrichment job, agents must use `@mux/ai/workflows` as the default implementation path.

For all Mux video preprocessing, agents must use `@mux/ai/primitives` to the maximum extent possible for transcript, VTT, storyboard, thumbnail, and chunking operations.

Only implement custom Mux processing beyond `@mux/ai/workflows` and `@mux/ai/primitives` when a requirement is not covered, and document why in the plan/PRD.

If `@mux/ai` runtime requirements conflict with project runtime requirements, agents must add a compatibility gate and resolve it before broad adoption.

Workflow state should store only:

- mux asset IDs
- playback IDs
- URLs

---

# Testing rules

Agents must prioritize testability.

Every new feature must include automated tests in the same change set. Do not ship feature code without tests.

Prefer:

- pure functions
- mockable service adapters
- deterministic behavior

External services must be mockable.

Tests must be runnable in Codex Cloud by default:

- avoid tests that require binding local network ports
- avoid tests that depend on GUI/system-level capabilities
- prefer route-handler/function-level tests that run in-process
- use temporary, isolated filesystem paths for test data
- keep tests deterministic and independent of external network access

At minimum, provide:

- unit tests for enrichment logic
- mocked tests for external integrations

---

# Boundaries (what agents must NOT do)

Agents must refuse to introduce:

- relational databases (Postgres, MySQL, etc.)
- Redis
- message brokers
- job queues outside workflow.dev
- microservices
- background daemon processes
- vector databases unless explicitly requested
- authentication systems unless explicitly requested

Agents must not introduce architecture changes without explicit instruction.

---

# Handling ambiguity

If requirements are unclear:

- Choose the simplest implementation possible
- Document assumptions in the PRD
- Do not introduce infrastructure preemptively

---

# Definition of Done

A task is complete when:

- Implementation is complete
- PRD is updated with learnings and decisions
- Code builds successfully
- Tests are added for every new feature and pass in Codex Cloud
- No unnecessary dependencies introduced
- Complexity has not increased unnecessarily

---

When writing any .md files and mentioning file paths never include local MacOS/Linux path like "/Users/UserName/GitHub/videoforge" always reference files locally starting from the top parent folder /videoforge.

---

# Development process (Compound Engineering)

Agents must follow the compound engineering loop:

**Plan → Implement → Verify → Compound → Document**

Compound means every change must improve the system's future maintainability.

Agents must:

- Improve clarity where possible
- Reduce duplication
- Simplify interfaces
- Document decisions
- Avoid introducing complexity

Never optimize prematurely.

---

# PRDs live in `/prd`

All feature specifications and planning documents are stored in:

---

# Guiding philosophy

Prefer:

- simplicity over flexibility
- clarity over cleverness
- determinism over automation magic
- explicit behavior over implicit behavior

Agents must optimize for long-term maintainability and Codex Cloud testability.
