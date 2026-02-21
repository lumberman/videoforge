import type {
  Chapter,
  EmbeddingVector,
  MetadataResult,
  Transcript,
  TranscriptSegment,
  TranslationResult
} from '@/types/enrichment';
import { parseWebVtt } from '@/services/subtitle-post-process/vtt';

type UnknownModule = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => Promise<unknown> | unknown;
type MuxModuleName = '@mux/ai/workflows' | '@mux/ai/primitives' | '@mux/ai';
type MuxFeatureNamespace = 'workflows' | 'primitives';

export type MuxAiErrorCode =
  | 'MUX_AI_CONFIG_MISSING'
  | 'MUX_AI_IMPORT_FAILED'
  | 'MUX_AI_OPERATION_FAILED'
  | 'MUX_AI_INVALID_RESPONSE';

export class MuxAiError extends Error {
  readonly code: MuxAiErrorCode;
  readonly operatorHint: string;
  readonly isDependencyError: true;

  constructor(opts: {
    code: MuxAiErrorCode;
    message: string;
    operatorHint: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'MuxAiError';
    this.code = opts.code;
    this.operatorHint = opts.operatorHint;
    this.isDependencyError = true;
    if (opts.cause !== undefined) {
      this.cause = opts.cause;
    }
  }
}

export function isMuxAiError(value: unknown): value is MuxAiError {
  return value instanceof MuxAiError;
}

export interface MuxAiPreprocessWarning {
  code: MuxAiErrorCode;
  message: string;
  operatorHint: string;
}

export interface MuxAiPreprocessResult {
  vtt?: string;
  storyboard?: Record<string, unknown> | unknown[];
  chunks?: unknown[];
  warnings: MuxAiPreprocessWarning[];
}

type ModuleImporter = (moduleName: MuxModuleName) => Promise<UnknownModule>;

const defaultModuleImporter: ModuleImporter = async (moduleName) => {
  switch (moduleName) {
    case '@mux/ai/primitives':
      return (await import('@mux/ai/primitives')) as UnknownModule;
    case '@mux/ai/workflows':
      return (await import('@mux/ai/workflows')) as UnknownModule;
    case '@mux/ai':
      return (await import('@mux/ai')) as UnknownModule;
    default: {
      const exhaustiveCheck: never = moduleName;
      throw new Error(`Unsupported mux module import: ${String(exhaustiveCheck)}`);
    }
  }
};

let muxModuleImporter: ModuleImporter = defaultModuleImporter;

export function setMuxAiModuleImporterForTests(importer?: ModuleImporter): void {
  muxModuleImporter = importer ?? defaultModuleImporter;
}

function readEnvTrimmed(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnvPositiveInt(key: string): number | undefined {
  const raw = readEnvTrimmed(key);
  if (!raw) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function hasMuxAiRuntimeCredentials(): boolean {
  const workflowKey = readEnvTrimmed('MUX_AI_WORKFLOW_SECRET_KEY');
  const tokenId = readEnvTrimmed('MUX_TOKEN_ID');
  const tokenSecret = readEnvTrimmed('MUX_TOKEN_SECRET');
  return Boolean(
    workflowKey || (tokenId && tokenSecret)
  );
}

function getFunction(moduleRef: UnknownModule, candidates: string[]): UnknownFn | undefined {
  for (const name of candidates) {
    const fn = moduleRef[name];
    if (typeof fn === 'function') {
      return fn as UnknownFn;
    }
  }
  return undefined;
}

function getImportFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

function isModuleNotFound(error: unknown, moduleName: MuxModuleName): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return (
    /cannot find module/i.test(message) &&
    (message.includes(moduleName) || message.includes('@mux/ai'))
  );
}

function isEnvValidationFailure(message: string): boolean {
  return (
    /invalid env/i.test(message) ||
    /either\s+mux_token_id\s*\+\s*mux_token_secret\s+or\s+mux_ai_workflow_secret_key\s+must\s+be\s+set/i.test(
      message
    )
  );
}

function unwrapMuxNamespace(moduleRef: UnknownModule, namespace: MuxFeatureNamespace): UnknownModule {
  const nested = moduleRef[namespace];
  if (nested && typeof nested === 'object') {
    return nested as UnknownModule;
  }
  return moduleRef;
}

async function importMuxModule(
  moduleName: Exclude<MuxModuleName, '@mux/ai'>,
  namespace: MuxFeatureNamespace
): Promise<UnknownModule> {
  // @mux/ai exits the process on import when required env is missing.
  // Guarding before import preserves process health in local/test/prod.
  if (!hasMuxAiRuntimeCredentials()) {
    throw new MuxAiError({
      code: 'MUX_AI_CONFIG_MISSING',
      message:
        'Mux AI runtime credentials are missing. Set MUX_AI_WORKFLOW_SECRET_KEY or MUX_TOKEN_ID/MUX_TOKEN_SECRET.',
      operatorHint:
        'Configure MUX_AI_WORKFLOW_SECRET_KEY (preferred) or MUX_TOKEN_ID and MUX_TOKEN_SECRET, then retry the job.'
    });
  }

  let importError: unknown;
  try {
    const moduleRef = await muxModuleImporter(moduleName);
    return unwrapMuxNamespace(moduleRef, namespace);
  } catch (error) {
    importError = error;
    const causeMessage = getImportFailureMessage(error);
    if (isEnvValidationFailure(causeMessage)) {
      throw new MuxAiError({
        code: 'MUX_AI_CONFIG_MISSING',
        message:
          'Mux AI environment is invalid. Configure MUX_AI_WORKFLOW_SECRET_KEY or MUX_TOKEN_ID and MUX_TOKEN_SECRET.',
        operatorHint:
          'Set valid MUX_AI_WORKFLOW_SECRET_KEY (preferred) or MUX_TOKEN_ID and MUX_TOKEN_SECRET. Confirm values are non-empty and retry.',
        cause: error
      });
    }
  }

  // Compatibility fallback: some @mux/ai versions expose namespaces only at root export.
  if (isModuleNotFound(importError, moduleName)) {
    try {
      const rootModule = await muxModuleImporter('@mux/ai');
      return unwrapMuxNamespace(rootModule, namespace);
    } catch (fallbackError) {
      const fallbackMessage = getImportFailureMessage(fallbackError);
      if (isEnvValidationFailure(fallbackMessage)) {
        throw new MuxAiError({
          code: 'MUX_AI_CONFIG_MISSING',
          message:
            'Mux AI environment is invalid. Configure MUX_AI_WORKFLOW_SECRET_KEY or MUX_TOKEN_ID and MUX_TOKEN_SECRET.',
          operatorHint:
            'Set valid MUX_AI_WORKFLOW_SECRET_KEY (preferred) or MUX_TOKEN_ID and MUX_TOKEN_SECRET. Confirm values are non-empty and retry.',
          cause: fallbackError
        });
      }

      throw new MuxAiError({
        code: 'MUX_AI_IMPORT_FAILED',
        message: fallbackMessage
          ? `Failed to import ${moduleName} and @mux/ai fallback. ${fallbackMessage}`
          : `Failed to import ${moduleName} and @mux/ai fallback.`,
        operatorHint:
          'Verify @mux/ai installation, Node 21+ runtime, and Mux environment configuration.',
        cause: fallbackError
      });
    }
  }

  const causeMessage = getImportFailureMessage(importError);
  throw new MuxAiError({
    code: 'MUX_AI_IMPORT_FAILED',
    message: causeMessage
      ? `Failed to import ${moduleName}. ${causeMessage}`
      : `Failed to import ${moduleName}.`,
    operatorHint: 'Verify @mux/ai installation, Node 21+ runtime, and Mux environment configuration.',
    cause: importError
  });
}

function toOperationFailed(operation: string, details: string, cause?: unknown): MuxAiError {
  return new MuxAiError({
    code: 'MUX_AI_OPERATION_FAILED',
    message: `Mux AI ${operation} failed: ${details}`,
    operatorHint: 'Check Mux credentials/service status and confirm the selected @mux/ai workflow function is available.',
    cause
  });
}

function toInvalidResponse(operation: string): MuxAiError {
  return new MuxAiError({
    code: 'MUX_AI_INVALID_RESPONSE',
    message: `Mux AI ${operation} returned an invalid response shape.`,
    operatorHint: 'Check @mux/ai version compatibility with this adapter and update function mappings if needed.'
  });
}

function isTranscript(value: unknown): value is Transcript {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Partial<Transcript>;
  return (
    typeof data.language === 'string' &&
    typeof data.text === 'string' &&
    Array.isArray(data.segments)
  );
}

function isChapterArray(value: unknown): value is Chapter[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as Partial<Chapter>).title === 'string' &&
        typeof (item as Partial<Chapter>).startSec === 'number' &&
        typeof (item as Partial<Chapter>).endSec === 'number'
    )
  );
}

function isMetadata(value: unknown): value is MetadataResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Partial<MetadataResult>;
  return (
    typeof data.title === 'string' &&
    typeof data.summary === 'string' &&
    Array.isArray(data.tags) &&
    Array.isArray(data.speakers) &&
    Array.isArray(data.topics)
  );
}

function isEmbeddingArray(value: unknown): value is EmbeddingVector[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as Partial<EmbeddingVector>).id === 'string' &&
        Array.isArray((item as Partial<EmbeddingVector>).values) &&
        typeof (item as Partial<EmbeddingVector>).text === 'string'
    )
  );
}

function isTranslation(value: unknown): value is TranslationResult {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Partial<TranslationResult>).language === 'string' &&
    typeof (value as Partial<TranslationResult>).text === 'string'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJsonLike(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || (!!value && typeof value === 'object');
}

function isMissingExportError(error: MuxAiError): boolean {
  return (
    error.code === 'MUX_AI_OPERATION_FAILED' &&
    /none of \[.*\] are exported by the module/i.test(error.message)
  );
}

function canFallbackFromOptionalError(error: MuxAiError): boolean {
  return isMissingExportError(error) || error.code === 'MUX_AI_INVALID_RESPONSE';
}

async function callMuxFn<T>(opts: {
  moduleRef: UnknownModule;
  operation: string;
  candidates: string[];
  args: unknown[];
  parser: (value: unknown) => value is T;
}): Promise<T> {
  const fn = getFunction(opts.moduleRef, opts.candidates);
  if (!fn) {
    throw toOperationFailed(
      opts.operation,
      `none of [${opts.candidates.join(', ')}] are exported by the module`
    );
  }

  let value: unknown;
  try {
    value = await fn(...opts.args);
  } catch (error) {
    const causeMessage = getImportFailureMessage(error);
    throw toOperationFailed(
      opts.operation,
      causeMessage
        ? `function call threw an exception: ${causeMessage}`
        : 'function call threw an exception',
      error
    );
  }

  if (!opts.parser(value)) {
    throw toInvalidResponse(opts.operation);
  }

  return value;
}

async function tryOptionalMuxFn<T>(opts: {
  moduleRef: UnknownModule;
  operation: string;
  candidates: string[];
  args: unknown[];
  parser: (value: unknown) => value is T;
  swallowAllErrors?: boolean;
}): Promise<T | undefined> {
  try {
    return await callMuxFn(opts);
  } catch (error) {
    if (isMuxAiError(error)) {
      if (canFallbackFromOptionalError(error)) {
        return undefined;
      }
      if (!opts.swallowAllErrors) {
        throw error;
      }
      console.warn(
        `[mux-ai][optional-fallback] operation="${opts.operation}" code="${error.code}" message="${error.message}"`
      );
      return undefined;
    }
    throw error;
  }
}

async function tryOptionalMuxFnWithFallbackArgs<T>(opts: {
  moduleRef: UnknownModule;
  operation: string;
  candidates: string[];
  primaryArgs: unknown[];
  fallbackArgs: unknown[];
  parser: (value: unknown) => value is T;
  swallowAllErrors?: boolean;
}): Promise<T | undefined> {
  const primary = await tryOptionalMuxFn({
    moduleRef: opts.moduleRef,
    operation: opts.operation,
    candidates: opts.candidates,
    args: opts.primaryArgs,
    parser: opts.parser,
    swallowAllErrors: opts.swallowAllErrors
  });
  if (primary !== undefined) {
    return primary;
  }

  return tryOptionalMuxFn({
    moduleRef: opts.moduleRef,
    operation: opts.operation,
    candidates: opts.candidates,
    args: opts.fallbackArgs,
    parser: opts.parser,
    swallowAllErrors: opts.swallowAllErrors
  });
}

type MuxAssetRecord = {
  playback_ids?: Array<{ id?: string; policy?: string }>;
  tracks?: Array<{
    id?: string;
    type?: string;
    language_code?: string;
    status?: string;
    name?: string;
  }>;
};

type PrimitiveTranscriptFetchResult = {
  transcriptText: string;
  transcriptUrl?: string;
  track?: { language_code?: string };
};

type PrimitiveVttCue = {
  startTime: number;
  endTime: number;
  text: string;
};

type WorkflowChaptersResult = {
  chapters: Array<{ title: string; startTime: number }>;
};

type WorkflowSummaryResult = {
  title: string;
  description: string;
  tags: string[];
};

type WorkflowEmbeddingsResult = {
  chunks: Array<{ chunkId: string; embedding: number[] }>;
};

type WorkflowCaptionTranslationResult = {
  targetLanguageCode: string;
  translatedVtt: string;
};

const ISO3_TO_ISO1_MAP: Record<string, string> = {
  ara: 'ar',
  bul: 'bg',
  ces: 'cs',
  cym: 'cy',
  dan: 'da',
  deu: 'de',
  ell: 'el',
  eng: 'en',
  spa: 'es',
  est: 'et',
  fas: 'fa',
  fin: 'fi',
  fra: 'fr',
  heb: 'he',
  hin: 'hi',
  hrv: 'hr',
  hun: 'hu',
  ind: 'id',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  lit: 'lt',
  lav: 'lv',
  msa: 'ms',
  nld: 'nl',
  nor: 'no',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rus: 'ru',
  slk: 'sk',
  slv: 'sl',
  srp: 'sr',
  swe: 'sv',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  urd: 'ur',
  vie: 'vi',
  zho: 'zh'
};

const languageCodeCache = new Map<string, string>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeLanguageCode(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const bcp47Match = trimmed.match(/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i);
  if (bcp47Match) {
    const base = trimmed.split('-')[0] ?? trimmed;
    if (base.length === 2) {
      return base;
    }
    if (base.length === 3) {
      return ISO3_TO_ISO1_MAP[base] ?? null;
    }
  }

  return null;
}

function toPlainTextFromVtt(vtt: string): string {
  return vtt
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line !== 'WEBVTT' &&
        !line.includes('-->') &&
        !/^\d+$/.test(line)
    )
    .join(' ')
    .trim();
}

function translationSegmentsFromVtt(vtt: string): TranscriptSegment[] {
  const parsed = parseWebVtt(vtt);
  return parsed.cues
    .map((cue) => ({
      startSec: cue.start,
      endSec: Math.max(cue.end, cue.start + 0.001),
      text: normalizeCueText(cue.text)
    }))
    .filter((segment) => segment.text.length > 0);
}

function normalizeCueText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapVttCuesToTranscriptSegments(cues: PrimitiveVttCue[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const cue of cues) {
    const text = normalizeCueText(cue.text);
    if (!text) {
      continue;
    }

    const start = Number.isFinite(cue.startTime) ? Math.max(0, cue.startTime) : 0;
    const endCandidate = Number.isFinite(cue.endTime) ? cue.endTime : start;
    const end = Math.max(start + 0.001, endCandidate);

    segments.push({
      startSec: start,
      endSec: end,
      text
    });
  }

  return segments.sort((first, second) => first.startSec - second.startSec);
}

function isPrimitiveVttCueArray(value: unknown): value is PrimitiveVttCue[] {
  return (
    Array.isArray(value) &&
    value.every((cue) => {
      if (!cue || typeof cue !== 'object') {
        return false;
      }
      const record = cue as Partial<PrimitiveVttCue>;
      return (
        typeof record.startTime === 'number' &&
        typeof record.endTime === 'number' &&
        typeof record.text === 'string'
      );
    })
  );
}

async function extractTranscriptSegmentsFromRawVtt(
  primitives: UnknownModule,
  rawVtt: string,
  muxAssetId: string
): Promise<TranscriptSegment[]> {
  const parseVTTCues = getFunction(primitives, ['parseVTTCues']);
  if (!parseVTTCues) {
    throw toOperationFailed(
      'primitives transcription',
      `parseVTTCues export is required to preserve transcript segmentation for asset ${muxAssetId}`
    );
  }

  let parsed: unknown;
  try {
    parsed = await Promise.resolve(parseVTTCues(rawVtt));
  } catch (error) {
    const causeMessage = getImportFailureMessage(error);
    throw toOperationFailed(
      'primitives transcription',
      causeMessage
        ? `parseVTTCues threw an exception: ${causeMessage}`
        : `parseVTTCues threw an exception for asset ${muxAssetId}`,
      error
    );
  }

  if (!isPrimitiveVttCueArray(parsed)) {
    throw toOperationFailed(
      'primitives transcription',
      `parseVTTCues returned an invalid cue array for asset ${muxAssetId}`
    );
  }

  const segments = mapVttCuesToTranscriptSegments(parsed);
  if (segments.length === 0) {
    throw toOperationFailed(
      'primitives transcription',
      `parseVTTCues returned no transcript cues for asset ${muxAssetId}`
    );
  }

  return segments;
}

function isPrimitiveTranscriptFetchResult(value: unknown): value is PrimitiveTranscriptFetchResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<PrimitiveTranscriptFetchResult>;
  return typeof record.transcriptText === 'string';
}

function isWorkflowChaptersResult(value: unknown): value is WorkflowChaptersResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<WorkflowChaptersResult>;
  return (
    Array.isArray(record.chapters) &&
    record.chapters.every(
      (chapter) =>
        chapter &&
        typeof chapter === 'object' &&
        typeof chapter.title === 'string' &&
        typeof chapter.startTime === 'number'
    )
  );
}

function isWorkflowSummaryResult(value: unknown): value is WorkflowSummaryResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<WorkflowSummaryResult>;
  return (
    typeof record.title === 'string' &&
    typeof record.description === 'string' &&
    Array.isArray(record.tags) &&
    record.tags.every((tag) => typeof tag === 'string')
  );
}

function isWorkflowEmbeddingsResult(value: unknown): value is WorkflowEmbeddingsResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<WorkflowEmbeddingsResult>;
  return (
    Array.isArray(record.chunks) &&
    record.chunks.every(
      (chunk) =>
        chunk &&
        typeof chunk === 'object' &&
        typeof chunk.chunkId === 'string' &&
        Array.isArray(chunk.embedding) &&
        chunk.embedding.every((entry) => typeof entry === 'number')
    )
  );
}

function isWorkflowCaptionTranslationResult(value: unknown): value is WorkflowCaptionTranslationResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<WorkflowCaptionTranslationResult>;
  return typeof record.targetLanguageCode === 'string' && typeof record.translatedVtt === 'string';
}

function computeTranscriptDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 2));
}

type MuxTextTrackStatus = 'ready' | 'preparing' | 'errored';

const DEFAULT_SUBTITLE_POLL_INTERVAL_MS = 2_000;
const DEFAULT_SUBTITLE_POLL_MAX_ATTEMPTS = 30;

function getSubtitlePollIntervalMs(): number {
  return readEnvPositiveInt('MUX_SUBTITLE_POLL_INTERVAL_MS') ?? DEFAULT_SUBTITLE_POLL_INTERVAL_MS;
}

function getSubtitlePollMaxAttempts(): number {
  return (
    readEnvPositiveInt('MUX_SUBTITLE_POLL_MAX_ATTEMPTS') ?? DEFAULT_SUBTITLE_POLL_MAX_ATTEMPTS
  );
}

function toTrackStatus(value: string | undefined): MuxTextTrackStatus | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ready' || normalized === 'preparing' || normalized === 'errored') {
    return normalized;
  }
  return null;
}

function languageMatches(trackLanguage: string | undefined, preferredLanguage: string | null): boolean {
  if (!preferredLanguage) {
    return true;
  }
  const normalizedTrackLanguage = normalizeLanguageCode(trackLanguage ?? '');
  return normalizedTrackLanguage === preferredLanguage;
}

function findTextTrackByStatus(
  asset: MuxAssetRecord,
  status: MuxTextTrackStatus,
  preferredLanguage: string | null
): { id: string; language_code?: string; status?: string } | null {
  for (const rawTrack of asset.tracks ?? []) {
    if (!rawTrack || typeof rawTrack !== 'object') {
      continue;
    }
    if (rawTrack.type !== 'text') {
      continue;
    }
    if (toTrackStatus(rawTrack.status) !== status) {
      continue;
    }
    if (!languageMatches(rawTrack.language_code, preferredLanguage)) {
      continue;
    }
    const id = typeof rawTrack.id === 'string' ? rawTrack.id.trim() : '';
    if (!id) {
      continue;
    }
    return {
      id,
      language_code: rawTrack.language_code,
      status: rawTrack.status
    };
  }
  return null;
}

function selectAudioTrackForSubtitleGeneration(asset: MuxAssetRecord): { id: string } | null {
  let firstAudioTrackId: string | null = null;
  for (const rawTrack of asset.tracks ?? []) {
    if (!rawTrack || typeof rawTrack !== 'object') {
      continue;
    }
    if (rawTrack.type !== 'audio') {
      continue;
    }
    const id = typeof rawTrack.id === 'string' ? rawTrack.id.trim() : '';
    if (!id) {
      continue;
    }
    if (!firstAudioTrackId) {
      firstAudioTrackId = id;
    }
    if (toTrackStatus(rawTrack.status) === 'ready') {
      return { id };
    }
  }
  if (!firstAudioTrackId) {
    return null;
  }
  return { id: firstAudioTrackId };
}

function isMissingTranscriptTrackErrorMessage(message: string): boolean {
  return (
    /no transcript track found/i.test(message) ||
    /no caption track found/i.test(message) ||
    /available languages:\s*none/i.test(message)
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getTranscriptLanguageFromAsset(asset: MuxAssetRecord): string | null {
  for (const rawTrack of asset.tracks ?? []) {
    if (!rawTrack || typeof rawTrack !== 'object') {
      continue;
    }
    const track = rawTrack;
    if (track.type !== 'text') {
      continue;
    }

    const status = typeof track.status === 'string' ? track.status.toLowerCase() : '';
    if (status && status !== 'ready') {
      continue;
    }

    const languageCode = typeof track.language_code === 'string' ? track.language_code : '';
    const normalized = normalizeLanguageCode(languageCode);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function getPlaybackIdFromAsset(asset: MuxAssetRecord): string | null {
  const playbackIds = asArray(asset.playback_ids);
  if (playbackIds.length === 0) {
    return null;
  }

  for (const entry of playbackIds) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const policy = typeof record.policy === 'string' ? record.policy.trim().toLowerCase() : '';
    if (id && policy === 'public') {
      return id;
    }
  }

  for (const entry of playbackIds) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (id) {
      return id;
    }
  }

  return null;
}

function readMuxApiCredentials(): { tokenId: string; tokenSecret: string } {
  const tokenId = readEnvTrimmed('MUX_TOKEN_ID');
  const tokenSecret = readEnvTrimmed('MUX_TOKEN_SECRET');
  if (!tokenId || !tokenSecret) {
    throw new MuxAiError({
      code: 'MUX_AI_CONFIG_MISSING',
      message:
        'Mux API credentials are required for transcript retrieval. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.',
      operatorHint:
        'Configure MUX_TOKEN_ID and MUX_TOKEN_SECRET so @mux/ai primitives can fetch asset transcript tracks.'
    });
  }
  return { tokenId, tokenSecret };
}

async function fetchMuxAsset(muxAssetId: string): Promise<MuxAssetRecord> {
  const { tokenId, tokenSecret } = readMuxApiCredentials();
  const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');
  const response = await fetch(`https://api.mux.com/video/v1/assets/${encodeURIComponent(muxAssetId)}`, {
    method: 'GET',
    headers: {
      authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    throw toOperationFailed(
      'asset lookup',
      `Mux API returned HTTP ${response.status} while fetching asset ${muxAssetId}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw toOperationFailed('asset lookup', 'Mux API response was not valid JSON', error);
  }

  const root = asRecord(payload);
  const data = asRecord(root?.data);
  if (!data) {
    throw toInvalidResponse('asset lookup');
  }
  return data as MuxAssetRecord;
}

async function requestMuxGeneratedSubtitles(
  muxAssetId: string,
  audioTrackId: string,
  languageCode?: string
): Promise<void> {
  const normalizedLanguageCode = normalizeLanguageCode(languageCode ?? '') ?? 'auto';
  const { tokenId, tokenSecret } = readMuxApiCredentials();
  const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64');

  const response = await fetch(
    `https://api.mux.com/video/v1/assets/${encodeURIComponent(muxAssetId)}/tracks/${encodeURIComponent(audioTrackId)}/generate-subtitles`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        generated_subtitles: [
          {
            language_code: normalizedLanguageCode
          }
        ]
      })
    }
  );

  if (!response.ok) {
    let responseDetails = '';
    try {
      const raw = await response.text();
      if (raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          const root = asRecord(parsed);
          const error = asRecord(root?.error);
          const directMessage =
            (typeof error?.message === 'string' ? error.message : null) ??
            (typeof root?.message === 'string' ? root.message : null);
          responseDetails = directMessage?.trim() ?? raw.trim();
        } catch {
          responseDetails = raw.trim();
        }
      }
    } catch {
      responseDetails = '';
    }

    throw toOperationFailed(
      'subtitle generation request',
      responseDetails
        ? `Mux API returned HTTP ${response.status} while generating subtitles for asset ${muxAssetId}: ${responseDetails}`
        : `Mux API returned HTTP ${response.status} while generating subtitles for asset ${muxAssetId}`
    );
  }
}

async function waitForMuxTextTrackReady(
  muxAssetId: string,
  preferredLanguage: string | null
): Promise<MuxAssetRecord> {
  const maxAttempts = getSubtitlePollMaxAttempts();
  const intervalMs = getSubtitlePollIntervalMs();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const asset = await fetchMuxAsset(muxAssetId);
    const readyTrack = findTextTrackByStatus(asset, 'ready', preferredLanguage);
    if (readyTrack) {
      return asset;
    }

    const erroredTrack = findTextTrackByStatus(asset, 'errored', preferredLanguage);
    if (erroredTrack) {
      throw toOperationFailed(
        'subtitle generation poll',
        `Mux text track ${erroredTrack.id} failed while generating subtitles for asset ${muxAssetId}`
      );
    }

    if (attempt < maxAttempts) {
      await sleepMs(intervalMs);
    }
  }

  throw toOperationFailed(
    'subtitle generation poll',
    `Timed out waiting for generated subtitles on asset ${muxAssetId} after ${maxAttempts} attempts`
  );
}

async function ensureTranscriptTrackAvailable(
  muxAssetId: string,
  asset: MuxAssetRecord,
  preferredLanguage: string | null
): Promise<MuxAssetRecord> {
  const readyTrack = findTextTrackByStatus(asset, 'ready', preferredLanguage);
  if (readyTrack) {
    return asset;
  }

  const preparingTrack = findTextTrackByStatus(asset, 'preparing', preferredLanguage);
  if (!preparingTrack) {
    const audioTrack = selectAudioTrackForSubtitleGeneration(asset);
    if (!audioTrack) {
      throw toOperationFailed(
        'subtitle generation request',
        `Mux asset ${muxAssetId} has no eligible audio track for subtitle generation`
      );
    }
    await requestMuxGeneratedSubtitles(muxAssetId, audioTrack.id, preferredLanguage ?? undefined);
  }

  return waitForMuxTextTrackReady(muxAssetId, preferredLanguage);
}

function mapWorkflowChapters(result: WorkflowChaptersResult, transcript: Transcript): Chapter[] {
  const sorted = [...result.chapters].sort((first, second) => first.startTime - second.startTime);
  const transcriptEnd =
    transcript.segments.length > 0
      ? Math.max(...transcript.segments.map((segment) => segment.endSec))
      : computeTranscriptDuration(transcript.text);

  const chapters: Chapter[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const start = Math.max(0, Math.floor(current.startTime));
    const fallbackEnd = Math.max(start + 1, transcriptEnd);
    const end = next ? Math.max(start + 1, Math.floor(next.startTime)) : fallbackEnd;
    chapters.push({
      title: current.title,
      startSec: start,
      endSec: end
    });
  }

  return chapters;
}

function mapWorkflowSummary(result: WorkflowSummaryResult): MetadataResult {
  return {
    title: result.title,
    summary: result.description,
    tags: result.tags,
    speakers: [],
    topics: result.tags
  };
}

function mapWorkflowEmbeddings(result: WorkflowEmbeddingsResult): EmbeddingVector[] {
  return result.chunks.map((chunk) => ({
    id: chunk.chunkId,
    text: chunk.chunkId,
    values: chunk.embedding
  }));
}

function resolveCoreEndpoint(): string | null {
  const direct = readEnvTrimmed('CORE_API_ENDPOINT');
  const fallback = readEnvTrimmed('NEXT_STAGE_GATEWAY_URL');
  return direct ?? fallback ?? null;
}

async function fetchLanguageCodeFromCore(languageId: string): Promise<string | null> {
  const endpoint = resolveCoreEndpoint();
  if (!endpoint) {
    return null;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-graphql-client-name': 'videoforge-jobs'
    },
    body: JSON.stringify({
      query: `
        query ResolveLanguageCode($id: ID!) {
          language(id: $id) {
            id
            bcp47
            iso3
          }
        }
      `,
      variables: { id: languageId }
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: {
      language?: {
        bcp47?: string | null;
        iso3?: string | null;
      } | null;
    };
  };

  const language = payload.data?.language;
  if (!language) {
    return null;
  }

  const fromBcp47 = normalizeLanguageCode(language.bcp47 ?? '');
  if (fromBcp47) {
    return fromBcp47;
  }

  const fromIso3 = normalizeLanguageCode(language.iso3 ?? '');
  if (fromIso3) {
    return fromIso3;
  }

  return null;
}

async function resolveLanguageCode(value: string): Promise<string> {
  const cached = languageCodeCache.get(value);
  if (cached) {
    return cached;
  }

  const direct = normalizeLanguageCode(value);
  if (direct) {
    languageCodeCache.set(value, direct);
    return direct;
  }

  const remote = await fetchLanguageCodeFromCore(value);
  if (remote) {
    languageCodeCache.set(value, remote);
    return remote;
  }

  throw toOperationFailed(
    'language code resolution',
    `Unable to resolve language "${value}" to ISO-639-1 code`
  );
}

async function transcribeWithPrimitiveFetch(
  primitives: UnknownModule,
  muxAssetId: string
): Promise<Transcript> {
  const fetchTranscriptForAsset = getFunction(primitives, ['fetchTranscriptForAsset']);
  if (!fetchTranscriptForAsset) {
    throw toOperationFailed(
      'primitives transcription',
      `fetchTranscriptForAsset export is required to preserve transcript segmentation for asset ${muxAssetId}`
    );
  }

  let asset = await fetchMuxAsset(muxAssetId);
  let playbackId = getPlaybackIdFromAsset(asset);
  if (!playbackId) {
    throw toOperationFailed(
      'primitives transcription',
      `Mux asset ${muxAssetId} has no playback IDs.`
    );
  }

  let transcriptResponse: unknown;
  try {
    transcriptResponse = await fetchTranscriptForAsset(asset, playbackId, {
      required: true,
      cleanTranscript: false
    });
  } catch (error) {
    const causeMessage = getImportFailureMessage(error);
    const isMissingTrack = causeMessage
      ? isMissingTranscriptTrackErrorMessage(causeMessage)
      : false;
    if (!isMissingTrack) {
      throw toOperationFailed(
        'primitives transcription',
        causeMessage
          ? `fetchTranscriptForAsset threw an exception: ${causeMessage}`
          : 'fetchTranscriptForAsset threw an exception',
        error
      );
    }

    try {
      asset = await ensureTranscriptTrackAvailable(muxAssetId, asset, null);
      playbackId = getPlaybackIdFromAsset(asset) ?? playbackId;
      transcriptResponse = await fetchTranscriptForAsset(asset, playbackId, {
        required: true,
        cleanTranscript: false
      });
    } catch (recoveryError) {
      if (isMuxAiError(recoveryError)) {
        throw recoveryError;
      }
      const recoveryMessage = getImportFailureMessage(recoveryError);
      throw toOperationFailed(
        'primitives transcription',
        recoveryMessage
          ? `fetchTranscriptForAsset threw an exception: ${recoveryMessage}`
          : 'fetchTranscriptForAsset threw an exception',
        recoveryError
      );
    }
  }

  if (!isPrimitiveTranscriptFetchResult(transcriptResponse)) {
    throw toInvalidResponse('primitives transcription');
  }

  const rawTranscript = transcriptResponse.transcriptText.trim();
  if (!rawTranscript) {
    throw toOperationFailed(
      'primitives transcription',
      `fetchTranscriptForAsset returned empty transcript text for asset ${muxAssetId}`
    );
  }

  const segments = await extractTranscriptSegmentsFromRawVtt(
    primitives,
    rawTranscript,
    muxAssetId
  );
  const text = segments.map((segment) => segment.text).join(' ').trim();
  if (!text) {
    throw toOperationFailed(
      'primitives transcription',
      `fetchTranscriptForAsset returned empty transcript text for asset ${muxAssetId}`
    );
  }

  const language =
    normalizeLanguageCode(transcriptResponse.track?.language_code ?? '') ??
    getTranscriptLanguageFromAsset(asset) ??
    'en';

  return {
    language,
    text,
    segments
  };
}

export async function transcribeWithMuxAi(muxAssetId: string): Promise<Transcript> {
  const primitives = await importMuxModule('@mux/ai/primitives', 'primitives');
  const primitiveTranscribeCandidates = [
    'transcribe',
    'createTranscript',
    'generateTranscript',
    'transcriptFromAsset'
  ];
  if (getFunction(primitives, primitiveTranscribeCandidates)) {
    return callMuxFn({
      moduleRef: primitives,
      operation: 'primitives transcription',
      candidates: primitiveTranscribeCandidates,
      args: [muxAssetId],
      parser: isTranscript
    });
  }

  return transcribeWithPrimitiveFetch(primitives, muxAssetId);
}

export async function preprocessMuxAssetWithPrimitives(
  muxAssetId: string,
  transcript?: Transcript
): Promise<MuxAiPreprocessResult> {
  const primitives = await importMuxModule('@mux/ai/primitives', 'primitives');

  const vtt = await callMuxFn({
    moduleRef: primitives,
    operation: 'VTT generation',
    candidates: ['toVtt', 'generateVtt', 'createVtt', 'vttFromTranscript'],
    args: transcript ? [transcript] : [muxAssetId],
    parser: isNonEmptyString
  });

  const storyboard = await tryOptionalMuxFn({
    moduleRef: primitives,
    operation: 'storyboard generation',
    candidates: ['createStoryboard', 'generateStoryboard', 'storyboardFromAsset'],
    args: [muxAssetId],
    parser: isJsonLike
  });

  const chunks = await tryOptionalMuxFnWithFallbackArgs({
    moduleRef: primitives,
    operation: 'chunk generation',
    candidates: ['chunkTranscript', 'generateChunks', 'chunksFromTranscript'],
    primaryArgs: transcript ? [transcript] : [muxAssetId],
    fallbackArgs: [muxAssetId],
    parser: (value): value is unknown[] => Array.isArray(value)
  });

  return { vtt, storyboard, chunks, warnings: [] };
}

export async function chaptersWithMuxAi(
  muxAssetId: string,
  transcript: Transcript
): Promise<Chapter[]> {
  const workflows = await importMuxModule('@mux/ai/workflows', 'workflows');
  const languageCode = await resolveLanguageCode(transcript.language);
  const workflowChapters = await tryOptionalMuxFn({
    moduleRef: workflows,
    operation: 'workflow chapter extraction',
    candidates: ['generateChapters'],
    args: [muxAssetId, languageCode],
    parser: isWorkflowChaptersResult
  });
  if (workflowChapters) {
    return mapWorkflowChapters(workflowChapters, transcript);
  }

  return callMuxFn({
    moduleRef: workflows,
    operation: 'chapter extraction',
    candidates: ['extractChapters', 'chaptersWorkflow', 'runChaptersWorkflow'],
    args: [transcript],
    parser: isChapterArray
  });
}

export async function metadataWithMuxAi(
  muxAssetId: string,
  transcript: Transcript
): Promise<MetadataResult> {
  const workflows = await importMuxModule('@mux/ai/workflows', 'workflows');
  const workflowMetadata = await tryOptionalMuxFn({
    moduleRef: workflows,
    operation: 'workflow metadata extraction',
    candidates: ['getSummaryAndTags'],
    args: [muxAssetId],
    parser: isWorkflowSummaryResult
  });
  if (workflowMetadata) {
    return mapWorkflowSummary(workflowMetadata);
  }

  return callMuxFn({
    moduleRef: workflows,
    operation: 'metadata extraction',
    candidates: ['extractMetadata', 'metadataWorkflow', 'runMetadataWorkflow'],
    args: [transcript],
    parser: isMetadata
  });
}

export async function embeddingsWithMuxAi(
  muxAssetId: string,
  text: string
): Promise<EmbeddingVector[]> {
  const workflows = await importMuxModule('@mux/ai/workflows', 'workflows');
  const workflowEmbeddings = await tryOptionalMuxFn({
    moduleRef: workflows,
    operation: 'workflow embeddings generation',
    candidates: ['generateEmbeddings'],
    args: [muxAssetId],
    parser: isWorkflowEmbeddingsResult
  });
  if (workflowEmbeddings) {
    return mapWorkflowEmbeddings(workflowEmbeddings);
  }

  return callMuxFn({
    moduleRef: workflows,
    operation: 'embeddings generation',
    candidates: ['createEmbeddings', 'embeddingsWorkflow', 'runEmbeddingsWorkflow'],
    args: [text],
    parser: isEmbeddingArray
  });
}

export async function translateWithMuxAi(
  muxAssetId: string,
  transcript: Transcript,
  targetLanguage: string
): Promise<TranslationResult> {
  const workflows = await importMuxModule('@mux/ai/workflows', 'workflows');
  const sourceLanguageCode = await resolveLanguageCode(transcript.language);
  const targetLanguageCode = await resolveLanguageCode(targetLanguage);

  const workflowTranslation = await tryOptionalMuxFn({
    moduleRef: workflows,
    operation: 'workflow caption translation',
    candidates: ['translateCaptions'],
    args: [
      muxAssetId,
      sourceLanguageCode,
      targetLanguageCode,
      { provider: 'openai', uploadToMux: false }
    ],
    parser: isWorkflowCaptionTranslationResult
  });
  if (workflowTranslation) {
    const segments = translationSegmentsFromVtt(workflowTranslation.translatedVtt);
    if (segments.length === 0) {
      throw toOperationFailed(
        'workflow caption translation',
        'translateCaptions returned translatedVtt without subtitle cues'
      );
    }

    return {
      language: targetLanguage,
      text: toPlainTextFromVtt(workflowTranslation.translatedVtt),
      segments
    };
  }

  return callMuxFn({
    moduleRef: workflows,
    operation: 'translation',
    candidates: ['translateTranscript', 'translationWorkflow', 'runTranslationWorkflow'],
    args: [transcript, targetLanguage],
    parser: isTranslation
  });
}
