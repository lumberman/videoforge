Below is a Product Requirements Document (PRD) you can hand to a Codex AI coding agent (or an engineering team) for implementing your AI Video Enrichment Platform project. It follows standard PRD structure and covers why, what, how, and acceptance criteria.  ￼

# Product Requirements Document (PRD)
## AI Video Enrichment Platform

### 1. Purpose & Vision

**Objective:**
Build an extensible platform that automatically enriches video content with AI-driven analysis, including transcription, translation, voiceover, chapters, metadata extraction, semantic search vectors, and tagging.

**Why:**
Content teams often lack tools to prepare rich, AI-ready video assets without manual effort. This platform minimizes manual work and provides structured outputs for downstream use (search, analytics, playback UX).
The product must support local development, automated testing with Codex Cloud, and production deployment on Vercel.

**Stakeholders:**
- Product Owner
- Engineering Team
- Video Content Editors
- Data/AI Platform Team

---

### 2. Scope & Success Criteria

#### In Scope
- Automated workflows for enrichment
- Dashboard UI for job status and progress
- Storage of artifacts and enrichment results
- Optional editorial CMS integration
- Production deployment readiness

#### Out of Scope
- Multi-tenant SaaS infrastructure
- Native mobile SDKs
- Built-in vector search engine (can be optional later)

#### Success Metrics
- End-to-end processing of a video asset in < 30 minutes
- Accurate transcription (visually inspectable)
- Successful upload of all artifacts to blob storage
- Dashboard showing live workflow state
- Editor can review and adjust enrichment outputs in CMS

---

### 3. Users & Use Cases

**Primary Users**
- Content Editors
- Workflow Operators
- Developers/Automation Agents

**User Stories**
1. *As an editor*, I want to see the current progress of a video enrichment job so I can know when outputs are ready.
2. *As a workflow operator*, I want jobs to resume after crashes, so processing is robust.
3. *As a developer*, I want to run the system locally and in production with the same codebase.

---

### 4. Functional Requirements

#### A. Workflow Orchestration
- Support orchestration of multiple enrichment steps (transcription, chapters, metadata, etc.) using **workflow.dev** with environment switching (Local vs Production).
- Persist workflow state and job history.
- Provide retry logic and error tracking.

#### B. AI Services
- Integrate **OpenRouter** for:
  - Speech-to-text
  - Translation
  - TTS
  - Metadata extraction
  - Embedding generation
- Abstract models so they can be swapped.

#### B2. Mux AI Toolkit (Default for Suitable Mux Jobs)
- Use **`@mux/ai/workflows`** as the default implementation path for suitable Mux video enrichment operations.
- Use **`@mux/ai/primitives`** as the primary preprocessing layer for transcript/VTT/storyboard/thumbnail/chunking operations.
- Only implement bespoke Mux enrichment logic when a requirement is not covered by workflows/primitives.
- Keep all Mux AI usage behind service adapters so implementations remain testable and swappable.

#### C. Artifact Management
- Artifact storage in Blob/R2:
  - JSON transcripts
  - VTT subtitle files
  - Voiceover audio
  - Metadata files (tags, summaries, chapters)
  - Embedding vectors
- Upload enriched final versions to Mux.

#### D. Dashboard UI (Next.js)
- Unified single Next.js app with UI routes:
  - `/dashboard/jobs`
  - `/dashboard/jobs/[id]`
- List current jobs with status, step, timestamps, retries.
- Detail view with links to artifacts and error logs.

#### E. CMS Integration (Optional)
- Strapi endpoints to store editable transcripts and metadata.
- Editors can load artifacts public URLs and modify text.
- CMS stores metadata and editorial state separately.

---

### 5. Non-Functional Requirements

- **Compatibility:** Must run on Node 21+ without conflicts with workflow.dev or integrations.
- **Reliability:** Workflow state should be durable between process restarts.
- **Scalability:** Support future backend switch (e.g., Postgres World) if needed.
- **Security:** Secure API routes and storage access via tokens; no public open writes.
- **Testability:** Every new feature must include automated tests that run in Codex Cloud without local port binding.

---

### 6. Architecture Overview

            +------------------+
            |  Dashboard UI    |
            |  (Next.js App)   |
            +---+----------+---+
                | API & UI |
                v          v

Workflow Engine -> Workflow.dev World (Local / Vercel)
|
+-> @mux/ai/workflows (default for suitable Mux jobs)
+-> @mux/ai/primitives (transcript/media preprocessing)
+-> OpenRouter (provider path where needed)
+-> Blob / R2 storage
+-> Mux upload
+-> Optional Strapi (editorial)

- Single codebase.
- One app for dashboard UI and workflow API.
- Environment based backend switching. (Local for dev, Vercel for prod)

---

### 7. APIs & Data Contracts

#### Job Management API

POST /api/jobs
Payload: { muxAssetId, languages[], options }
Response: { jobId, status }

#### Job Status API

GET /api/jobs
GET /api/jobs/{id}
Response includes:
	•	workflow state
	•	current step
	•	artifact URLs

---

### 8. Constraints & Dependencies

- workflow.dev must support Node 21+ without issues.
- Storage provider must persist large JSON and audio.
- OpenRouter API rate limits and quotas must be respected.
- `@mux/ai` documented runtime requirements must be validated against project Node runtime before broad rollout.

---

### 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OpenRouter failures | Retry policy, fallback models |
| Dashboard UI performance | Paginate results, cache queries |
| Blob storage limits | Validate size, chunk if needed |
| Runtime drift between environments | Pin runtime in environment settings (recommended: Node 22.x in Codex Cloud) and enforce `engines.node >=21` |
| Dual-path complexity (`@mux/ai` + bespoke logic) | Make `@mux/ai/workflows` default and keep bespoke logic only for uncovered cases |

---

### 10. Milestones & Timeline

| Milestone | Deliverable | Target |
|-----------|-------------|--------|
| M1 | Basic workflow engine | Week 1 |
| M2 | Transcription & translation steps | Week 2 |
| M3 | Dashboard UI list view | Week 3 |
| M4 | Job detail and artifact links | Week 4 |
| M5 | CMS integration | Week 5 |
| M6 | Production deploy | Week 6 |

---

### 11. Acceptance Criteria

- End-to-end processing works on sample videos.
- Dashboard accurately reflects workflow state.
- Artifacts are visible and accessible via UI links.
- Editor can modify transcripts in CMS.
- Deployment on Vercel with Vercel World is successful.
- For suitable Mux jobs, enrichment defaults to `@mux/ai/workflows`.
- Transcript/media preprocessing for Mux assets uses `@mux/ai/primitives` first.
- Runtime compatibility decision for `@mux/ai` is documented and enforced before broad rollout.
- New feature tests pass in Codex Cloud-compatible mode.

---

### 11.1 Implementation Decisions (2026-02-14)

- Simplified mux-ai adoption policy:
  - `@mux/ai` is a required dependency for mux-enrichment execution paths
  - Runtime requirement is enforced by tooling/config (`engines.node >=21`) with optional Node `22.x` pinning in Codex Cloud
  - Core mux-enrichment steps fail predictably with structured dependency errors when mux runtime/config/import is unavailable (no silent fallback success path)
- Integrated mux-ai access through existing service entry points:
  - `/videoforge/src/services/transcription.ts`
  - `/videoforge/src/services/chapters.ts`
  - `/videoforge/src/services/metadata.ts`
  - `/videoforge/src/services/embeddings.ts`
  - `/videoforge/src/services/translation.ts`
- Added primitives-first preprocessing hook for transcript/media-derived artifacts (VTT/storyboard/chunks) with non-fatal warnings for optional artifacts.
- Strengthened deterministic behavior and observability:
  - strict API payload validation for `POST /api/jobs`
  - hardened artifact-path sanitization in `GET /api/artifacts/...`
  - workflow catch-path now appends terminal orchestration errors without losing `currentStep`
  - job errors now include additive structured metadata (`code`, `operatorHint`, `isDependencyError`) for operators
- Added Codex-Cloud-safe automated tests for:
  - mux-ai adapter contract behavior (including config/import failures)
  - workflow/job-state transitions and optional paths
  - API contracts (`/api/jobs`, `/api/jobs/:id`, `/api/artifacts/...`)
  - dashboard list/detail rendering and form parsing helpers
  - adapter-level mocking strategy for deterministic unit tests without live mux runtime

---

### 11.2 Implementation Decisions (2026-02-15)

- Migrated legacy coverage reporting and order flow into the current single-app architecture:
  - Added `/dashboard/coverage` route and dashboard navigation entry.
  - Added internal coverage API routes:
    - `/api/coverage/languages`
    - `/api/coverage/collections`
- Isolated external coverage integration behind service adapters and route handlers:
  - Added `/videoforge/src/services/coverage-gateway.ts` for gateway resolution, request handling, and payload normalization.
  - Kept workflow definitions free of direct external API calls.
- Added deterministic gateway configuration precedence:
  - `NEXT_PUBLIC_GATEWAY_URL`
  - fallback `NEXT_STAGE_GATEWAY_URL`
  - optional watch URL via `NEXT_PUBLIC_WATCH_URL`
- Implemented deterministic batch ordering flow from coverage selection:
  - One `POST /api/jobs` call per selected media item.
  - Sequential submission in selected-item order.
  - Explicit per-item created/failed/skipped outcomes with reasons and job links.
  - Duplicate-submit guard in UI via in-flight lock.
- Enforced explicit mapping behavior for selectable coverage items:
  - Items missing `muxAssetId` are marked non-selectable with actionable reason text.
  - Non-selectable items are never submitted silently.
- Added Codex-Cloud-safe tests for migration behaviors:
  - coverage API route env fallback and precedence
  - non-selectable mapping behavior for missing `muxAssetId`
  - deterministic mixed-result batch submission behavior
  - coverage page empty/error rendering
- Removed legacy source tree from this repository after parity and regression validation:
  - `/videoforge/old-app-code`

---

### 12. Glossary

- **Workflow.dev World:** Backend storage/queue environment for workflow.dev.
- **Local World:** JSON file persistence for dev.
- **Vercel World:** Production state persistence and queue.
- **Artifact:** Any output stored externally (transcript, audio, metadata).

---

### References

- PRD best practices: overview, how to write, structure and alignment of requirements.  [oai_citation:1‡Notion](https://www.notion.com/blog/how-to-write-a-prd?utm_source=chatgpt.com)
- Mux AI toolkit: https://github.com/muxinc/ai
- Mux AI workflows docs: https://github.com/muxinc/ai/blob/main/docs/WORKFLOWS.md
- Mux AI primitives docs: https://github.com/muxinc/ai/blob/main/docs/PRIMITIVES.md
- Mux AI announcement: https://www.mux.com/blog/video-ai-shouldn-t-be-hard-so-we-built-mux-ai

If you want, I can also generate a task list or issue breakdown format for Codex to execute against this PRD.
