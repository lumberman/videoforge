import type { JobOptions } from '@/types/job';
import type {
  CoverageCollection,
  CoverageSubmitResult,
  CoverageSubmitResultItem,
  CoverageVideo
} from './types';

type CreateJobInput = {
  muxAssetId: string;
  languages: string[];
  options: JobOptions;
};

type CreateJobOutput = {
  jobId: string;
};

type SubmitCoverageSelectionInput = {
  selectedVideos: CoverageVideo[];
  languageIds: string[];
  options: JobOptions;
  createJob: (input: CreateJobInput) => Promise<CreateJobOutput>;
};

export type CoverageJobsQueueSummary = {
  created: number;
  failed: number;
  skipped: number;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Failed to create job.';
}

export function shouldRedirectToJobsQueueAfterCoverageSubmit(
  result: CoverageSubmitResult
): boolean {
  return result.created > 0;
}

export function buildCoverageJobsQueueUrl(
  summary: CoverageJobsQueueSummary
): string {
  const params = new URLSearchParams({
    from: 'coverage',
    created: String(summary.created),
    failed: String(summary.failed),
    skipped: String(summary.skipped)
  });

  return `/dashboard/jobs?${params.toString()}`;
}

export function getSelectedVideosInOrder(
  collections: CoverageCollection[],
  selectedIds: Set<string>
): CoverageVideo[] {
  const ordered: CoverageVideo[] = [];
  const seen = new Set<string>();

  for (const collection of collections) {
    for (const video of collection.videos) {
      if (!selectedIds.has(video.id) || seen.has(video.id)) {
        continue;
      }
      seen.add(video.id);
      ordered.push(video);
    }
  }

  return ordered;
}

export async function submitCoverageSelection(
  input: SubmitCoverageSelectionInput
): Promise<CoverageSubmitResult> {
  const outcomes: CoverageSubmitResultItem[] = [];

  for (const video of input.selectedVideos) {
    if (!video.selectable || !video.muxAssetId) {
      outcomes.push({
        mediaId: video.id,
        title: video.title,
        muxAssetId: null,
        status: 'skipped',
        reason: video.unselectableReason ?? 'Missing muxAssetId mapping.',
        jobId: null
      });
      continue;
    }

    try {
      const created = await input.createJob({
        muxAssetId: video.muxAssetId,
        languages: input.languageIds,
        options: input.options
      });
      outcomes.push({
        mediaId: video.id,
        title: video.title,
        muxAssetId: video.muxAssetId,
        status: 'created',
        reason: null,
        jobId: created.jobId
      });
    } catch (error) {
      outcomes.push({
        mediaId: video.id,
        title: video.title,
        muxAssetId: video.muxAssetId,
        status: 'failed',
        reason: toErrorMessage(error),
        jobId: null
      });
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === 'created').length;
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;
  const skipped = outcomes.filter((outcome) => outcome.status === 'skipped').length;

  return {
    created,
    failed,
    skipped,
    items: outcomes
  };
}
