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
    <main className="jobs-main">
      <div className="report-shell jobs-report-shell">
        <header className="report-header jobs-header">
          <div className="header-brand">
            <Link href="/dashboard/coverage" aria-label="Go to coverage report">
              <img
                src="/jesusfilm-sign.svg"
                alt="Jesus Film Project"
                className="header-logo"
              />
            </Link>
          </div>
          <div className="header-content">
            <div className="header-selectors">
              <span className="control-label control-label--title">Enrichment Queue</span>
              <div className="header-selectors-row">
                <div className="report-control report-control--text">
                  <span className="control-value control-value--static">Job Details</span>
                </div>
              </div>
            </div>
          </div>
          <div className="header-diagram">
            <div className="header-diagram-menu jobs-header-links">
              <Link href="/jobs" className="control-value header-menu-link">
                Back to jobs
              </Link>
              <Link href={`/jobs/${job.id}`} className="control-value header-menu-link">
                Refresh
              </Link>
            </div>
          </div>
        </header>

        <section className="collection-card jobs-card">
          <div className="jobs-card-header jobs-detail-intro">
            <h2 className="jobs-card-title">Job Details</h2>
            <div className="small">
              <code>{job.id}</code>
            </div>
          </div>

          <div className="grid cols-2 jobs-detail-grid">
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

        <section className="collection-card jobs-card">
          <h3 className="jobs-section-title">Step Execution</h3>
          <table className="table jobs-table">
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

        <section className="collection-card jobs-card">
          <h3 className="jobs-section-title">Artifacts</h3>
          {Object.keys(job.artifacts).length === 0 ? (
            <p className="small">No artifact URLs available yet.</p>
          ) : (
            <table className="table jobs-table">
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

        <section className="collection-card jobs-card">
          <h3 className="jobs-section-title">Error Log</h3>
          {job.errors.length === 0 ? (
            <p className="small">No errors recorded.</p>
          ) : (
            <table className="table jobs-table">
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
      </div>
    </main>
  );
}
