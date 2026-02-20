'use client';

import Link from 'next/link';
import type { UrlObject } from 'node:url';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FilterX,
  Languages,
  RefreshCw,
  XCircle
} from 'lucide-react'

import { LanguageGeoSelector } from './LanguageGeoSelector'
import {
  buildCoverageJobsQueueUrl,
  getSelectedVideosInOrder,
  shouldRedirectToJobsQueueAfterCoverageSubmit,
  submitCoverageSelection
} from './submission';
import {
  estimateCoverageTranslateCostUsd,
  formatEstimatedUsd
} from './estimate-cost';
import type { CoverageSubmitResult, CoverageVideo } from './types';

type CoverageStatus = 'human' | 'ai' | 'none'

type CoverageFilter = 'all' | CoverageStatus

type ReportType = 'subtitles' | 'voiceover' | 'meta'

type MetaCompleteness = {
  tags: boolean
  description: boolean
  title: boolean
  questions: boolean
  bibleQuotes: boolean
  completed: number
  total: number
}

type ClientVideo = {
  id: string
  title: string
  subtitleStatus: CoverageStatus
  voiceoverStatus: CoverageStatus
  metadataStatus: CoverageStatus
  metaStatus: CoverageStatus
  meta: MetaCompleteness
  thumbnailUrl: string | null
  watchUrl: string | null
} & CoverageVideo

type ClientCollection = {
  id: string
  title: string
  label: string
  labelDisplay: string
  publishedAt: string | null
  videos: ClientVideo[]
}

type LanguageOption = {
  id: string
  englishLabel: string
  nativeLabel: string
}

interface CoverageReportClientProps {
  gatewayConfigured: boolean;
  initialErrorMessage: string | null;
  initialCollections: Array<{
    id: string;
    title: string;
    label: string;
    labelDisplay?: string;
    publishedAt: string | null;
    videos: CoverageVideo[];
  }>;
  initialSelectedLanguageIds: string[];
  initialLanguages: LanguageOption[];
}

type Mode = 'explore' | 'select'

type HoveredVideoDetails = {
  video: ClientVideo
  collectionTitle: string
  status: CoverageStatus
}

type SubmitState =
  | { type: 'idle' }
  | { type: 'submitting' }
  | { type: 'done'; result: CoverageSubmitResult }
  | { type: 'error'; message: string; details?: string[]; nonce: number };

type SubmitFeedbackTone = 'neutral' | 'success' | 'error'

type SubmitFeedback = {
  tone: SubmitFeedbackTone
  message: string
  details?: string[]
  nonce?: number
}

type VideoQaDebugState = {
  video: ClientVideo
  collectionTitle: string | null
}

type VideoJobDebugPayload = {
  media: {
    id: string
    title: string
    collectionTitle: string | null
    subtitleStatus: CoverageStatus
    voiceoverStatus: CoverageStatus
    metadataStatus: CoverageStatus
    metaStatus: CoverageStatus
    meta: MetaCompleteness
    durationSeconds: number | null
    thumbnailUrl: string | null
    watchUrl: string | null
  }
  mapping: {
    selectable: boolean
    muxAssetId: string | null
    unselectableReason: string | null
    selectedLanguages: string[]
    options: {
      generateVoiceover: false
      uploadMux: false
      notifyCms: false
    }
    willCreateJob: boolean
    skipReason: string | null
    createJobPayload: {
      muxAssetId: string
      languages: string[]
      options: {
        generateVoiceover: false
        uploadMux: false
        notifyCms: false
      }
    } | null
  }
}

function toLanguageAbbreviation(label: string, fallbackId: string): string {
  const normalized = label.trim();
  if (!normalized) return fallbackId.toUpperCase().slice(0, 4);

  const words = normalized
    .replace(/[()[\],]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length === 0) return fallbackId.toUpperCase().slice(0, 4);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

type CoverageJobsQueueRedirectInput = {
  submitState: SubmitState
  hasRedirected: boolean
}

const VIDEO_LABEL_DISPLAY: Record<string, string> = {
  collection: 'Collection',
  featureFilm: 'Feature Film',
  series: 'Series',
  episode: 'Episode',
  trailer: 'Trailer',
  behindTheScenes: 'Behind the scenes'
};

const SESSION_MODE_KEY = 'ai-media-coverage-mode'
const SESSION_REPORT_KEY = 'ai-media-coverage-report'
const SESSION_LANGUAGE_IDS_KEY = 'ai-media-coverage-language-ids'
const COLLECTIONS_PER_BATCH = 200

export function buildCoverageUrlWithoutRefresh(currentHref: string): string | null {
  const currentUrl = new URL(currentHref)
  if (!currentUrl.searchParams.has('refresh')) {
    return null
  }

  currentUrl.searchParams.delete('refresh')
  const query = currentUrl.searchParams.toString()
  return `${currentUrl.pathname}${query ? `?${query}` : ''}${currentUrl.hash}`
}

export function buildCoverageUrlWithStoredLanguageSelection(input: {
  currentHref: string
  storedLanguageIds: string[]
  availableLanguageIds: string[]
}): string | null {
  const currentUrl = new URL(input.currentHref)
  const hasLanguageParam =
    currentUrl.searchParams.has('languageId') ||
    currentUrl.searchParams.has('languageIds')
  if (hasLanguageParam) {
    return null
  }

  const availableSet = new Set(
    input.availableLanguageIds.map((value) => value.trim()).filter(Boolean)
  )
  const restoreLanguageIds = [
    ...new Set(
      input.storedLanguageIds.map((value) => value.trim()).filter(Boolean)
    )
  ].filter((id) => availableSet.has(id))

  if (restoreLanguageIds.length === 0) {
    return null
  }

  currentUrl.searchParams.set('languageId', restoreLanguageIds.join(','))
  const query = currentUrl.searchParams.toString()
  return `${currentUrl.pathname}${query ? `?${query}` : ''}${currentUrl.hash}`
}

export function getCoverageJobsQueueRedirectUrl({
  submitState,
  hasRedirected
}: CoverageJobsQueueRedirectInput): string | null {
  if (hasRedirected) {
    return null
  }

  if (submitState.type !== 'done') {
    return null
  }

  if (!shouldRedirectToJobsQueueAfterCoverageSubmit(submitState.result)) {
    return null
  }

  return buildCoverageJobsQueueUrl({
    created: submitState.result.created,
    failed: submitState.result.failed,
    skipped: submitState.result.skipped
  })
}

export function buildCoverageSubmitFeedback(
  submitState: SubmitState
): SubmitFeedback | null {
  if (submitState.type === 'idle') {
    return null
  }

  if (submitState.type === 'submitting') {
    return {
      tone: 'neutral',
      message: 'Submitting translation jobs...'
    }
  }

  if (submitState.type === 'error') {
    return {
      tone: 'error',
      message: submitState.message,
      details: submitState.details,
      nonce: submitState.nonce
    }
  }

  const { created, failed, skipped } = submitState.result

  if (created > 0) {
    if (failed > 0 || skipped > 0) {
      return {
        tone: 'success',
        message: `Queued ${created} job${created === 1 ? '' : 's'}. Failed: ${failed}. Skipped: ${skipped}. Redirecting to queue...`
      }
    }

    return {
      tone: 'success',
      message: `Queued ${created} job${created === 1 ? '' : 's'}. Redirecting to queue...`
    }
  }

  const firstFailureReason = submitState.result.items.find(
    (item) => item.status === 'failed' && item.reason
  )?.reason
  const firstSkipReason = submitState.result.items.find(
    (item) => item.status === 'skipped' && item.reason
  )?.reason
  const reason = firstFailureReason ?? firstSkipReason

  const errorDetails = submitState.result.items
    .filter((item) => item.status !== 'created')
    .map((item) => {
      const outcomeLabel = item.status === 'failed' ? 'FAILED' : 'SKIPPED'
      const muxLabel = item.muxAssetId ? ` · muxAssetId: ${item.muxAssetId}` : ''
      const reasonLabel = item.reason ?? 'No reason provided.'
      return `${outcomeLabel} · ${item.title} (${item.mediaId})${muxLabel} · ${reasonLabel}`
    })

  return {
    tone: 'error',
    message: reason
      ? `No jobs were queued. Failed: ${failed}. Skipped: ${skipped}. ${reason}`
      : `No jobs were queued. Failed: ${failed}. Skipped: ${skipped}.`,
    details: errorDetails
  }
}

export function buildVideoJobDebugPayload(
  video: ClientVideo,
  selectedLanguageIds: string[],
  collectionTitle: string | null
): VideoJobDebugPayload {
  const options = {
    generateVoiceover: false as const,
    uploadMux: false as const,
    notifyCms: false as const
  }
  const willCreateJob =
    video.selectable && Boolean(video.muxAssetId) && selectedLanguageIds.length > 0
  const skipReason = !video.selectable
    ? video.unselectableReason ?? 'Video is marked non-selectable.'
    : !video.muxAssetId
      ? 'Missing muxAssetId mapping.'
      : selectedLanguageIds.length === 0
        ? 'No selected languages.'
        : null

  return {
    media: {
      id: video.id,
      title: video.title,
      collectionTitle,
      subtitleStatus: video.subtitleStatus,
      voiceoverStatus: video.voiceoverStatus,
      metadataStatus: video.metadataStatus,
      metaStatus: video.metaStatus,
      meta: video.meta,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      watchUrl: video.watchUrl
    },
    mapping: {
      selectable: video.selectable,
      muxAssetId: video.muxAssetId,
      unselectableReason: video.unselectableReason,
      selectedLanguages: selectedLanguageIds,
      options,
      willCreateJob,
      skipReason,
      createJobPayload:
        willCreateJob && video.muxAssetId
          ? {
              muxAssetId: video.muxAssetId,
              languages: selectedLanguageIds,
              options
            }
          : null
    }
  }
}

export function getSelectableVideoIdsForSelection(
  videos: Array<{ id: string; selectable: boolean }>
): string[] {
  return videos
    .filter((video) => video.selectable)
    .map((video) => video.id)
}

export function buildUnselectableVideoSubmitError(
  video: {
    id: string
    title: string
    unselectableReason: string | null
  }
): Extract<SubmitState, { type: 'error' }> {
  const reason =
    video.unselectableReason ?? 'Missing muxAssetId mapping for this item.'
  return {
    type: 'error',
    message: "This item is not uploaded to Mux and can't be processed.",
    details: [`${video.title} (${video.id}) · ${reason}`],
    nonce: Date.now()
  }
}

function defaultMetaForStatus(status: CoverageStatus): MetaCompleteness {
  if (status === 'human') {
    return {
      tags: true,
      description: true,
      title: true,
      questions: true,
      bibleQuotes: true,
      completed: 5,
      total: 5
    };
  }

  if (status === 'ai') {
    return {
      tags: true,
      description: true,
      title: true,
      questions: false,
      bibleQuotes: false,
      completed: 3,
      total: 5
    };
  }

  return {
    tags: false,
    description: false,
    title: false,
    questions: false,
    bibleQuotes: false,
    completed: 0,
    total: 5
  };
}

function normalizeCollectionLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'Collection';
  }
  return VIDEO_LABEL_DISPLAY[normalized] ?? normalized;
}

function normalizeCollections(
  collections: CoverageReportClientProps['initialCollections']
): ClientCollection[] {
  return collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    label: collection.label,
    labelDisplay: collection.labelDisplay ?? normalizeCollectionLabel(collection.label),
    publishedAt: collection.publishedAt,
    videos: collection.videos.map((video) => {
      const maybeMetaStatus = (video as CoverageVideo & { metaStatus?: CoverageStatus }).metaStatus
      const metaStatus = maybeMetaStatus ?? video.metadataStatus
      const maybeMeta = (video as CoverageVideo & { meta?: MetaCompleteness }).meta
      const meta = maybeMeta ?? defaultMetaForStatus(metaStatus)

      if (video.selectable) {
        return {
          id: video.id,
          title: video.title,
          subtitleStatus: video.subtitleStatus,
          voiceoverStatus: video.voiceoverStatus,
          metadataStatus: video.metadataStatus,
          thumbnailUrl: video.thumbnailUrl,
          watchUrl: video.watchUrl,
          durationSeconds: video.durationSeconds,
          selectable: true,
          muxAssetId: video.muxAssetId,
          unselectableReason: null,
          metaStatus,
          meta
        }
      }

      return {
        id: video.id,
        title: video.title,
        subtitleStatus: video.subtitleStatus,
        voiceoverStatus: video.voiceoverStatus,
        metadataStatus: video.metadataStatus,
        thumbnailUrl: video.thumbnailUrl,
        watchUrl: video.watchUrl,
        durationSeconds: video.durationSeconds,
        selectable: false,
        muxAssetId: null,
        unselectableReason:
          video.unselectableReason ?? 'Missing muxAssetId mapping.',
        metaStatus,
        meta
      }
    })
  }));
}

const REPORT_CONFIG: Record<
  ReportType,
  {
    label: string
    description: string
    ariaLabel: string
    hintExplore: string
    hintSelect?: string
    segmentLabels: Record<CoverageStatus, string>
    statusLabels: Record<CoverageStatus, string>
    legendLabels: Record<CoverageStatus, string>
  }
> = {
  subtitles: {
    label: 'Subtitles',
    description: 'Subtitle coverage for the selected language.',
    ariaLabel: 'Subtitle coverage',
    hintExplore: 'Explore subtitle coverage across video collections.',
    hintSelect: 'Select videos for translation.',
    segmentLabels: {
      human: 'Verified',
      ai: 'AI',
      none: 'None'
    },
    statusLabels: {
      human: 'Verified subtitles',
      ai: 'AI subtitles',
      none: 'None'
    },
    legendLabels: {
      human: 'Verified subtitles',
      ai: 'AI subtitles',
      none: 'None'
    }
  },
  voiceover: {
    label: 'Audio',
    description: 'Audio coverage for the selected language.',
    ariaLabel: 'Audio coverage',
    hintExplore: 'Explore audio coverage across video collections.',
    segmentLabels: {
      human: 'Verified',
      ai: 'AI',
      none: 'None'
    },
    statusLabels: {
      human: 'Verified audio',
      ai: 'AI voiceover',
      none: 'None'
    },
    legendLabels: {
      human: 'Verified audio',
      ai: 'AI voiceover',
      none: 'None'
    }
  },
  meta: {
    label: 'Meta',
    description: 'Metadata completeness for each video.',
    ariaLabel: 'Metadata coverage',
    hintExplore: 'Explore metadata completeness across video collections.',
    segmentLabels: {
      human: 'Complete',
      ai: 'Partial',
      none: 'None'
    },
    statusLabels: {
      human: 'Complete meta',
      ai: 'Partial meta',
      none: 'None'
    },
    legendLabels: {
      human: 'Complete meta',
      ai: 'Partial meta',
      none: 'None'
    }
  }
}

function useSessionMode(initial: Mode): [Mode, (value: Mode) => void] {
  const [mode, setMode] = useState<Mode>(initial)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.sessionStorage.getItem(SESSION_MODE_KEY)
      if (stored === 'explore' || stored === 'select') {
        setMode(stored)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const updateMode = useCallback((value: Mode) => {
    setMode(value)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(SESSION_MODE_KEY, value)
    } catch {
      // ignore storage errors
    }
  }, [])

  return [mode, updateMode]
}

function useSessionReportType(
  initial: ReportType
): [ReportType, (value: ReportType) => void] {
  const [reportType, setReportType] = useState<ReportType>(initial)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.sessionStorage.getItem(SESSION_REPORT_KEY)
      if (stored === 'subtitles' || stored === 'voiceover' || stored === 'meta') {
        setReportType(stored)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const updateReportType = useCallback((value: ReportType) => {
    setReportType(value)
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(SESSION_REPORT_KEY, value)
    } catch {
      // ignore storage errors
    }
  }, [])

  return [reportType, updateReportType]
}

function formatPercent(count: number, total: number): number {
  if (total === 0) return 0
  return Math.round((count / total) * 100)
}

function CoverageBar({
  counts,
  activeFilter,
  onFilter,
  onSelectStatus,
  mode,
  labels,
  ariaLabel
}: {
  counts: { human: number; ai: number; none: number }
  activeFilter: CoverageFilter
  onFilter: (filter: CoverageFilter) => void
  onSelectStatus?: (status: CoverageStatus) => void
  mode: Mode
  labels: Record<CoverageStatus, string>
  ariaLabel: string
}) {
  const total = counts.human + counts.ai + counts.none
  const segments: Array<{
    key: CoverageStatus
    label: string
    percent: number
    className: string
  }> = [
    {
      key: 'human',
      label: labels.human,
      percent: formatPercent(counts.human, total),
      className: 'stat-segment--human'
    },
    {
      key: 'ai',
      label: labels.ai,
      percent: formatPercent(counts.ai, total),
      className: 'stat-segment--ai'
    },
    {
      key: 'none',
      label: labels.none,
      percent: Math.max(0, 100 - formatPercent(counts.human, total) - formatPercent(counts.ai, total)),
      className: 'stat-segment--none'
    }
  ]

  const isExplore = mode === 'explore'
  const isInteractive = Boolean(onSelectStatus) || isExplore

  const handleSegmentClick = (status: CoverageStatus) => {
    if (isExplore) {
      onFilter(status)
      return
    }
    onSelectStatus?.(status)
  }

  const helperText = isExplore
    ? 'Click a segment to filter.'
    : 'Click a segment to filter.'

  return (
    <div className={`coverage-bar${isInteractive ? ' is-interactive' : ''}`}>
      <p className="coverage-hint">{helperText}</p>
      <div className="stat-bar" aria-label={ariaLabel}>
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className={`stat-segment ${segment.className}${
              activeFilter === segment.key ? ' is-active' : ''
            }`}
            style={{ width: `${segment.percent}%` }}
            title={`${segment.label} videos: ${counts[segment.key]}`}
            aria-pressed={activeFilter === segment.key}
            onClick={() => handleSegmentClick(segment.key)}
            disabled={!isInteractive}
          />
        ))}
      </div>
      <div className="stat-legend">
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className={`stat-legend-item stat-legend-item--${segment.key}${
              activeFilter === segment.key ? ' is-active' : ''
            }`}
            onClick={() => handleSegmentClick(segment.key)}
            disabled={!isInteractive}
          >
            {segment.label} {segment.percent}%
          </button>
        ))}
      </div>
    </div>
  )
}

function ReportTypeSelector({
  value,
  onChange
}: {
  value: ReportType
  onChange: (value: ReportType) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const shellRef = useRef<HTMLSpanElement | null>(null)
  const report = REPORT_CONFIG[value]
  const options = useMemo(
    () => Object.keys(REPORT_CONFIG) as ReportType[],
    []
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!shellRef.current) return
      if (!shellRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <span className="control-select-shell" ref={shellRef}>
      <button
        type="button"
        className="control-value"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="control-select-text">{report.label}</span>
        <span className="control-chevron" aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="control-dropdown" role="listbox" aria-label="Report type">
          {options.map((option) => {
            const optionConfig = REPORT_CONFIG[option]
            return (
              <button
                key={option}
                type="button"
                className={`control-option${
                  option === value ? ' is-selected' : ''
                }`}
                onClick={() => {
                  onChange(option)
                  setIsOpen(false)
                }}
                role="option"
                aria-selected={option === value}
              >
                <span className="control-option-english">
                  {optionConfig.label}
                </span>
                <span className="control-option-native">
                  {optionConfig.description}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}

function ModeToggle({
  mode,
  onChange
}: {
  mode: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <div className="mode-toggle" role="group" aria-label="Interaction mode">
      <div className="mode-toggle-buttons">
        <button
          type="button"
          className={`mode-toggle-button${mode === 'explore' ? ' is-active' : ''}`}
          onClick={() => onChange('explore')}
          aria-pressed={mode === 'explore'}
        >
          <Eye className="icon" aria-hidden="true" />
          Explore
        </button>
        <button
          type="button"
          className={`mode-toggle-button${mode === 'select' ? ' is-active' : ''}`}
          onClick={() => onChange('select')}
          aria-pressed={mode === 'select'}
        >
          <CheckSquare className="icon" aria-hidden="true" />
          Translate
        </button>
      </div>
    </div>
  )
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
  disabled = false
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label?: string
  className?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate)
    }
  }, [indeterminate])

  return (
    <label
      className={`checkbox${className ? ` ${className}` : ''}${
        disabled ? ' is-disabled' : ''
      }`}
      onClick={(event) => event.stopPropagation()}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="checkbox-box" aria-hidden="true" />
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  )
}

function getFittingLanguageCount(
  labels: string[],
  maxWidth: number,
  textFont: string
): number {
  if (labels.length <= 1) return labels.length
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return labels.length

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return labels.length

  context.font = textFont

  const measureText = (value: string) => context.measureText(value).width
  const pillPadding = 22
  const gapBeforePill = 8

  let usedWidth = 0
  let visibleCount = 0

  for (let index = 0; index < labels.length; index += 1) {
    const nextChunk = index === 0 ? labels[index] : `, ${labels[index]}`
    const nextChunkWidth = measureText(nextChunk)
    const remaining = labels.length - (index + 1)
    const morePillWidth =
      remaining > 0
        ? gapBeforePill + measureText(`+${remaining} more`) + pillPadding
        : 0

    if (usedWidth + nextChunkWidth + morePillWidth <= maxWidth || index === 0) {
      usedWidth += nextChunkWidth
      visibleCount = index + 1
      continue
    }
    break
  }

  return Math.max(1, visibleCount)
}

function TargetLanguageSummary({ labels }: { labels: string[] }) {
  const valuesRef = useRef<HTMLDivElement | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [textFont, setTextFont] = useState('')

  useEffect(() => {
    const element = valuesRef.current
    if (!element) return

    const updateMeasurements = () => {
      const computedStyle = window.getComputedStyle(element)
      setAvailableWidth(element.clientWidth)
      setTextFont(
        `${computedStyle.fontStyle} ${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`
      )
    }

    updateMeasurements()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateMeasurements())
        : null

    resizeObserver?.observe(element)
    window.addEventListener('resize', updateMeasurements)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateMeasurements)
    }
  }, [])

  const visibleCount = useMemo(
    () => getFittingLanguageCount(labels, availableWidth, textFont),
    [labels, availableWidth, textFont]
  )
  const visibleLabels = labels.slice(0, visibleCount)
  const hiddenCount = Math.max(0, labels.length - visibleCount)

  return (
    <div className="translation-target translation-target--languages">
      <span className="translation-target-prefix">Target languages:</span>
      <div className="translation-target-values" ref={valuesRef}>
        <span className="translation-target-list">{visibleLabels.join(', ')}</span>
        {hiddenCount > 0 ? (
          <span className="translation-target-more">+{hiddenCount} more</span>
        ) : null}
      </div>
    </div>
  )
}

function SelectableVideoTile({
  mode,
  video,
  status,
  statusLabel,
  isSelected,
  onToggle,
  onHoverStart,
  onHoverEnd
}: {
  mode: Mode
  video: ClientVideo
  status: CoverageStatus
  statusLabel: string
  isSelected: boolean
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void
  onHoverStart: () => void
  onHoverEnd: () => void
}) {
  const actionLabel =
    mode === 'explore'
      ? video.watchUrl
        ? 'Open video'
        : 'No action'
      : video.selectable
        ? 'Select for translation'
        : 'Unavailable for translation'
  const debugHint = mode === 'select' ? ' · Option+Click: QA debug' : ''
  const unselectableHint =
    mode === 'select' && !video.selectable
      ? ` · ${video.unselectableReason ?? 'Missing muxAssetId mapping.'}`
      : ''
  const title = `${actionLabel}: ${video.title} — ${statusLabel}${debugHint}`
  const fullTitle = `${title}${unselectableHint}`
  const baseClass = `tile tile--video tile--${status}${
    !video.selectable ? ' is-unselectable' : ''
  }`

  if (mode === 'explore') {
    if (video.watchUrl) {
      return (
        <a
          className={`${baseClass} tile--explore tile--link`}
          href={video.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={fullTitle}
          onMouseEnter={onHoverStart}
          onMouseLeave={onHoverEnd}
          onFocus={onHoverStart}
          onBlur={onHoverEnd}
        >
          <span className="tile-checkbox" aria-hidden="true">
            <span className="tile-checkbox-box" />
          </span>
        </a>
      )
    }
    return (
      <span
        className={`${baseClass} tile--explore`}
        title={fullTitle}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        onFocus={onHoverStart}
        onBlur={onHoverEnd}
      >
        <span className="tile-checkbox" aria-hidden="true">
          <span className="tile-checkbox-box" />
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`${baseClass} tile--select${
        isSelected ? ' is-selected' : ''
      }`}
      title={fullTitle}
      aria-pressed={isSelected}
      aria-label={
        video.selectable
          ? `Select ${video.title}`
          : `${video.title} is unavailable for translation`
      }
      aria-disabled={!video.selectable}
      onClick={onToggle}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
    >
      <span className="tile-checkbox" aria-hidden="true">
        <span className="tile-checkbox-box" aria-hidden="true" />
      </span>
      {isSelected && <Check className="tile-check-icon" aria-hidden="true" />}
    </button>
  )
}

export function TranslationActionBar({
  selectedCount,
  languageLabels,
  estimatedCostLabel,
  hoveredVideo,
  statusLabels,
  isSubmitting,
  submitFeedback,
  isInteractive,
  onClear,
  onTranslate
}: {
  selectedCount: number
  languageLabels: string[]
  estimatedCostLabel: string | null
  hoveredVideo: HoveredVideoDetails | null
  statusLabels: Record<CoverageStatus, string>
  isSubmitting: boolean
  submitFeedback: SubmitFeedback | null
  isInteractive: boolean
  onClear: () => void
  onTranslate: () => void
}) {
  const statusLabel = hoveredVideo ? statusLabels[hoveredVideo.status] : null
  const inlineFeedback =
    submitFeedback && submitFeedback.tone !== 'error' ? submitFeedback : null
  const toastFeedback =
    submitFeedback && submitFeedback.tone === 'error' ? submitFeedback : null
  const [isErrorToastDismissed, setIsErrorToastDismissed] = useState(false)
  const [isErrorToastExpanded, setIsErrorToastExpanded] = useState(false)

  useEffect(() => {
    setIsErrorToastDismissed(false)
    setIsErrorToastExpanded(false)
  }, [toastFeedback?.message, toastFeedback?.details?.join('|'), toastFeedback?.nonce])

  return (
    <div
      className={`translation-bar${hoveredVideo ? ' is-detail' : ''}${
        isInteractive ? '' : ' is-explore'
      }`}
      role="status"
      aria-live="polite"
    >
      {isInteractive && (
        <div className="translation-view translation-view--selection">
          <div className="translation-summary">
            <div className="translation-count">
              {selectedCount} video{selectedCount === 1 ? '' : 's'} selected
            </div>
            <TargetLanguageSummary labels={languageLabels} />
            {estimatedCostLabel ? (
              <div className="translation-estimate">{estimatedCostLabel}</div>
            ) : null}
          </div>
          <div className="translation-controls">
            <button
              type="button"
              className="translation-primary"
              onClick={onTranslate}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <RefreshCw className="icon is-spinning" aria-hidden="true" />
              ) : (
                <Languages className="icon" aria-hidden="true" />
              )}
              {isSubmitting ? 'Submitting...' : 'Translate Now'}
            </button>
            <button
              type="button"
              className="translation-secondary"
              onClick={onClear}
              disabled={isSubmitting}
              aria-label="Cancel and clear selection"
              title="Cancel and clear selection"
            >
              <XCircle className="icon" aria-hidden="true" />
            </button>
          </div>
          {inlineFeedback ? (
            <div
              className={`translation-feedback translation-feedback--${inlineFeedback.tone}`}
              role="status"
            >
              {inlineFeedback.message}
            </div>
          ) : null}
        </div>
      )}
      <div className="translation-view translation-view--detail">
        {hoveredVideo ? (
          <div className="detail-media">
            {hoveredVideo.video.thumbnailUrl ? (
              <img
                src={hoveredVideo.video.thumbnailUrl}
                alt=""
                className="detail-thumb"
              />
            ) : (
              <div className="detail-thumb detail-thumb--empty" aria-hidden="true" />
            )}
            <div className="detail-info">
              <div className="translation-summary">
                <div className="translation-count">{hoveredVideo.video.title}</div>
                <div className="translation-target">{hoveredVideo.collectionTitle}</div>
              </div>
              <div className="translation-controls translation-controls--detail">
                <span
                  className={`detail-status detail-status--${hoveredVideo.status}`}
                >
                  {statusLabel ?? ''}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="translation-empty">
            Hover any item to see its details.
          </div>
        )}
      </div>
      {toastFeedback && !isErrorToastDismissed ? (
        <div className="translation-toast-wrap">
          <div className="translation-toast translation-toast--error" role="status">
            <button
              type="button"
              className="translation-toast-main"
              onClick={() => setIsErrorToastExpanded((prev) => !prev)}
              aria-expanded={isErrorToastExpanded}
              aria-label="Open translation error details"
            >
              <AlertTriangle className="icon" aria-hidden="true" />
              <span className="translation-toast-message">{toastFeedback.message}</span>
            </button>
            <span className="translation-toast-actions">
              <button
                type="button"
                className="translation-toast-toggle"
                onClick={() => setIsErrorToastExpanded((prev) => !prev)}
              >
                {isErrorToastExpanded ? 'Hide error details' : 'Show error details'}
              </button>
              <button
                type="button"
                className="translation-toast-dismiss"
                aria-label="Dismiss translation error"
                onClick={() => setIsErrorToastDismissed(true)}
              >
                <XCircle className="icon" aria-hidden="true" />
              </button>
            </span>
          </div>
          {isErrorToastExpanded && toastFeedback.details && toastFeedback.details.length > 0 ? (
            <div className="translation-toast-details" role="status">
              {toastFeedback.details.map((detail, index) => (
                <div key={`${detail}-${index}`} className="translation-toast-detail-line">
                  {detail}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function MetaSummary({ meta }: { meta: MetaCompleteness }) {
  const fields = [
    { key: 'tags', label: 'Tags', present: meta.tags },
    { key: 'description', label: 'Description', present: meta.description },
    { key: 'title', label: 'Title', present: meta.title },
    { key: 'questions', label: 'Questions', present: meta.questions },
    { key: 'bibleQuotes', label: 'Bible quotes', present: meta.bibleQuotes }
  ]

  return (
    <div className="meta-summary" aria-label="Meta completeness">
      <span className="meta-score">
        Meta {meta.completed}/{meta.total}
      </span>
      {fields.map((field) => (
        <span
          key={field.key}
          className={`meta-pill${field.present ? ' is-complete' : ' is-missing'}`}
        >
          {field.label}
        </span>
      ))}
    </div>
  )
}

type CollectionCardProps = {
  collection: ClientCollection
  reportType: ReportType
  reportConfig: (typeof REPORT_CONFIG)[ReportType]
  interactionMode: Mode
  isSelectMode: boolean
  selectedSet: Set<string>
  collectionFilter: CoverageFilter
  isExpanded: boolean
  onToggleExpanded: (collectionId: string) => void
  onToggleCollection: (collection: ClientCollection) => void
  onFilterCollection: (collectionId: string, filter: CoverageFilter) => void
  onToggleVideo: (
    video: ClientVideo,
    collectionTitle: string,
    event?: React.MouseEvent<HTMLButtonElement>
  ) => void
  onSelectByStatusInCollection: (
    collection: ClientCollection,
    status: CoverageStatus
  ) => void
  onHoverVideo: (details: HoveredVideoDetails | null) => void
}

const CollectionCard = memo(function CollectionCard({
  collection,
  reportType,
  reportConfig,
  interactionMode,
  isSelectMode,
  selectedSet,
  collectionFilter,
  isExpanded,
  onToggleExpanded,
  onToggleCollection,
  onFilterCollection,
  onToggleVideo,
  onSelectByStatusInCollection,
  onHoverVideo
}: CollectionCardProps) {
  const getReportStatus = useCallback(
    (video: ClientVideo): CoverageStatus => {
      if (reportType === 'voiceover') return video.voiceoverStatus
      if (reportType === 'meta') return video.metaStatus
      return video.subtitleStatus
    },
    [reportType]
  )

  const total = collection.videos.length

  const counts = useMemo(() => {
    return collection.videos.reduce(
      (acc, video) => {
        acc[getReportStatus(video)] += 1
        return acc
      },
      { human: 0, ai: 0, none: 0 }
    )
  }, [collection.videos, getReportStatus])

  const filteredCollectionVideos = useMemo(() => {
    if (collectionFilter === 'all') return collection.videos
    return collection.videos.filter(
      (video) => getReportStatus(video) === collectionFilter
    )
  }, [collection.videos, collectionFilter, getReportStatus])

  const sortedVideos = useMemo(() => {
    return [...filteredCollectionVideos].sort((a, b) => {
      const order = { human: 0, ai: 1, none: 2 }
      return order[getReportStatus(a)] - order[getReportStatus(b)]
    })
  }, [filteredCollectionVideos, getReportStatus])

  const collectionSelectableIds = useMemo(
    () => getSelectableVideoIdsForSelection(collection.videos),
    [collection.videos]
  )
  const collectionSelectedCount = useMemo(
    () => collectionSelectableIds.filter((id) => selectedSet.has(id)).length,
    [collectionSelectableIds, selectedSet]
  )
  const collectionAllSelected =
    collectionSelectableIds.length > 0 &&
    collectionSelectedCount === collectionSelectableIds.length

  return (
    <section
      className="collection-card"
      key={collection.id}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggleExpanded(collection.id)
        }
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('a, button, input, select, textarea')) return
        if (target.closest('.tile')) return
        onToggleExpanded(collection.id)
      }}
    >
      <div className="collection-header">
        <div className="collection-title-row">
          <div
            className="collection-title-block"
            role={isSelectMode ? 'button' : undefined}
            tabIndex={isSelectMode ? 0 : undefined}
            onClick={(event) => {
              if (!isSelectMode) return
              const target = event.target as HTMLElement
              if (target.closest('.checkbox')) return
              event.stopPropagation()
              onToggleCollection(collection)
            }}
            onKeyDown={(event) => {
              if (!isSelectMode) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onToggleCollection(collection)
              }
            }}
          >
            <div className="collection-title-line">
              <h2 className="collection-title">{collection.title}</h2>
              <span
                className={`collection-label collection-label--${collection.label}`}
                aria-label={`Group type: ${collection.labelDisplay}`}
              >
                {collection.labelDisplay}
              </span>
              {isSelectMode && (
                <Checkbox
                  checked={collectionAllSelected}
                  indeterminate={
                    collectionSelectedCount > 0 && !collectionAllSelected
                  }
                  onChange={() => onToggleCollection(collection)}
                  label=""
                  className="collection-checkbox"
                  disabled={collectionSelectableIds.length === 0}
                />
              )}
            </div>
            <div className="collection-meta-row">
              <p className="collection-meta">
                {total} video{total === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
        <div className="collection-stats">
          <CoverageBar
            counts={counts}
            activeFilter={interactionMode === 'explore' ? collectionFilter : 'all'}
            onFilter={(nextFilter) => onFilterCollection(collection.id, nextFilter)}
            onSelectStatus={
              isSelectMode
                ? (status) => onSelectByStatusInCollection(collection, status)
                : undefined
            }
            mode={interactionMode}
            labels={reportConfig.segmentLabels}
            ariaLabel={reportConfig.ariaLabel}
          />
        </div>
      </div>
      <div className={`collection-divider${isExpanded ? ' is-open' : ''}`}>
        <button
          type="button"
          className="collection-toggle"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpanded(collection.id)
          }}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="icon" aria-hidden="true" />
              Hide details
            </>
          ) : (
            <>
              <ChevronDown className="icon" aria-hidden="true" />
              Show details
            </>
          )}
        </button>
      </div>
      <div className={`collection-details${isExpanded ? ' is-open' : ''}`}>
        {filteredCollectionVideos.map((video) => {
          const status = getReportStatus(video)
          const statusLabel = reportConfig.statusLabels[status]
          const tileStatusLabel =
            reportType === 'meta'
              ? `${statusLabel} (${video.meta.completed}/${video.meta.total})`
              : statusLabel
          const tileActionLabel = isSelectMode
            ? video.selectable
              ? 'Select for translation'
              : 'Unavailable for translation'
            : video.watchUrl
              ? 'Open video'
              : 'No action'

          return (
            <div className="collection-detail-row" key={video.id}>
              {isSelectMode ? (
                <button
                  type="button"
                  className={`tile tile--video tile--${status} tile--select detail-tile${
                    selectedSet.has(video.id) ? ' is-selected' : ''
                  }${!video.selectable ? ' is-unselectable' : ''}`}
                  onClick={(event) =>
                    onToggleVideo(video, collection.title, event)
                  }
                  onMouseEnter={() =>
                    onHoverVideo({
                      video,
                      collectionTitle: collection.title,
                      status
                    })
                  }
                  onMouseLeave={() => onHoverVideo(null)}
                  onFocus={() =>
                    onHoverVideo({
                      video,
                      collectionTitle: collection.title,
                      status
                    })
                  }
                  onBlur={() => onHoverVideo(null)}
                  aria-pressed={selectedSet.has(video.id)}
                  aria-label={
                    video.selectable
                      ? `Select ${video.title}`
                      : `${video.title} is unavailable for translation`
                  }
                  aria-disabled={!video.selectable}
                  title={`${tileActionLabel}: ${video.title} — ${tileStatusLabel}${
                    !video.selectable
                      ? ` · ${video.unselectableReason ?? 'Missing muxAssetId mapping.'}`
                      : ''
                  } · Option+Click: QA debug`}
                >
                  <span className="tile-checkbox" aria-hidden="true">
                    <span className="tile-checkbox-box" aria-hidden="true" />
                  </span>
                  {selectedSet.has(video.id) && (
                    <Check className="tile-check-icon" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span
                  className={`tile tile--${status} detail-tile`}
                  aria-hidden="true"
                  title={`${tileActionLabel}: ${video.title} — ${tileStatusLabel}`}
                  onMouseEnter={() =>
                    onHoverVideo({
                      video,
                      collectionTitle: collection.title,
                      status
                    })
                  }
                  onMouseLeave={() => onHoverVideo(null)}
                  onFocus={() =>
                    onHoverVideo({
                      video,
                      collectionTitle: collection.title,
                      status
                    })
                  }
                  onBlur={() => onHoverVideo(null)}
                />
              )}
              <div className="detail-content">
                {video.watchUrl ? (
                  <a
                    href={video.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="detail-link"
                  >
                    <span>{video.title}</span>
                    <ExternalLink className="detail-link-icon" aria-hidden="true" />
                  </a>
                ) : (
                  <span>{video.title}</span>
                )}
                {reportType === 'meta' && <MetaSummary meta={video.meta} />}
              </div>
            </div>
          )
        })}
      </div>
      <div
        className={`collection-tiles${
          isSelectMode ? ' collection-tiles--select' : ''
        }${isExpanded ? ' is-hidden' : ''}`}
      >
        {sortedVideos.map((video) => {
          const status = getReportStatus(video)
          const statusLabel = reportConfig.statusLabels[status]
          const tileStatusLabel =
            reportType === 'meta'
              ? `${statusLabel} (${video.meta.completed}/${video.meta.total})`
              : statusLabel

          return (
            <SelectableVideoTile
              key={video.id}
              mode={interactionMode}
              video={video}
              status={status}
              statusLabel={tileStatusLabel}
              isSelected={selectedSet.has(video.id)}
              onToggle={(event) =>
                onToggleVideo(video, collection.title, event)
              }
              onHoverStart={() =>
                onHoverVideo({
                  video,
                  collectionTitle: collection.title,
                  status
                })
              }
              onHoverEnd={() => onHoverVideo(null)}
            />
          )
        })}
        {filteredCollectionVideos.length === 0 && (
          <p className="collection-empty">No videos in this collection.</p>
        )}
      </div>
    </section>
  )
})

export function CoverageReportClient({
  gatewayConfigured,
  initialErrorMessage,
  initialCollections,
  initialSelectedLanguageIds,
  initialLanguages
}: CoverageReportClientProps) {
  const collections = useMemo(
    () => normalizeCollections(initialCollections),
    [initialCollections]
  );
  const selectedLanguageIds = initialSelectedLanguageIds;
  const languageOptions = initialLanguages;
  const errorMessage = initialErrorMessage;
  const [reportType, setReportType] = useSessionReportType('subtitles')
  const [mode, setMode] = useSessionMode('explore')
  const [filter, setFilter] = useState<CoverageFilter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [hoveredVideo, setHoveredVideo] = useState<HoveredVideoDetails | null>(
    null
  )
  const [expandedCollections, setExpandedCollections] = useState<string[]>([])
  const [collectionFilters, setCollectionFilters] = useState<
    Record<string, CoverageFilter>
  >({})
  const [visibleCount, setVisibleCount] = useState(COLLECTIONS_PER_BATCH)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [submitState, setSubmitState] = useState<SubmitState>({ type: 'idle' });
  const [videoQaDebugState, setVideoQaDebugState] = useState<VideoQaDebugState | null>(null)
  const [queueJobsCount, setQueueJobsCount] = useState<number | null>(null)
  const loadMoreTimeoutRef = useRef<number | null>(null)
  const hasQueuedJobsRedirectRef = useRef(false)

  const reportConfig = REPORT_CONFIG[reportType]
  const isSubtitleReport = reportType === 'subtitles'
  const isSelectMode = isSubtitleReport && mode === 'select'
  const interactionMode: Mode = isSelectMode ? 'select' : 'explore'

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('coverage-standalone');
    return () => {
      document.body.classList.remove('coverage-standalone');
      delete document.documentElement.dataset.coverageLoading;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const storedRaw = window.sessionStorage.getItem(SESSION_LANGUAGE_IDS_KEY) ?? ''
    const storedLanguageIds = storedRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const availableLanguageIds = languageOptions.map((language) => language.id)
    const restoreUrl = buildCoverageUrlWithStoredLanguageSelection({
      currentHref: window.location.href,
      storedLanguageIds,
      availableLanguageIds
    })
    if (restoreUrl) {
      window.location.replace(restoreUrl)
      return
    }

    const normalizedSelectedLanguageIds = [
      ...new Set(selectedLanguageIds.map((value) => value.trim()).filter(Boolean))
    ]
    if (normalizedSelectedLanguageIds.length === 0) {
      return
    }

    window.sessionStorage.setItem(
      SESSION_LANGUAGE_IDS_KEY,
      normalizedSelectedLanguageIds.join(',')
    )
  }, [languageOptions, selectedLanguageIds])

  useEffect(() => {
    return () => {
      if (loadMoreTimeoutRef.current) {
        window.clearTimeout(loadMoreTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadQueueJobsCount() {
      try {
        const response = await fetch('/api/jobs', { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as Array<{ status?: string }>
        const currentCount = Array.isArray(payload)
          ? payload.length
          : 0

        if (!cancelled) {
          setQueueJobsCount(currentCount)
        }
      } catch {
        if (!cancelled) {
          setQueueJobsCount(null)
        }
      }
    }

    void loadQueueJobsCount()
    const intervalId = window.setInterval(loadQueueJobsCount, 30000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!isSelectMode && selectedIds.length > 0) {
      setSelectedIds([])
    }
    if (!isSubtitleReport && mode !== 'explore') {
      setMode('explore')
    }
  }, [isSelectMode, isSubtitleReport, mode, selectedIds.length, setMode])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const getReportStatus = useCallback(
    (video: ClientVideo): CoverageStatus => {
      if (reportType === 'voiceover') return video.voiceoverStatus
      if (reportType === 'meta') return video.metaStatus
      return video.subtitleStatus
    },
    [reportType]
  )

  const selectedLabels = useMemo(() => {
    return selectedLanguageIds
      .map(
        (id) =>
          languageOptions.find((option) => option.id === id)?.englishLabel ?? id
      )
      .filter(Boolean)
  }, [languageOptions, selectedLanguageIds])
  const targetLanguageLabels =
    selectedLabels.length === 0
      ? [languageOptions[0]?.englishLabel ?? 'Unknown']
      : selectedLabels
  const jobsHref = useMemo<UrlObject>(() => {
    if (selectedLanguageIds.length === 0) {
      return { pathname: '/jobs' }
    }

    return {
      pathname: '/jobs',
      query: { languageId: selectedLanguageIds.join(',') }
    }
  }, [selectedLanguageIds])

  const languageAbbreviationsById = useMemo<Record<string, string>>(() => {
    const entries = languageOptions.map((option) => [
      option.id,
      toLanguageAbbreviation(option.englishLabel, option.id)
    ]);
    return Object.fromEntries(entries);
  }, [languageOptions]);
  const selectedVideosForEstimate = useMemo(
    () =>
      getSelectedVideosInOrder(collections, selectedSet).filter(
        (
          video
        ): video is CoverageVideo & { selectable: true; muxAssetId: string } =>
          video.selectable
      ),
    [collections, selectedSet]
  )
  const estimatedCostLabel = useMemo(() => {
    if (selectedVideosForEstimate.length === 0 || selectedLanguageIds.length === 0) {
      return null
    }

    const estimatedUsd = estimateCoverageTranslateCostUsd({
      videos: selectedVideosForEstimate,
      selectedLanguageCount: selectedLanguageIds.length
    })

    return `Estimated cost: ~${formatEstimatedUsd(estimatedUsd)}`
  }, [selectedLanguageIds.length, selectedVideosForEstimate])

  const overallCounts = useMemo(() => {
    return collections.reduce(
      (acc, collection) => {
        for (const video of collection.videos) {
          acc[getReportStatus(video)] += 1
        }
        return acc
      },
      { human: 0, ai: 0, none: 0 }
    )
  }, [collections, getReportStatus])

  const effectiveFilter = interactionMode === 'explore' ? filter : 'all'

  const visibleCollections = useMemo(() => {
    if (effectiveFilter === 'all') return collections
    return collections
      .map((collection) => ({
        ...collection,
        videos: collection.videos.filter(
          (video) => getReportStatus(video) === effectiveFilter
        )
      }))
      .filter((collection) => collection.videos.length > 0)
  }, [collections, effectiveFilter, getReportStatus])

  useEffect(() => {
    setVisibleCount(
      Math.min(COLLECTIONS_PER_BATCH, Math.max(visibleCollections.length, 0))
    )
  }, [effectiveFilter, reportType, visibleCollections.length])

  const pagedCollections = useMemo(
    () => visibleCollections.slice(0, visibleCount),
    [visibleCollections, visibleCount]
  )

  const statusIdMap = useMemo(() => {
    return collections.reduce(
      (acc, collection) => {
        for (const video of collection.videos) {
          if (!video.selectable) {
            continue
          }
          acc[video.subtitleStatus].push(video.id)
        }
        return acc
      },
      { human: [] as string[], ai: [] as string[], none: [] as string[] }
    )
  }, [collections])

  const handleToggleVideo = useCallback((
    video: ClientVideo,
    collectionTitle: string,
    event?: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (event?.altKey) {
      event.preventDefault()
      setVideoQaDebugState({ video, collectionTitle })
      return
    }

    if (!video.selectable) {
      setSubmitState(buildUnselectableVideoSubmitError(video))
      return
    }

    setSelectedIds((prev) =>
      prev.includes(video.id)
        ? prev.filter((id) => id !== video.id)
        : [...prev, video.id]
    )
  }, [])

  const handleToggleCollection = useCallback((collection: ClientCollection) => {
    const collectionIds = getSelectableVideoIdsForSelection(collection.videos)
    if (collectionIds.length === 0) {
      return
    }
    const allSelected = collectionIds.every((id) => selectedSet.has(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !collectionIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...collectionIds])))
    }
  }, [selectedSet])

  const handleSelectByStatus = useCallback((status: CoverageStatus) => {
    const statusIds = statusIdMap[status]
    const allSelected = statusIds.length > 0 && statusIds.every((id) => selectedSet.has(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !statusIds.includes(id)))
      return
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...statusIds])))
  }, [selectedSet, statusIdMap])

  const handleSelectByStatusInCollection = useCallback((
    collection: ClientCollection,
    status: CoverageStatus
  ) => {
    const statusIds = collection.videos
      .filter((video) => video.subtitleStatus === status && video.selectable)
      .map((video) => video.id)
    const allSelected =
      statusIds.length > 0 && statusIds.every((id) => selectedSet.has(id))
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !statusIds.includes(id)))
      return
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...statusIds])))
  }, [selectedSet])

  const handleFilterCollection = useCallback((
    collectionId: string,
    nextFilter: CoverageFilter
  ) => {
    setCollectionFilters((prev) => ({
      ...prev,
      [collectionId]: nextFilter
    }))
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const handleTranslate = useCallback(async () => {
    if (submitState.type === 'submitting') {
      return;
    }

    if (selectedIds.length === 0) {
      setSubmitState({
        type: 'error',
        message: 'Select at least one media item before submitting.',
        nonce: Date.now()
      });
      return;
    }

    if (selectedLanguageIds.length === 0) {
      setSubmitState({
        type: 'error',
        message: 'Select at least one target language.',
        nonce: Date.now()
      });
      return;
    }

    hasQueuedJobsRedirectRef.current = false
    setSubmitState({ type: 'submitting' });

    const collectionTitleByVideoId = new Map<string, string>();
    for (const collection of collections) {
      for (const video of collection.videos) {
        collectionTitleByVideoId.set(video.id, collection.title);
      }
    }

    const selectedVideos = getSelectedVideosInOrder(collections, new Set(selectedIds)).map(
      (video) => ({
        ...video,
        collectionTitle: collectionTitleByVideoId.get(video.id) ?? null
      })
    );

    const result = await submitCoverageSelection({
      selectedVideos,
      languageIds: selectedLanguageIds,
      languageAbbreviationsById,
      options: {
        generateVoiceover: false,
        uploadMux: false,
        notifyCms: false
      },
      createJob: async (input) => {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            muxAssetId: input.muxAssetId,
            languages: input.languages,
            sourceCollectionTitle: input.sourceCollectionTitle,
            sourceMediaTitle: input.sourceMediaTitle,
            requestedLanguageAbbreviations: input.requestedLanguageAbbreviations,
            options: input.options
          })
        });

        const payload = (await response.json()) as {
          jobId?: string;
          error?: string;
          details?: string;
          code?: string;
        };
        if (!response.ok || !payload.jobId) {
          const message = [payload.error, payload.details, payload.code]
            .filter((value): value is string => Boolean(value && value.trim()))
            .join(' | ');
          throw new Error(message || 'Failed to create job.');
        }
        return { jobId: payload.jobId };
      }
    });

    setSubmitState({ type: 'done', result });
    setSelectedIds(
      result.items
        .filter((item) => item.status !== 'created')
        .map((item) => item.mediaId)
    );
  }, [collections, languageAbbreviationsById, selectedIds, selectedLanguageIds, submitState.type])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nextUrl = buildCoverageUrlWithoutRefresh(window.location.href)
    if (!nextUrl) {
      return
    }

    window.history.replaceState(window.history.state, '', nextUrl)
  }, [])

  useEffect(() => {
    const nextUrl = getCoverageJobsQueueRedirectUrl({
      submitState,
      hasRedirected: hasQueuedJobsRedirectRef.current
    })
    if (!nextUrl) {
      return
    }

    hasQueuedJobsRedirectRef.current = true
    window.location.assign(nextUrl)
  }, [submitState])

  const toggleExpanded = useCallback((collectionId: string) => {
    setExpandedCollections((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId]
    )
  }, [])

  const handleHoverVideo = useCallback(
    (details: HoveredVideoDetails | null) => {
      setHoveredVideo(details)
    },
    []
  )

  useEffect(() => {
    if (!videoQaDebugState) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVideoQaDebugState(null)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [videoQaDebugState])

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return
    setIsLoadingMore(true)
    loadMoreTimeoutRef.current = window.setTimeout(() => {
      setVisibleCount((prev) =>
        Math.min(prev + COLLECTIONS_PER_BATCH, visibleCollections.length)
      )
      setIsLoadingMore(false)
    }, 240)
  }, [isLoadingMore, visibleCollections.length])

  const handleRefreshNow = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    const current = new URL(window.location.href)
    current.searchParams.set('refresh', '1')
    window.location.assign(`${current.pathname}?${current.searchParams.toString()}`)
  }, [])

  const totalCollections = visibleCollections.length
  const shownCollections = Math.min(visibleCount, totalCollections)
  const canLoadMore = shownCollections < totalCollections
  const progressPercent =
    totalCollections > 0
      ? Math.round((shownCollections / totalCollections) * 100)
      : 0
  const submitFeedback = buildCoverageSubmitFeedback(submitState)

  return (
    <div className="report-shell">
      <header className="report-header">
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
            <span className="control-label control-label--title">Coverage Report</span>
            <div className="header-selectors-row">
              <div className="report-control report-control--text">
                <ReportTypeSelector value={reportType} onChange={setReportType} />
              </div>
            </div>
          </div>
        </div>
        <div className="header-diagram">
          <div className="header-diagram-menu header-nav-tabs">
            <Link
              href="/dashboard/coverage"
              className="header-nav-link is-active"
              aria-current="page"
            >
              <span className="header-nav-link-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                  <path d="M1.5 8c1.8-3 4-4.5 6.5-4.5S12.7 5 14.5 8c-1.8 3-4 4.5-6.5 4.5S3.3 11 1.5 8z" />
                  <circle cx="8" cy="8" r="2.1" />
                </svg>
              </span>
              <span>Report</span>
            </Link>
            <Link href={jobsHref} className="header-nav-link">
              <span className="header-nav-link-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" role="presentation" focusable="false">
                  <path d="M3 4h6M3 8h10M3 12h8" />
                </svg>
              </span>
              <span>Queue</span>
              {queueJobsCount !== null && (
                <span
                  className="header-nav-link-badge"
                  aria-label={`${queueJobsCount} current jobs`}
                  title={`${queueJobsCount} current jobs`}
                >
                  {queueJobsCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <section className="language-panel-section">
        <div className="language-panel-layout">
          <div className="language-panel-diagram">
            <CoverageBar
              counts={overallCounts}
              activeFilter={interactionMode === 'explore' ? filter : 'all'}
              onFilter={setFilter}
              onSelectStatus={isSelectMode ? handleSelectByStatus : undefined}
              mode={interactionMode}
              labels={reportConfig.segmentLabels}
              ariaLabel={reportConfig.ariaLabel}
            />
          </div>
          <LanguageGeoSelector
            value={selectedLanguageIds}
            options={languageOptions}
          />
        </div>
      </section>

      {gatewayConfigured && !errorMessage && (
        <section className="collection-progress-row" role="status" aria-live="polite">
          <div className="collection-progress">
            <div className="collection-progress-text">
              Showing {shownCollections} of {totalCollections} collections
            </div>
            <div
              className="collection-progress-bar"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Collections loading progress"
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <div className="collection-cache-meta">
            <span className="collection-cache-refresh">
              <button
                type="button"
                className="collection-cache-clear"
                onClick={handleRefreshNow}
                aria-label="Refresh now"
                title="Refresh now"
              >
                <RefreshCw className="icon" aria-hidden="true" />
                Refresh now
              </button>
            </span>
          </div>
        </section>
      )}

      <section className="mode-panel">
        {isSubtitleReport && <ModeToggle mode={mode} onChange={setMode} />}
        <p className="mode-hint">
          {isSubtitleReport
            ? isSelectMode
              ? reportConfig.hintSelect ?? ''
              : reportConfig.hintExplore
            : reportConfig.hintExplore}
        </p>
        {interactionMode === 'explore' && filter !== 'all' && (
          <div className="filter-pill" role="status">
            Filtering: {reportConfig.statusLabels[filter]}
            <button type="button" onClick={() => setFilter('all')}>
              <FilterX className="icon" aria-hidden="true" />
              Clear filter
            </button>
          </div>
        )}
      </section>

      {!gatewayConfigured ? (
        <div className="report-error">
          Set <code>CORE_API_ENDPOINT</code> to load collections.
        </div>
      ) : errorMessage ? (
        <div className="report-error">{errorMessage}</div>
      ) : (
        <div className="collections">
          {pagedCollections.map((collection) => {
            const collectionFilter = collectionFilters[collection.id] ?? 'all'
            const isExpanded = expandedCollections.includes(collection.id)

            return (
              <CollectionCard
                key={collection.id}
                collection={collection}
                reportType={reportType}
                reportConfig={reportConfig}
                interactionMode={interactionMode}
                isSelectMode={isSelectMode}
                selectedSet={selectedSet}
                collectionFilter={collectionFilter}
                isExpanded={isExpanded}
                onToggleExpanded={toggleExpanded}
                onToggleCollection={handleToggleCollection}
                onFilterCollection={handleFilterCollection}
                onToggleVideo={handleToggleVideo}
                onSelectByStatusInCollection={handleSelectByStatusInCollection}
                onHoverVideo={handleHoverVideo}
              />
            )
          })}
          {totalCollections === 0 && (
            <div className="collection-empty">No videos match this filter.</div>
          )}
          {totalCollections > 0 && (
            <div className="collection-load-more">
              <button
                type="button"
                className="load-more-button"
                onClick={handleLoadMore}
                disabled={!canLoadMore || isLoadingMore}
                aria-label="Load more collections"
                aria-busy={isLoadingMore}
              >
                {isLoadingMore && <span className="load-more-spinner" aria-hidden="true" />}
                {canLoadMore ? 'Load More Collections' : 'All collections loaded'}
              </button>
              <div className="collection-load-meta">
                {shownCollections} of {totalCollections} loaded
              </div>
            </div>
          )}
        </div>
      )}

      {isSubtitleReport && (
        <TranslationActionBar
          selectedCount={selectedIds.length}
          languageLabels={targetLanguageLabels}
          estimatedCostLabel={estimatedCostLabel}
          hoveredVideo={hoveredVideo}
          statusLabels={reportConfig.statusLabels}
          isSubmitting={submitState.type === 'submitting'}
          submitFeedback={submitFeedback}
          isInteractive={isSelectMode}
          onClear={handleClearSelection}
          onTranslate={handleTranslate}
        />
      )}

      {videoQaDebugState ? (
        <div
          className="qa-debug-modal-backdrop"
          role="presentation"
          onClick={() => setVideoQaDebugState(null)}
        >
          <div
            className="qa-debug-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Media mapping debug details"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="qa-debug-modal-header">
              <h2>Media QA Debug</h2>
              <button
                type="button"
                className="qa-debug-modal-close"
                onClick={() => setVideoQaDebugState(null)}
                aria-label="Close media debug modal"
              >
                <XCircle className="icon" aria-hidden="true" />
              </button>
            </header>
            <p className="qa-debug-modal-hint">
              Opened via Option/Alt + click. This shows metadata and job mapping for this media item.
            </p>
            <pre className="qa-debug-modal-pre">
              {JSON.stringify(
                buildVideoJobDebugPayload(
                  videoQaDebugState.video,
                  selectedLanguageIds,
                  videoQaDebugState.collectionTitle
                ),
                null,
                2
              )}
            </pre>
          </div>
        </div>
      ) : null}

    </div>
  )
}
