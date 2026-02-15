import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobById } from '@/data/job-store';
import { formatStepName } from '@/lib/workflow-steps';

export const dynamic = 'force-dynamic';

function formatDate(iso?: string): string {
  if (!iso) {
    return 'n/a';
  }
  return new Date(iso).toLocaleString();
}

export default async function JobDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) {
    notFound();
  }

  return (
    <main className="container grid">
      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Job Details</h2>
            <div className="small">
              <code>{job.id}</code>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard/jobs">Back to jobs</Link>
            <Link href={`/dashboard/jobs/${job.id}`}>Refresh</Link>
          </div>
        </div>

        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <div>
            <div className="small">Status</div>
            <span className={`badge ${job.status}`}>{job.status}</span>
          </div>
          <div>
            <div className="small">Current step</div>
            <div>{job.currentStep ? formatStepName(job.currentStep) : 'n/a'}</div>
          </div>
          <div>
            <div className="small">Created</div>
            <div>{formatDate(job.createdAt)}</div>
          </div>
          <div>
            <div className="small">Completed</div>
            <div>{formatDate(job.completedAt)}</div>
          </div>
          <div>
            <div className="small">Retries</div>
            <div>{job.retries}</div>
          </div>
          <div>
            <div className="small">Languages</div>
            <div>{job.languages.length > 0 ? job.languages.join(', ') : 'none'}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Step Execution</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Retries</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {job.steps.map((step) => (
              <tr key={step.name}>
                <td>{formatStepName(step.name)}</td>
                <td>
                  <span className={`badge ${step.status}`}>
                    {step.status}
                  </span>
                </td>
                <td>{step.retries}</td>
                <td>{formatDate(step.startedAt)}</td>
                <td>{formatDate(step.finishedAt)}</td>
                <td>{step.error ?? 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Artifacts</h3>
        {Object.keys(job.artifacts).length === 0 ? (
          <p className="small">No artifact URLs available yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(job.artifacts).map(([name, url]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <a href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Error Log</h3>
        {job.errors.length === 0 ? (
          <p className="small">No errors recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Step</th>
                <th>Code</th>
                <th>Message</th>
                <th>Operator Hint</th>
              </tr>
            </thead>
            <tbody>
              {job.errors.map((error, idx) => (
                <tr key={`${error.at}-${idx}`}>
                  <td>{formatDate(error.at)}</td>
                  <td>{formatStepName(error.step)}</td>
                  <td>{error.code ?? 'n/a'}</td>
                  <td>{error.message}</td>
                  <td>{error.operatorHint ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
