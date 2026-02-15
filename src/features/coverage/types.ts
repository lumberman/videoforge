export type CoverageStatus = 'human' | 'ai' | 'none';

export type CoverageFilter = 'all' | CoverageStatus;

export type CoverageReportType = 'subtitles' | 'voiceover' | 'metadata';

export type CoverageVideoBase = {
  id: string;
  title: string;
  subtitleStatus: CoverageStatus;
  voiceoverStatus: CoverageStatus;
  metadataStatus: CoverageStatus;
  thumbnailUrl: string | null;
  watchUrl: string | null;
};

export type CoverageVideoSelectable = CoverageVideoBase & {
  selectable: true;
  muxAssetId: string;
  unselectableReason: null;
};

export type CoverageVideoUnmappable = CoverageVideoBase & {
  selectable: false;
  muxAssetId: null;
  unselectableReason: string;
};

export type CoverageVideo = CoverageVideoSelectable | CoverageVideoUnmappable;

export type CoverageCollection = {
  id: string;
  title: string;
  label: string;
  publishedAt: string | null;
  videos: CoverageVideo[];
};

export type CoverageLanguageOption = {
  id: string;
  englishLabel: string;
  nativeLabel: string;
};

export type CoverageSubmitStatus = 'created' | 'failed' | 'skipped';

export type CoverageSubmitResultItem = {
  mediaId: string;
  title: string;
  muxAssetId: string | null;
  status: CoverageSubmitStatus;
  reason: string | null;
  jobId: string | null;
};

export type CoverageSubmitResult = {
  created: number;
  failed: number;
  skipped: number;
  items: CoverageSubmitResultItem[];
};
