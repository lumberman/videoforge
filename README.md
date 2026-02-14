# AI Video Enrichment Platform

A workflow-driven system for automated **video enrichment** including:

- Transcription
- Translation
- Voiceover generation
- Chapter detection
- Metadata extraction
- AI search vectors
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
- Node 20
- TypeScript
- workflow.dev

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

- OpenRouter (model gateway)

Used for:
- Transcription
- Translation
- Text-to-Speech
- Metadata extraction
- Chapter detection
- Embedding generation
- Content classification

Models are abstracted behind service adapters to allow swapping providers.

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
3. Transcribe via OpenRouter
4. Generate structured transcript
5. Extract chapters
6. Extract metadata (topics, tags, summary)
7. Generate embeddings for search
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

- Node 20+
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

---

## Run (Local World)

    npm run dev

- Uses Local World
- Stores workflow state as JSON
- In-memory queue
- Dashboard available via Next.js routes

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
- Dedicated vector database
- Multi-language orchestration
- Artifact versioning and audit trails

---

# Summary

This repository implements a modular AI-powered video enrichment platform combining:

- Workflow orchestration (workflow.dev)
- Model abstraction via OpenRouter
- Media integration via Mux
- Artifact storage (Blob/R2)
- Integrated operational dashboard
- Optional editorial CMS layer
- Extensible enrichment capabilities

The system is designed to evolve beyond subtitles into a general-purpose AI video enrichment engine.