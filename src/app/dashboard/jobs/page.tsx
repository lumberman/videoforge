import React from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { listJobs } from '@/data/job-store';
import { getRuntimeWarnings } from '@/config/env';
import { formatStepName } from '@/lib/workflow-steps';
import { NewJobForm } from './new-job-form';
import type { JobRecord } from '@/types/job';
import { fetchCoverageLanguages, resolveCoverageGatewayBaseUrl } from '@/services/coverage-gateway';

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

type JobItem = Awaited<ReturnType<typeof listJobs>>[number];
type LanguageBadge = { key: string; text: string };

const LANGUAGE_FLAG_BY_CODE: Record<string, string> = {
  ar: '🇸🇦',
  de: '🇩🇪',
  en: '🇺🇸',
  es: '🇪🇸',
  fa: '🇮🇷',
  fi: '🇫🇮',
  fr: '🇫🇷',
  he: '🇮🇱',
  hi: '🇮🇳',
  id: '🇮🇩',
  it: '🇮🇹',
  ja: '🇯🇵',
  ko: '🇰🇷',
  nl: '🇳🇱',
  no: '🇳🇴',
  pl: '🇵🇱',
  pt: '🇧🇷',
  ru: '🇷🇺',
  sv: '🇸🇪',
  th: '🇹🇭',
  tr: '🇹🇷',
  uk: '🇺🇦',
  vi: '🇻🇳',
  zh: '🇨🇳'
};

function formatTime(iso?: string): string {
  if (!iso) {
    return 'n/a';
  }
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

function formatDayLabel(date: Date, includeYear: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {})
  }).format(date);
}

function groupJobsByDay(jobs: JobItem[]): Array<{
  dayKey: string;
  dayLabel: string;
  jobs: JobItem[];
}> {
  const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const grouped = new Map<string, { date: Date; jobs: JobItem[] }>();

  for (const job of jobs) {
    const createdDate = new Date(job.createdAt);
    const dayKey = dayKeyFormatter.format(createdDate);
    const existing = grouped.get(dayKey);
    if (existing) {
      existing.jobs.push(job);
      continue;
    }
    grouped.set(dayKey, {
      date: createdDate,
      jobs: [job]
    });
  }
  const groups = Array.from(grouped.entries()).map(([dayKey, value]) => ({
    dayKey,
    date: value.date,
    jobs: value.jobs
  }));

  return groups.map((group, index) => {
    const previous = groups[index - 1]?.date;
    const next = groups[index + 1]?.date;
    const year = group.date.getFullYear();
    const month = group.date.getMonth();
    const isYearBoundary =
      (previous && previous.getFullYear() !== year) || (next && next.getFullYear() !== year);
    const includeYear = Boolean(isYearBoundary && (month === 11 || month === 0));

    return {
      dayKey: group.dayKey,
      dayLabel: formatDayLabel(group.date, includeYear),
      jobs: group.jobs
    };
  });
}

function normalizeLanguageLabel(
  value: string,
  languageLabelsById: ReadonlyMap<string, string>
): string {
  const clean = value.trim();
  if (!clean) return '';
  const resolvedLabel = languageLabelsById.get(clean);
  if (resolvedLabel) return resolvedLabel;
  if (/^[a-z]{2,3}(-[a-z]{2})?$/i.test(clean)) {
    return clean.split('-')[0].toUpperCase();
  }
  if (/^[A-Z]{2,4}$/.test(clean) || /^\d+$/.test(clean)) {
    return clean;
  }
  return clean;
}

function inferLanguageCode(rawValue: string, label: string): string | null {
  const raw = rawValue.trim().toLowerCase();
  const match = raw.match(/^([a-z]{2,3})(?:-[a-z]{2})?$/i);
  if (match?.[1]) {
    return match[1].slice(0, 2).toLowerCase();
  }

  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedLabel) return null;
  if (normalizedLabel.includes('arabic')) return 'ar';
  if (normalizedLabel.includes('chinese')) return 'zh';
  if (normalizedLabel.includes('dutch')) return 'nl';
  if (normalizedLabel.includes('english')) return 'en';
  if (normalizedLabel.includes('farsi') || normalizedLabel.includes('persian')) return 'fa';
  if (normalizedLabel.includes('finnish')) return 'fi';
  if (normalizedLabel.includes('french')) return 'fr';
  if (normalizedLabel.includes('german')) return 'de';
  if (normalizedLabel.includes('hebrew')) return 'he';
  if (normalizedLabel.includes('hindi')) return 'hi';
  if (normalizedLabel.includes('indonesian')) return 'id';
  if (normalizedLabel.includes('italian')) return 'it';
  if (normalizedLabel.includes('japanese')) return 'ja';
  if (normalizedLabel.includes('korean')) return 'ko';
  if (normalizedLabel.includes('norwegian')) return 'no';
  if (normalizedLabel.includes('polish')) return 'pl';
  if (normalizedLabel.includes('portuguese')) return 'pt';
  if (normalizedLabel.includes('russian')) return 'ru';
  if (normalizedLabel.includes('spanish')) return 'es';
  if (normalizedLabel.includes('swedish')) return 'sv';
  if (normalizedLabel.includes('thai')) return 'th';
  if (normalizedLabel.includes('turkish')) return 'tr';
  if (normalizedLabel.includes('ukrainian')) return 'uk';
  if (normalizedLabel.includes('vietnamese')) return 'vi';
  return null;
}

function getLanguageBadges(
  job: JobRecord,
  languageLabelsById: ReadonlyMap<string, string>
): LanguageBadge[] {
  const source = job.requestedLanguageAbbreviations?.length
    ? job.requestedLanguageAbbreviations
    : job.languages;
  const badges: LanguageBadge[] = [];
  const seen = new Set<string>();
  for (const value of source) {
    const label = normalizeLanguageLabel(value, languageLabelsById);
    if (!label) continue;
    const code = inferLanguageCode(value, label);
    const flag = code ? LANGUAGE_FLAG_BY_CODE[code] : '';
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    badges.push({
      key,
      text: flag ? `${flag} ${label}` : label
    });
  }
  return badges;
}

function getSourceTitle(job: JobRecord): string {
  const collectionTitle = job.sourceCollectionTitle?.trim();
  if (collectionTitle) return collectionTitle;
  const mediaTitle = job.sourceMediaTitle?.trim();
  if (mediaTitle) return mediaTitle;
  return 'Untitled source';
}

function getProgressSummary(job: JobRecord): string {
  if (job.status === 'completed') {
    return 'Completed';
  }

  const failedStep = job.steps.find((step) => step.status === 'failed');
  if (job.status === 'failed') {
    return `Failed at ${formatStepName(failedStep?.name ?? job.currentStep ?? 'transcription')}`;
  }

  if (job.status === 'running') {
    return `In progress at ${formatStepName(job.currentStep ?? 'download_video')}`;
  }

  return 'Queued';
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
  const groupedJobs = groupJobsByDay(jobs);
  const languageLabelsById = new Map<string, string>();
  const coverageBaseUrl = resolveCoverageGatewayBaseUrl();
  if (coverageBaseUrl) {
    try {
      const languages = await fetchCoverageLanguages(coverageBaseUrl);
      for (const language of languages) {
        languageLabelsById.set(language.id, language.englishLabel);
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

        <section className="collection-card jobs-card">
          <div className="jobs-card-header">
            <h2 className="jobs-card-title">Jobs</h2>
            <Link href="/jobs" className="collection-cache-clear jobs-refresh-link">
              <RefreshCw className="icon" aria-hidden="true" />
              Refresh
            </Link>
          </div>

          {jobs.length === 0 ? (
            <p className="small">No jobs yet. Create one to start the workflow.</p>
          ) : (
            <div className="jobs-day-groups">
              {groupedJobs.map((group) => (
                <section key={group.dayKey} className="jobs-day-group">
                  <h3 className="jobs-day-heading">{group.dayLabel}</h3>
                  <div className="jobs-table-wrap">
                    <table className="table jobs-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Source</th>
                          <th>Languages</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.jobs.map((job) => {
                          const latestError =
                            job.status === 'failed' ? (job.errors.at(-1)?.message ?? 'Failed') : null;
                          const languageBadges = getLanguageBadges(job, languageLabelsById);
                          const visibleLanguageBadges = languageBadges.slice(0, 6);
                          const hiddenLanguageCount = Math.max(0, languageBadges.length - 6);

                          return (
                            <React.Fragment key={job.id}>
                              <tr className={latestError ? 'jobs-row-with-issue' : undefined}>
                                <td>{formatTime(job.createdAt)}</td>
                                <td className="jobs-source-cell">
                                  <span className="jobs-source-title" title={getSourceTitle(job)}>
                                    {getSourceTitle(job)}
                                  </span>
                                </td>
                                <td>
                                  {languageBadges.length === 0 ? (
                                    <span className="jobs-no-issue">none</span>
                                  ) : (
                                    <div
                                      className="jobs-language-badges"
                                      title={languageBadges.map((badge) => badge.text).join(', ')}
                                    >
                                      {visibleLanguageBadges.map((badge) => (
                                        <span key={`${job.id}-${badge.key}`} className="jobs-language-badge">
                                          {badge.text}
                                        </span>
                                      ))}
                                      {hiddenLanguageCount > 0 && (
                                        <span className="jobs-language-badge jobs-language-badge-muted">
                                          +{hiddenLanguageCount}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div className="jobs-progress-cell">
                                    <div className="jobs-progress-track">
                                      {job.steps.map((step) => (
                                        <span
                                          key={`${job.id}-${step.name}`}
                                          className={`jobs-step-dot jobs-step-dot-${step.status}`}
                                          title={formatStepName(step.name)}
                                          aria-label={formatStepName(step.name)}
                                        >
                                          {step.status === 'completed'
                                            ? '✓'
                                            : step.status === 'failed'
                                              ? '×'
                                              : step.status === 'skipped'
                                                ? '−'
                                                : step.status === 'running'
                                                  ? '•'
                                                  : ''}
                                        </span>
                                      ))}
                                    </div>
                                    <p
                                      className={`jobs-progress-summary jobs-progress-summary-${job.status}`}
                                    >
                                      {getProgressSummary(job)}
                                    </p>
                                    <Link href={`/jobs/${job.id}`} className="jobs-open-link">
                                      Open
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                              {latestError && (
                                <tr className="jobs-issue-row">
                                  <td aria-hidden="true" />
                                  <td colSpan={3}>
                                    <p className="jobs-error-text" title={latestError}>
                                      {latestError}
                                    </p>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
