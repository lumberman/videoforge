import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { UrlObject } from 'node:url';
import { env } from '@/config/env';
import { getJobById } from '@/data/job-store';
import { formatStepName } from '@/lib/workflow-steps';
import { LiveJobDetailHeader } from '@/features/jobs/live-job-detail-header';
import { fetchCoverageLanguages, resolveCoverageGatewayBaseUrl } from '@/services/coverage-gateway';
import type { JobRecord } from '@/types/job';

export const dynamic = 'force-dynamic';

type SearchParamValue = string | string[] | undefined;

type SearchParamsInput = {
  languageId?: SearchParamValue;
  languageIds?: SearchParamValue;
};

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

function getSingleSearchParam(value: SearchParamValue): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

function parseRequestedLanguageIds(raw: SearchParamValue): string[] {
  const scalar = getSingleSearchParam(raw);
  if (!scalar) return [];
  return [...new Set(scalar.split(',').map((value) => value.trim()).filter(Boolean))];
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function selectPlaybackIdFromAsset(asset: unknown): string | null {
  if (!asset || typeof asset !== 'object') {
    return null;
  }

  const record = asset as { playback_ids?: Array<{ id?: string; policy?: string }> };
  const playbackIds = Array.isArray(record.playback_ids) ? record.playback_ids : [];
  if (playbackIds.length === 0) {
    return null;
  }

  for (const entry of playbackIds) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    const policy = typeof entry?.policy === 'string' ? entry.policy.trim().toLowerCase() : '';
    if (id && policy === 'public') {
      return id;
    }
  }

  for (const entry of playbackIds) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (id) {
      return id;
    }
  }

  return null;
}

async function readPlaybackIdFromMuxUploadArtifact(job: JobRecord): Promise<string | null> {
  if (!job.artifacts.muxUpload) {
    return null;
  }

  const safeJobId = sanitizeSegment(job.id);
  const artifactPath = path.resolve(env.artifactRootPath, safeJobId, 'mux-upload.json');
  try {
    const raw = await readFile(artifactPath, 'utf8');
    const parsed = JSON.parse(raw) as { playbackId?: unknown };
    const playbackId =
      typeof parsed.playbackId === 'string' ? parsed.playbackId.trim() : '';
    return playbackId || null;
  } catch {
    return null;
  }
}

async function readPlaybackIdFromMuxAsset(job: JobRecord): Promise<string | null> {
  const tokenId = env.muxTokenId.trim();
  const tokenSecret = env.muxTokenSecret.trim();
  if (!tokenId || !tokenSecret) {
    return null;
  }

  try {
    const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
    const response = await fetch(
      `https://api.mux.com/video/v1/assets/${encodeURIComponent(job.muxAssetId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Basic ${auth}`
        },
        cache: 'no-store'
      }
    );
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: unknown };
    return selectPlaybackIdFromAsset(payload.data);
  } catch {
    return null;
  }
}

async function resolveMuxPlaybackId(job: JobRecord): Promise<string | null> {
  const fromArtifact = await readPlaybackIdFromMuxUploadArtifact(job);
  if (fromArtifact) {
    return fromArtifact;
  }

  return readPlaybackIdFromMuxAsset(job);
}

export default async function JobDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParamsInput>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLanguageIds = parseRequestedLanguageIds(
    resolvedSearchParams?.languageIds ?? resolvedSearchParams?.languageId
  );
  const sharedQuery =
    requestedLanguageIds.length > 0
      ? { languageId: requestedLanguageIds.join(',') }
      : undefined;
  const coverageReportHref: UrlObject = { pathname: '/dashboard/coverage', query: sharedQuery };
  const jobsQueueHref: UrlObject = { pathname: '/jobs', query: sharedQuery };

  const { id } = await params;
  const job = await getJobById(id);

  if (!job) {
    notFound();
  }

  const muxPlaybackId = await resolveMuxPlaybackId(job);

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
  return (
    <main className="jobs-main">
      <div className="report-shell jobs-report-shell">
        <header className="report-header jobs-header">
          <div className="header-brand">
            <Link href={coverageReportHref} aria-label="Go to coverage report">
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
                <Link href={jobsQueueHref} className="header-nav-link jobs-back-link">
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
              <Link href={coverageReportHref} className="header-nav-link">
                <span className="header-nav-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                    <path d="M1.5 8c1.8-3 4-4.5 6.5-4.5S12.7 5 14.5 8c-1.8 3-4 4.5-6.5 4.5S3.3 11 1.5 8z" />
                    <circle cx="8" cy="8" r="2.1" />
                  </svg>
                </span>
                <span>Report</span>
              </Link>
              <Link href={jobsQueueHref} className="header-nav-link is-active" aria-current="page">
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

        <LiveJobDetailHeader
          initialJob={job}
          languageLabelsById={languageLabelsById}
          muxPlaybackId={muxPlaybackId}
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
