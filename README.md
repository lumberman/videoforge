# AI Video Enrichment Platform

A workflow-driven system for automated **video enrichment** including:

- Transcription
- Translation
- Voiceover generation
- Chapter detection
- Metadata extraction
- Embedding vectors for semantic search
- Content tagging
- Structural analysis

Built as a unified Next.js application with:

- Integrated workflow orchestration
- Operational dashboard UI
- Production-ready deployment path
- Optional editorial review via CMS

---

# Overview

This system processes video assets (e.g. from Mux) through structured enrichment workflows.

Enrichment capabilities may include:

- Transcript generation
- Subtitle creation (VTT)
- Translation into multiple languages
- AI voiceover generation
- Automatic chapter segmentation
- Metadata extraction (topics, speakers, themes)
- Embedding generation for semantic search
- Tag generation
- Content classification

The architecture is modular and allows adding new enrichment steps without restructuring the system.

---

# Architecture

## Application (Single App)

- Next.js (App Router)
- Node 21+ (Node 22 supported)
- TypeScript
- workflow.dev

Note on `@mux/ai`: the package requires Node `>=21`. In Codex Cloud you can pin Node `22.x`.

Worlds:
- **Local World** → development / Codex Cloud
- **Vercel World** → production

This is a single deployable application:
- API routes
- Workflow logic
- Dashboard UI

No separate orchestration service.

---

## AI Provider

- OpenRouter (model gateway, especially for non-Mux-specific paths)

Used for:
- Text-to-Speech
- Non-Mux enrichment paths when explicitly configured
- Content classification

Models are abstracted behind service adapters to allow swapping providers.

## Mux AI Toolkit

- `@mux/ai/workflows` is the default and required path for suitable Mux video enrichment jobs.
- `@mux/ai/primitives` are used as the primary preprocessing layer for transcript/VTT/storyboard/chunking operations.
- Custom Mux logic is only used for requirements not covered by workflows/primitives.
- Core mux-ai failures are surfaced as structured job errors (`code`, `operatorHint`) with deterministic failed status.

---

## Video Platform

- Mux (input + enriched output distribution)

---

## Artifact Storage

- Vercel Blob or Cloudflare R2

Stores enrichment artifacts such as:

- transcript.json
- translation.json
- subtitles.vtt
- voiceover.mp3
- chapters.json
- metadata.json
- embeddings.json

Workflow state stores only metadata and references (URLs), not large blobs.

---

## Optional CMS

- Strapi (optional)

Used for:
- Manual transcript editing
- Manual metadata refinement
- Chapter adjustments
- Review and publishing workflows
- Content lifecycle management

CMS is decoupled from workflow execution.

---

# System Responsibilities

## Workflow Engine

Responsible for:
- Orchestrating enrichment steps
- Managing retries and error handling
- Tracking job state and progress
- Persisting lightweight workflow metadata

Does NOT:
- Store large files
- Store binary artifacts
- Act as a CMS
- Act as a search engine

---

## Dashboard UI (Next.js)

Routes example:

- `/dashboard`
- `/dashboard/jobs`
- `/dashboard/jobs/[id]`
- `/dashboard/coverage`

Displays:

- Job list
- Current step
- Status
- Retry count
- Duration
- Errors
- Artifact links
- Enrichment outputs

The UI reads workflow state via internal API routes.

---

## Storage Layer

Responsible for:
- Persisting generated enrichment artifacts
- Returning durable URLs
- Decoupling artifacts from orchestration logic

---

## Search & Vector Layer (Optional)

Embeddings generated during enrichment can be:

- Stored in Blob/R2 (raw JSON)
- Indexed into a vector database
- Used for semantic search
- Used for content recommendations
- Used for contextual retrieval

This layer is optional and modular.

---

# Enrichment Workflow (Example)

1. Create job
2. Download video asset
3. Transcribe/process transcript via `@mux/ai/workflows` + `@mux/ai/primitives` (default)
4. Generate structured transcript artifacts
5. Extract chapters (prefer `@mux/ai/workflows`)
6. Extract metadata (topics, tags, summary)
7. Generate embeddings for search (prefer `@mux/ai/workflows`)
8. Translate (optional)
9. Generate voiceover (optional)
10. Upload artifacts to Blob/R2
11. Upload enriched media to Mux (optional)
12. Notify CMS (optional)

Steps are composable and can be extended without changing core architecture.

---

# Project Structure

/src
  /app
    /dashboard
    /api

  /workflows
    videoEnrichment.ts

  /services
    transcription.ts
    translation.ts
    voiceover.ts
    chapters.ts
    metadata.ts
    embeddings.ts
    mux.ts
    storage.ts

  /cms
    strapiClient.ts

  /config
    env.ts

---

# Development

## Requirements

- Node 21+ (recommended: Node 22.x in Codex Cloud)
- npm or pnpm
- OpenRouter API key
- Mux credentials

Optional:
- Strapi instance
- Vercel account

---

## Install

    npm install

---

## Environment Variables

    OPENROUTER_API_KEY=
    MUX_TOKEN_ID=
    MUX_TOKEN_SECRET=
    BLOB_STORAGE_CONFIG=
    STRAPI_ENDPOINT=
    STRAPI_API_TOKEN=
    CORE_API_ENDPOINT=
    NEXT_STAGE_GATEWAY_URL=
    NEXT_PUBLIC_WATCH_URL=

---

## Run (Local World)

    pnpm dev

- Uses Local World
- Stores workflow state as JSON
- Local process execution loop
- Dashboard available via Next.js routes
- mux-ai is the default and required integration path.

## Test Commands

    pnpm typecheck
    pnpm test
    pnpm test:smoke

## Operator Runbook

1. Create a job from `/dashboard/jobs` or `POST /api/jobs`.
2. Watch status and step transitions in `/dashboard/jobs/[id]`.
3. Use `/dashboard/coverage` to inspect coverage and submit one job per selected media item.
4. Validate generated artifacts from the Artifacts section links.
5. For optional integrations:
   - `uploadMux=true` should produce `muxUpload` artifact URL.
   - `notifyCms=true` should complete `cms_notify` step even when Strapi is not configured (sync result is non-blocking).

### Troubleshooting

- Job stuck/failing:
  - inspect `/videoforge/.data/jobs.json`
  - inspect `/videoforge/.data/artifacts/<jobId>/`
  - verify API response from `GET /api/jobs/:id` includes `errors` and `currentStep`
  - check `errors[].code` and `errors[].operatorHint` for dependency-level diagnostics
- Artifact route returns `400`:
  - confirm artifact URL path is not empty and does not include traversal segments
- Mux AI path not active:
  - verify `@mux/ai` is installed and configured
  - verify runtime is Node 21+ (`node -v`)
  - in Codex Cloud, pin Node `22.x` if you want a fixed runtime
  - expect deterministic job failure with `MUX_AI_*` error codes when credentials/import/runtime are invalid

---

# Production Deployment

Deploy to Vercel.

Workflow automatically switches to **Vercel World** for:

- Durable state
- Managed queue
- Crash recovery
- Horizontal scalability

No workflow code changes required.

---

# Data Flow

Mux → Workflow Engine → OpenRouter
                         ↓
                     Blob / R2
                         ↓
               (Optional) Vector Index
                         ↓
                     Mux (enriched asset)
                         ↓
                     Strapi (editorial)

Dashboard UI reads from workflow state.

---

# How It Works (Simple Flow)

```text
[User/API]
   |
   v
POST /api/jobs (muxAssetId, languages, options)
   |
   v
Create job record (status=pending) -> start workflow
   |
   v
+------------------------------------------------------+
| Video Enrichment Workflow                            |
|                                                      |
| 1) Preprocess with @mux/ai/primitives (default)     |
|    - transcript / VTT / cues / chunks               |
|                                                      |
| 2) Run suitable @mux/ai/workflows (default)         |
|    - chapters, embeddings, translation, etc.        |
|                                                      |
| 3) Run non-Mux optional adapters where required     |
|    - voiceover / downstream integrations            |
|                                                      |
| 4) Store artifacts and URLs                          |
|    - transcript, subtitles, metadata, embeddings     |
|                                                      |
| 5) Optional steps                                    |
|    - upload to Mux                                   |
|    - notify Strapi CMS                               |
+------------------------------------------------------+
   |
   v
Update job state (step status, retries, errors, artifacts)
   |
   v
GET /api/jobs and GET /api/jobs/:id drive the dashboard
```

In short: a job is created through the API, the workflow runs with a mux-ai-first required path (`@mux/ai/primitives` + `@mux/ai/workflows`) for core Mux enrichment, stores artifacts, and continuously updates job state for dashboard visibility. When mux-ai is unavailable, jobs fail predictably with structured operator diagnostics instead of crashing the process.

---

# Design Principles

- Single deployable application
- Clear separation of orchestration and storage
- Artifact-based enrichment model
- Extensible workflow steps
- Model provider abstraction
- Storage backend abstraction
- CMS optional and decoupled
- Dev-to-production parity

---

# Non-Goals

- Not a distributed media cluster
- Not a microservice architecture
- Not a monolithic CMS
- Not a generic video hosting platform

---

# Scaling Strategy

Current:
- Single Next.js app
- Local or Vercel managed workflow state

Future options:
- Postgres World (if needed)
- Parallel enrichment pipelines
- Dedicated vector database (if explicitly requested)
- Multi-language orchestration
- Artifact versioning and audit trails

---

# Summary

This repository implements a modular AI-powered video enrichment platform combining:

- Workflow orchestration (workflow.dev)
- Mux-native enrichment via `@mux/ai/workflows` + `@mux/ai/primitives`
- Model abstraction via OpenRouter
- Media integration via Mux
- Artifact storage (Blob/R2)
- Integrated operational dashboard
- Optional editorial CMS layer
- Extensible enrichment capabilities

The system is designed to evolve beyond subtitles into a general-purpose AI video enrichment engine.
