import { NextResponse } from 'next/server';
import { createJob, listJobs } from '@/data/job-store';
import { startVideoEnrichment } from '@/workflows/videoEnrichment';
import type { JobCreatePayload } from '@/types/job';

export const dynamic = 'force-dynamic';

function parsePayload(input: unknown): JobCreatePayload {
  if (!input || typeof input !== 'object') {
    throw new Error('Payload must be an object.');
  }

  const body = input as Partial<JobCreatePayload>;

  if (!body.muxAssetId || typeof body.muxAssetId !== 'string') {
    throw new Error('muxAssetId is required and must be a string.');
  }

  if (!Array.isArray(body.languages)) {
    throw new Error('languages is required and must be an array.');
  }

  return {
    muxAssetId: body.muxAssetId,
    languages: body.languages.filter((lang): lang is string => typeof lang === 'string'),
    options: body.options ?? {}
  };
}

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(jobs, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const payload = parsePayload(await request.json());
    const job = await createJob(payload);
    void startVideoEnrichment(job.id);

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create job.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
