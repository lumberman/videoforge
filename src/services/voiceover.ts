import { openRouter } from '@/services/openrouter';

export async function createVoiceover(text: string, language: string) {
  return openRouter.textToSpeech(text, language);
}
