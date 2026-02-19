import React from 'react';
import Link from 'next/link';
import { listJobs } from '@/data/job-store';
import { getRuntimeWarnings } from '@/config/env';
import { NewJobForm } from './new-job-form';
import { fetchCoverageLanguages, resolveCoverageGatewayBaseUrl } from '@/services/coverage-gateway';
import { LiveJobsTable } from '@/features/jobs/live-jobs-table';

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

async function resolveSearchParams(
  searchParams?: Promise<SearchParamsInput>
): Promise<SearchParamsInput> {
  if (!searchParams) return {};
  return await searchParams;
}

function getSingleSearchParam(value: SearchParamValue): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function parseNonNegativeInteger(value: SearchParamValue): number | null {
  const scalar = getSingleSearchParam(value);
  if (!scalar) return null;
  if (!/^\d+$/.test(scalar)) return null;

  const parsed = Number(scalar);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;

  return parsed;
}

function parseCoverageQueueFlash(searchParams: SearchParamsInput): CoverageQueueFlash | null {
  const source = getSingleSearchParam(searchParams.from);
  if (source !== 'coverage') return null;

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
  const languageLabelsById: Record<string, string> = {};
  const coverageBaseUrl = resolveCoverageGatewayBaseUrl();
  if (coverageBaseUrl) {
    try {
      const languages = await fetchCoverageLanguages(coverageBaseUrl);
      for (const language of languages) {
        languageLabelsById[language.id] = language.englishLabel;
      }
    } catch {
      // Keep rendering the jobs page even when coverage language labels are unavailable.
    }
  }
  const warnings = getRuntimeWarnings();

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
                  <span className="control-value control-value--static">Jobs</span>
                </div>
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

        {warnings.length > 0 && (
          <section className="report-error jobs-panel-warning">
            <strong>Runtime warnings</strong>
            <ul className="small">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

        {coverageQueueFlash && (
          <section className="report-error report-error--success" role="status" aria-live="polite">
            <strong>Coverage submission complete</strong>
            <p className="small jobs-flash-copy">
              Created: {coverageQueueFlash.created} · Failed: {coverageQueueFlash.failed} · Skipped:{' '}
              {coverageQueueFlash.skipped}
            </p>
          </section>
        )}

        <NewJobForm />

        <LiveJobsTable initialJobs={jobs} languageLabelsById={languageLabelsById} />
      </div>
    </main>
  );
}
