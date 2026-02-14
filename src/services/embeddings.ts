import { openRouter } from '@/services/openrouter';

export async function generateEmbeddings(text: string) {
  return openRouter.createEmbeddings(text);
}
