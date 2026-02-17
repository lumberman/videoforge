import React from 'react';
import Link from 'next/link';
import { listJobs } from '@/data/job-store';
import { getRuntimeWarnings } from '@/config/env';
import { formatStepName } from '@/lib/workflow-steps';
import { NewJobForm } from './new-job-form';

export const dynamic = 'force-dynamic';

type SearchParamValue = string | string[] | undefined;

type SearchParamsInput = Record<string, SearchParamValue>;

type PageProps = {
  searchParams?: Promise<SearchParamsInput>;
};

type CoverageQueueFlash = {
  created: number;
  failed: number;
  skipped: number;
};

function formatDate(iso?: string): string {
  if (!iso) {
    return 'n/a';
  }
  return new Date(iso).toLocaleString();
}

async function resolveSearchParams(
  searchParams?: Promise<SearchParamsInput>
): Promise<SearchParamsInput> {
  if (!searchParams) return {};
  return await searchParams;
}

function getSingleSearchParam(value: SearchParamValue): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
}

function parseNonNegativeInteger(value: SearchParamValue): number | null {
  const scalar = getSingleSearchParam(value);
  if (!scalar) return null;
  if (!/^\d+$/.test(scalar)) return null;

  const parsed = Number(scalar);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseCoverageQueueFlash(
  searchParams: SearchParamsInput
): CoverageQueueFlash | null {
  const source = getSingleSearchParam(searchParams.from);
  if (source !== 'coverage') {
    return null;
  }

  const created = parseNonNegativeInteger(searchParams.created);
  const failed = parseNonNegativeInteger(searchParams.failed);
  const skipped = parseNonNegativeInteger(searchParams.skipped);

  if (created === null || failed === null || skipped === null) {
    return null;
  }

  return { created, failed, skipped };
}

export default async function JobsPage({ searchParams }: PageProps) {
  const normalizedSearchParams = await resolveSearchParams(searchParams);
  const coverageQueueFlash = parseCoverageQueueFlash(normalizedSearchParams);
  const jobs = await listJobs();
  const warnings = getRuntimeWarnings();

  return (
    <main className="container grid">
      {warnings.length > 0 && (
        <section className="card" style={{ borderColor: '#f59e0b' }}>
          <strong>Runtime warnings</strong>
          <ul className="small">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {coverageQueueFlash && (
        <section className="card" role="status" aria-live="polite" style={{ borderColor: '#6ee7b7' }}>
          <strong>Coverage submission complete</strong>
          <p className="small" style={{ marginBottom: 0 }}>
            Created: {coverageQueueFlash.created} · Failed: {coverageQueueFlash.failed} · Skipped:{' '}
            {coverageQueueFlash.skipped}
          </p>
        </section>
      )}

      <NewJobForm />

      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <h2 style={{ margin: 0 }}>Jobs</h2>
          <Link href="/jobs">Refresh</Link>
        </div>

        {jobs.length === 0 ? (
          <p className="small">No jobs yet. Create one to start the workflow.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Status</th>
                <th>Current step</th>
                <th>Retries</th>
                <th>Latest error</th>
                <th>Created</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <code>{job.id}</code>
                    <div className="small">mux: {job.muxAssetId}</div>
                  </td>
                  <td>
                    <span className={`badge ${job.status}`}>{job.status}</span>
                  </td>
                  <td>{job.currentStep ? formatStepName(job.currentStep) : 'n/a'}</td>
                  <td>{job.retries}</td>
                  <td>{job.errors.at(-1)?.message ?? 'n/a'}</td>
                  <td>{formatDate(job.createdAt)}</td>
                  <td>
                    <Link href={`/jobs/${job.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
