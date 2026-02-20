import type { LanguageClass } from '@/services/subtitle-post-process/types';

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);
const CJK_LANGS = new Set(['zh', 'ja', 'ko']);

const RTL_SCRIPTS = new Set(['arab', 'hebr']);
const CJK_SCRIPTS = new Set(['hans', 'hant', 'hani', 'kana', 'jpan', 'hang', 'kore']);

interface ParsedBcp47 {
  language: string;
  script?: string;
}

export function parseBcp47(value: string): ParsedBcp47 {
  const normalized = value.trim();
  if (!normalized) {
    return { language: 'en' };
  }

  const parts = normalized.split('-').filter(Boolean);
  const language = (parts[0] ?? 'en').toLowerCase();

  let script: string | undefined;
  for (const part of parts.slice(1)) {
    if (part.length === 4) {
      script = part.toLowerCase();
      break;
    }
  }

  return { language, script };
}

export function classifyLanguage(bcp47: string): LanguageClass {
  const parsed = parseBcp47(bcp47);

  if (parsed.script && RTL_SCRIPTS.has(parsed.script)) {
    return 'RTL';
  }

  if (parsed.script && CJK_SCRIPTS.has(parsed.script)) {
    return 'CJK';
  }

  if (RTL_LANGS.has(parsed.language)) {
    return 'RTL';
  }

  if (CJK_LANGS.has(parsed.language)) {
    return 'CJK';
  }

  return 'LTR';
}
