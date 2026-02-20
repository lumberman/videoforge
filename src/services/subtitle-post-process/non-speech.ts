const BRACKETED_NON_SPEECH = /^\[(music|applause|laughter|silence|noise|inaudible|offscreen)\]$/i;
const MUSICAL_NON_SPEECH = /^♪.*♪$/u;

export function isNonSpeechTokenText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  return BRACKETED_NON_SPEECH.test(normalized) || MUSICAL_NON_SPEECH.test(normalized);
}
