const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

function readStringEnv(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberEnv(key: string, fallback: number): number {
  const raw = readStringEnv(key);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const OPENROUTER_SUBTITLE_MODELS = {
  theology:
    readStringEnv('OPENROUTER_SUBTITLE_THEOLOGY_MODEL') ??
    readStringEnv('OPENROUTER_DEFAULT_MODEL') ??
    DEFAULT_OPENROUTER_MODEL,
  languageQuality:
    readStringEnv('OPENROUTER_SUBTITLE_LANGUAGE_MODEL') ??
    readStringEnv('OPENROUTER_DEFAULT_MODEL') ??
    DEFAULT_OPENROUTER_MODEL
} as const;

export const OPENROUTER_SUBTITLE_SETTINGS = {
  baseUrl: readStringEnv('OPENROUTER_BASE_URL') ?? DEFAULT_OPENROUTER_BASE_URL,
  appName: readStringEnv('OPENROUTER_APP_NAME') ?? 'videoforge',
  siteUrl: readStringEnv('OPENROUTER_SITE_URL'),
  temperature: 0,
  maxTokensTheology: readNumberEnv('OPENROUTER_SUBTITLE_THEOLOGY_MAX_TOKENS', 1200),
  maxTokensLanguageQuality: readNumberEnv(
    'OPENROUTER_SUBTITLE_LANGUAGE_MAX_TOKENS',
    2200
  ),
  timeoutMs: readNumberEnv('OPENROUTER_TIMEOUT_MS', 30000)
} as const;

export function hasOpenRouterApiKey(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}
