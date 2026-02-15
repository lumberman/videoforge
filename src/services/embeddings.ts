import { embeddingsWithMuxAi } from '@/services/mux-ai';

export async function generateEmbeddings(text: string) {
  return embeddingsWithMuxAi(text);
}
