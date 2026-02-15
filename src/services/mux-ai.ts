import type {
  Chapter,
  EmbeddingVector,
  MetadataResult,
  Transcript,
  TranslationResult
} from '@/types/enrichment';

type UnknownModule = Record<string, unknown>;
type UnknownFn = (...args: unknown[]) => Promise<unknown> | unknown;
type MuxModuleName = '@mux/ai/workflows' | '@mux/ai/primitives';

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

const defaultModuleImporter: ModuleImporter = async (moduleName) =>
  (await import(moduleName)) as UnknownModule;

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

async function importMuxModule(moduleName: MuxModuleName): Promise<UnknownModule> {
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

  try {
    return await muxModuleImporter(moduleName);
  } catch (error) {
    throw new MuxAiError({
      code: 'MUX_AI_IMPORT_FAILED',
      message: `Failed to import ${moduleName}.`,
      operatorHint: 'Verify @mux/ai installation, Node 21+ runtime, and Mux environment configuration.',
      cause: error
    });
  }
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
    throw toOperationFailed(opts.operation, 'function call threw an exception', error);
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
}): Promise<T | undefined> {
  try {
    return await callMuxFn(opts);
  } catch (error) {
    if (isMuxAiError(error)) {
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
}): Promise<T | undefined> {
  const primary = await tryOptionalMuxFn({
    moduleRef: opts.moduleRef,
    operation: opts.operation,
    candidates: opts.candidates,
    args: opts.primaryArgs,
    parser: opts.parser
  });
  if (primary !== undefined) {
    return primary;
  }

  return tryOptionalMuxFn({
    moduleRef: opts.moduleRef,
    operation: opts.operation,
    candidates: opts.candidates,
    args: opts.fallbackArgs,
    parser: opts.parser
  });
}

function toPreprocessWarning(error: MuxAiError): MuxAiPreprocessWarning {
  return {
    code: error.code,
    message: error.message,
    operatorHint: error.operatorHint
  };
}

export async function transcribeWithMuxAi(muxAssetId: string): Promise<Transcript> {
  const primitives = await importMuxModule('@mux/ai/primitives');
  const primitiveTranscript = await tryOptionalMuxFn({
    moduleRef: primitives,
    operation: 'primitives transcription',
    candidates: ['transcribe', 'createTranscript', 'generateTranscript', 'transcriptFromAsset'],
    args: [muxAssetId],
    parser: isTranscript
  });
  if (primitiveTranscript) {
    return primitiveTranscript;
  }

  const workflows = await importMuxModule('@mux/ai/workflows');
  return callMuxFn({
    moduleRef: workflows,
    operation: 'workflow transcription',
    candidates: ['transcribe', 'transcriptionWorkflow', 'runTranscriptionWorkflow'],
    args: [muxAssetId],
    parser: isTranscript
  });
}

export async function preprocessMuxAssetWithPrimitives(
  muxAssetId: string,
  transcript?: Transcript
): Promise<MuxAiPreprocessResult> {
  const warnings: MuxAiPreprocessWarning[] = [];

  let primitives: UnknownModule;
  try {
    primitives = await importMuxModule('@mux/ai/primitives');
  } catch (error) {
    if (isMuxAiError(error)) {
      console.warn(
        `[mux-ai][optional-fallback] operation="primitives preprocessing" code="${error.code}" message="${error.message}"`
      );
      warnings.push(toPreprocessWarning(error));
      return { warnings };
    }
    throw error;
  }

  const vtt = await tryOptionalMuxFnWithFallbackArgs({
    moduleRef: primitives,
    operation: 'VTT generation',
    candidates: ['toVtt', 'generateVtt', 'createVtt', 'vttFromTranscript'],
    primaryArgs: transcript ? [transcript] : [muxAssetId],
    fallbackArgs: [muxAssetId],
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

  return { vtt, storyboard, chunks, warnings };
}

export async function chaptersWithMuxAi(transcript: Transcript): Promise<Chapter[]> {
  const workflows = await importMuxModule('@mux/ai/workflows');
  return callMuxFn({
    moduleRef: workflows,
    operation: 'chapter extraction',
    candidates: ['extractChapters', 'chaptersWorkflow', 'runChaptersWorkflow'],
    args: [transcript],
    parser: isChapterArray
  });
}

export async function metadataWithMuxAi(
  transcript: Transcript
): Promise<MetadataResult> {
  const workflows = await importMuxModule('@mux/ai/workflows');
  return callMuxFn({
    moduleRef: workflows,
    operation: 'metadata extraction',
    candidates: ['extractMetadata', 'metadataWorkflow', 'runMetadataWorkflow'],
    args: [transcript],
    parser: isMetadata
  });
}

export async function embeddingsWithMuxAi(text: string): Promise<EmbeddingVector[]> {
  const workflows = await importMuxModule('@mux/ai/workflows');
  return callMuxFn({
    moduleRef: workflows,
    operation: 'embeddings generation',
    candidates: ['createEmbeddings', 'embeddingsWorkflow', 'runEmbeddingsWorkflow'],
    args: [text],
    parser: isEmbeddingArray
  });
}

export async function translateWithMuxAi(
  transcript: Transcript,
  targetLanguage: string
): Promise<TranslationResult> {
  const workflows = await importMuxModule('@mux/ai/workflows');
  return callMuxFn({
    moduleRef: workflows,
    operation: 'translation',
    candidates: ['translateTranscript', 'translationWorkflow', 'runTranslationWorkflow'],
    args: [transcript, targetLanguage],
    parser: isTranslation
  });
}
