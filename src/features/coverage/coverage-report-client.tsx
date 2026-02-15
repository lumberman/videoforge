'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSelectedVideosInOrder,
  submitCoverageSelection
} from './submission';
import type {
  CoverageCollection,
  CoverageFilter,
  CoverageLanguageOption,
  CoverageReportType,
  CoverageStatus,
  CoverageSubmitResult,
  CoverageVideo
} from './types';

type CoverageReportClientProps = {
  gatewayConfigured: boolean;
  initialLanguages: CoverageLanguageOption[];
  initialCollections: CoverageCollection[];
  initialSelectedLanguageIds: string[];
  initialErrorMessage: string | null;
};

type LoadState =
  | { type: 'idle' }
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string };

type SubmitState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'done'; result: CoverageSubmitResult }
  | { type: 'error'; message: string };

const DEFAULT_BATCH_OPTIONS = {
  generateVoiceover: false,
  uploadMux: false,
  notifyCms: false
};

function getStatusForReport(
  video: CoverageVideo,
  reportType: CoverageReportType
): CoverageStatus {
  if (reportType === 'subtitles') {
    return video.subtitleStatus;
  }
  if (reportType === 'voiceover') {
    return video.voiceoverStatus;
  }
  return video.metadataStatus;
}

function countVideos(collections: CoverageCollection[]): number {
  return collections.reduce((acc, collection) => acc + collection.videos.length, 0);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function normalizeLanguageIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function CoverageReportClient({
  gatewayConfigured,
  initialLanguages,
  initialCollections,
  initialSelectedLanguageIds,
  initialErrorMessage
}: CoverageReportClientProps) {
  const [languages, setLanguages] = useState<CoverageLanguageOption[]>(initialLanguages);
  const [collections, setCollections] = useState<CoverageCollection[]>(initialCollections);
  const [selectedLanguageIds, setSelectedLanguageIds] = useState<string[]>(
    normalizeLanguageIds(initialSelectedLanguageIds)
  );
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());
  const [reportType, setReportType] = useState<CoverageReportType>('subtitles');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('all');
  const [loadState, setLoadState] = useState<LoadState>(() =>
    initialErrorMessage ? { type: 'error', message: initialErrorMessage } : { type: 'idle' }
  );
  const [submitState, setSubmitState] = useState<SubmitState>({ type: 'idle' });
  const [visibleCollectionCount, setVisibleCollectionCount] = useState(20);

  const skipInitialCollectionsFetch = useRef(true);
  const collectionsAbortRef = useRef<AbortController | null>(null);

  const filteredCollections = useMemo(() => {
    return collections
      .map((collection) => ({
        ...collection,
        videos: collection.videos.filter((video) => {
          const status = getStatusForReport(video, reportType);
          return coverageFilter === 'all' ? true : status === coverageFilter;
        })
      }))
      .filter((collection) => collection.videos.length > 0);
  }, [collections, coverageFilter, reportType]);

  const visibleCollections = useMemo(
    () => filteredCollections.slice(0, visibleCollectionCount),
    [filteredCollections, visibleCollectionCount]
  );

  const selectedCount = selectedVideoIds.size;
  const selectableCount = useMemo(
    () => collections.reduce((acc, collection) => {
      return acc + collection.videos.filter((video) => video.selectable).length;
    }, 0),
    [collections]
  );

  const refreshCollections = useCallback(
    async (languageIds: string[]) => {
      const normalizedLanguageIds = normalizeLanguageIds(languageIds);
      if (!gatewayConfigured) {
        return;
      }

      if (normalizedLanguageIds.length === 0) {
        setCollections([]);
        return;
      }

      collectionsAbortRef.current?.abort();
      const controller = new AbortController();
      collectionsAbortRef.current = controller;

      setLoadState({ type: 'loading', message: 'Loading collections…' });

      try {
        const query = new URLSearchParams({
          languageIds: normalizedLanguageIds.join(',')
        });

        const response = await fetch(`/api/coverage/collections?${query.toString()}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });
        const payload = (await response.json()) as {
          collections?: CoverageCollection[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load coverage collections.');
        }

        setCollections(payload.collections ?? []);
        setLoadState({ type: 'idle' });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          type: 'error',
          message: toErrorMessage(error, 'Unable to load coverage collections.')
        });
      }
    },
    [gatewayConfigured]
  );

  useEffect(() => {
    if (!gatewayConfigured || initialLanguages.length > 0) {
      return;
    }

    const controller = new AbortController();

    (async () => {
      setLoadState({ type: 'loading', message: 'Loading languages…' });

      try {
        const response = await fetch('/api/coverage/languages', {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });
        const payload = (await response.json()) as {
          languages?: CoverageLanguageOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load coverage languages.');
        }

        const nextLanguages = payload.languages ?? [];
        setLanguages(nextLanguages);

        if (selectedLanguageIds.length === 0 && nextLanguages.length > 0) {
          setSelectedLanguageIds([nextLanguages[0].id]);
        }

        setLoadState({ type: 'idle' });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadState({
          type: 'error',
          message: toErrorMessage(error, 'Unable to load coverage languages.')
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [gatewayConfigured, initialLanguages.length, selectedLanguageIds.length]);

  useEffect(() => {
    if (skipInitialCollectionsFetch.current) {
      skipInitialCollectionsFetch.current = false;
      return;
    }

    void refreshCollections(selectedLanguageIds);
  }, [refreshCollections, selectedLanguageIds]);

  useEffect(() => {
    setVisibleCollectionCount(20);
  }, [reportType, coverageFilter, selectedLanguageIds]);

  useEffect(() => {
    return () => {
      collectionsAbortRef.current?.abort();
    };
  }, []);

  const onToggleLanguage = useCallback((languageId: string) => {
    setSelectedVideoIds(new Set());
    setSubmitState({ type: 'idle' });

    setSelectedLanguageIds((current) => {
      if (current.includes(languageId)) {
        return current.filter((id) => id !== languageId);
      }
      return normalizeLanguageIds([...current, languageId]);
    });
  }, []);

  const onToggleVideo = useCallback((videoId: string, checked: boolean) => {
    setSelectedVideoIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(videoId);
      } else {
        next.delete(videoId);
      }
      return next;
    });
  }, []);

  const onSubmitSelection = useCallback(async () => {
    if (submitState.type === 'submitting') {
      return;
    }

    const selectedVideos = getSelectedVideosInOrder(collections, selectedVideoIds);
    if (selectedVideos.length === 0) {
      setSubmitState({ type: 'error', message: 'Select at least one media item before submitting.' });
      return;
    }

    if (selectedLanguageIds.length === 0) {
      setSubmitState({ type: 'error', message: 'Select at least one target language.' });
      return;
    }

    setSubmitState({ type: 'submitting' });

    const result = await submitCoverageSelection({
      selectedVideos,
      languageIds: selectedLanguageIds,
      options: DEFAULT_BATCH_OPTIONS,
      createJob: async (input) => {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            muxAssetId: input.muxAssetId,
            languages: input.languages,
            options: input.options
          })
        });

        const payload = (await response.json()) as { jobId?: string; error?: string };

        if (!response.ok || !payload.jobId) {
          throw new Error(payload.error ?? 'Failed to create job.');
        }

        return { jobId: payload.jobId };
      }
    });

    setSubmitState({ type: 'done', result });
    setSelectedVideoIds(
      new Set(result.items.filter((item) => item.status !== 'created').map((item) => item.mediaId))
    );
  }, [collections, selectedLanguageIds, selectedVideoIds, submitState.type]);

  const onRetryFailed = useCallback(() => {
    if (submitState.type !== 'done') {
      return;
    }

    setSelectedVideoIds(
      new Set(submitState.result.items.filter((item) => item.status === 'failed').map((item) => item.mediaId))
    );
    setSubmitState({ type: 'idle' });
  }, [submitState]);

  const totalVideos = countVideos(collections);
  const filteredVideos = countVideos(filteredCollections);

  return (
    <div className="coverage-root">
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Coverage Reporting</h2>
        <p className="small" style={{ marginTop: 0 }}>
          Select coverage items and create enrichment jobs in deterministic order.
        </p>

        {!gatewayConfigured && (
          <p role="status" className="small" style={{ color: 'var(--warn)' }}>
            Coverage gateway is not configured. Set <code>NEXT_PUBLIC_GATEWAY_URL</code> or{' '}
            <code>NEXT_STAGE_GATEWAY_URL</code>.
          </p>
        )}

        {loadState.type === 'loading' && (
          <p role="status" className="small">
            {loadState.message}
          </p>
        )}

        {loadState.type === 'error' && (
          <p role="status" className="small" style={{ color: 'var(--error)' }}>
            {loadState.message}
          </p>
        )}

        <div className="coverage-controls">
          <div>
            <div className="small">Target languages</div>
            {languages.length === 0 ? (
              <p className="small" style={{ marginTop: 6 }}>
                No languages available.
              </p>
            ) : (
              <div className="coverage-language-pills">
                {languages.map((language) => (
                  <label key={language.id} className="coverage-language-pill">
                    <input
                      type="checkbox"
                      checked={selectedLanguageIds.includes(language.id)}
                      onChange={() => onToggleLanguage(language.id)}
                    />
                    {language.englishLabel}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="coverage-control-row">
            <label>
              <span className="small">Report type</span>{' '}
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value as CoverageReportType)}
              >
                <option value="subtitles">Subtitles</option>
                <option value="voiceover">Voiceover</option>
                <option value="metadata">Metadata</option>
              </select>
            </label>

            <label>
              <span className="small">Coverage filter</span>{' '}
              <select
                value={coverageFilter}
                onChange={(event) => setCoverageFilter(event.target.value as CoverageFilter)}
              >
                <option value="all">All</option>
                <option value="human">Human</option>
                <option value="ai">AI</option>
                <option value="none">Missing</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => refreshCollections(selectedLanguageIds)}
              disabled={selectedLanguageIds.length === 0 || loadState.type === 'loading'}
            >
              Refresh
            </button>
          </div>

          <div className="coverage-summary">
            <div className="coverage-stat">
              <div className="small">Collections</div>
              <strong>{filteredCollections.length}</strong>
            </div>
            <div className="coverage-stat">
              <div className="small">Visible videos</div>
              <strong>
                {filteredVideos}/{totalVideos}
              </strong>
            </div>
            <div className="coverage-stat">
              <div className="small">Selected</div>
              <strong>{selectedCount}</strong>
            </div>
            <div className="coverage-stat">
              <div className="small">Submittable</div>
              <strong>{selectableCount}</strong>
            </div>
          </div>

          <div className="coverage-actions">
            <button
              type="button"
              onClick={() => void onSubmitSelection()}
              disabled={selectedCount === 0 || submitState.type === 'submitting'}
            >
              {submitState.type === 'submitting' ? 'Submitting…' : 'Create jobs for selection'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedVideoIds(new Set())}
              disabled={selectedCount === 0 || submitState.type === 'submitting'}
            >
              Clear selection
            </button>
            {submitState.type === 'done' && submitState.result.failed > 0 && (
              <button type="button" onClick={onRetryFailed}>
                Retry failed subset
              </button>
            )}
          </div>

          {submitState.type === 'error' && (
            <p role="status" className="small" style={{ color: 'var(--error)' }}>
              {submitState.message}
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>Collections</h3>
        {filteredCollections.length === 0 ? (
          <p className="small">No coverage records match the current filters.</p>
        ) : (
          <div className="coverage-collections">
            {visibleCollections.map((collection) => (
              <article key={collection.id} className="coverage-collection">
                <header className="coverage-collection-header">
                  <div>
                    <strong>{collection.title}</strong>
                    <div className="small">
                      {collection.label}
                      {collection.publishedAt ? ` • ${new Date(collection.publishedAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <div className="small">{collection.videos.length} videos</div>
                </header>

                <table className="coverage-video-list">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Video</th>
                      <th>Subtitles</th>
                      <th>Voiceover</th>
                      <th>Metadata</th>
                      <th>Mux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collection.videos.map((video) => (
                      <tr key={video.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedVideoIds.has(video.id)}
                            onChange={(event) => onToggleVideo(video.id, event.target.checked)}
                            disabled={!video.selectable || submitState.type === 'submitting'}
                          />
                        </td>
                        <td>
                          <div className="coverage-video-title">
                            <span>{video.title}</span>
                            {video.watchUrl && (
                              <a href={video.watchUrl} target="_blank" rel="noreferrer" className="small">
                                Watch
                              </a>
                            )}
                          </div>
                          {!video.selectable && (
                            <div className="coverage-select-error">{video.unselectableReason}</div>
                          )}
                        </td>
                        <td>
                          <span className={`coverage-pill coverage-pill-${video.subtitleStatus}`}>
                            {video.subtitleStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`coverage-pill coverage-pill-${video.voiceoverStatus}`}>
                            {video.voiceoverStatus}
                          </span>
                        </td>
                        <td>
                          <span className={`coverage-pill coverage-pill-${video.metadataStatus}`}>
                            {video.metadataStatus}
                          </span>
                        </td>
                        <td>
                          <code>{video.selectable ? video.muxAssetId : 'unmapped'}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}

            {visibleCollectionCount < filteredCollections.length && (
              <div>
                <button
                  type="button"
                  onClick={() => setVisibleCollectionCount((count) => count + 20)}
                >
                  Load more collections
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {submitState.type === 'done' && (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Batch Submit Summary</h3>
          <p className="small">
            Created: {submitState.result.created} • Failed: {submitState.result.failed} • Skipped:{' '}
            {submitState.result.skipped}
          </p>

          <table className="coverage-results-table">
            <thead>
              <tr>
                <th>Media ID</th>
                <th>Status</th>
                <th>Job</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {submitState.result.items.map((item) => (
                <tr key={`${item.mediaId}-${item.status}`}>
                  <td>
                    <code>{item.mediaId}</code>
                  </td>
                  <td>
                    <span className={`badge ${item.status === 'created' ? 'completed' : item.status === 'failed' ? 'failed' : 'skipped'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {item.jobId ? <a href={`/dashboard/jobs/${item.jobId}`}>{item.jobId}</a> : 'n/a'}
                  </td>
                  <td>{item.reason ?? 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
