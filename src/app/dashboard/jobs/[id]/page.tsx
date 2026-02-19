import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJobById } from '@/data/job-store';
import { formatStepName } from '@/lib/workflow-steps';
import { LiveJobStepsTable } from '@/features/jobs/live-job-steps-table';
import { getLanguageBadges } from '@/features/jobs/jobs-table-presenter';
import { fetchCoverageLanguages, resolveCoverageGatewayBaseUrl } from '@/services/coverage-gateway';

export const dynamic = 'force-dynamic';

function formatDate(iso?: string): string {
  if (!iso) {
    return '–';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '–';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

function formatCompletionDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) {
    return '–';
  }

  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return '–';
  }

  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (totalSeconds < 60) {
    return `Completed in ${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `Completed in ${minutes}m ${seconds}s` : `Completed in ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `Completed in ${hours}h ${remainingMinutes}m`
    : `Completed in ${hours}h`;
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

  const languageLabelsById: Record<string, string> = {};
  const coverageBaseUrl = resolveCoverageGatewayBaseUrl();
  if (coverageBaseUrl) {
    try {
      const languages = await fetchCoverageLanguages(coverageBaseUrl);
      for (const language of languages) {
        languageLabelsById[language.id] = language.englishLabel;
      }
    } catch {
      // Keep rendering page even when language labels are unavailable.
    }
  }
  const languageBadges = getLanguageBadges(job, new Map<string, string>(Object.entries(languageLabelsById)));

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
                <Link href="/jobs" className="header-nav-link jobs-back-link">
                  <span className="header-nav-link-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                      <path d="M8 3L3 8l5 5M4 8h9" />
                    </svg>
                  </span>
                  <span>Back to jobs</span>
                </Link>
              </div>
            </div>
          </div>
          <div className="header-diagram">
            <div className="header-diagram-menu header-nav-tabs">
              <Link href="/dashboard/coverage" className="header-nav-link">
                <span className="header-nav-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                    <path d="M1.5 8c1.8-3 4-4.5 6.5-4.5S12.7 5 14.5 8c-1.8 3-4 4.5-6.5 4.5S3.3 11 1.5 8z" />
                    <circle cx="8" cy="8" r="2.1" />
                  </svg>
                </span>
                <span>Report</span>
              </Link>
              <Link href="/jobs" className="header-nav-link is-active" aria-current="page">
                <span className="header-nav-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                    <path d="M3 4h6M3 8h10M3 12h8" />
                  </svg>
                </span>
                <span>Queue</span>
              </Link>
            </div>
          </div>
        </header>

        <section className="collection-card jobs-card jobs-summary-card">
          <div className="grid cols-2 jobs-detail-grid">
            <div>
              <div className="small">Status</div>
              <div className="jobs-summary-status-row">
                <span className={`badge ${job.status} jobs-summary-status-badge`}>{job.status}</span>
                <span className="jobs-summary-retries-pill" title={`Retries: ${job.retries}`}>
                  {job.retries} retries
                </span>
                {job.errors.length > 0 ? (
                  <a href="#error-log" className="jobs-error-log-link">
                    Error log
                  </a>
                ) : null}
              </div>
            </div>
            <div>
              <div className="small">Created</div>
              <div>{formatDate(job.createdAt)}</div>
            </div>
            <div>
              <div className="small">Completed</div>
              <div>{formatCompletionDuration(job.createdAt, job.completedAt)}</div>
            </div>
            <div>
              <div className="small">Languages</div>
              {languageBadges.length > 0 ? (
                <div
                  className="jobs-language-badges"
                  title={languageBadges.map((badge) => badge.text).join(', ')}
                >
                  {languageBadges.map((badge) => (
                    <span key={`${job.id}-${badge.key}`} className="jobs-language-badge">
                      {badge.text}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="jobs-no-issue">none</span>
              )}
            </div>
          </div>
        </section>

        <LiveJobStepsTable
          initialJob={job}
          headingMeta={<code className="jobs-step-job-id">{job.id}</code>}
        />

        <section className="collection-card jobs-card jobs-error-card" id="error-log">
          <div className="jobs-card-header jobs-error-header">
            <h3 className="jobs-section-title">Error Log</h3>
            <span className="jobs-error-count">{job.errors.length}</span>
          </div>
          {job.errors.length === 0 ? (
            <p className="small">No errors recorded.</p>
          ) : (
            <div className="jobs-table-wrap">
              <table className="table jobs-table jobs-error-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Step</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {job.errors.map((error, idx) => (
                    <React.Fragment key={`${error.at}-${idx}`}>
                      <tr className="jobs-error-primary-row">
                        <td>{formatDate(error.at)}</td>
                        <td>{formatStepName(error.step)}</td>
                        <td>
                          {error.code ? <code className="jobs-error-code">{error.code}</code> : '–'}
                        </td>
                      </tr>
                      <tr className="jobs-error-secondary-row">
                        <td colSpan={3}>
                          <p className="jobs-error-message">{error.message}</p>
                          <p className="jobs-error-hint">
                            {error.operatorHint ?? '–'}
                          </p>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
