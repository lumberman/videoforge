import { env } from '@/config/env';

export async function syncArtifactsToStrapi(opts: {
  jobId: string;
  muxAssetId: string;
  artifacts: Record<string, string>;
  metadataUrl?: string;
}): Promise<{ synced: boolean; reason?: string }> {
  if (!env.strapiEndpoint || !env.strapiApiToken) {
    return {
      synced: false,
      reason: 'Strapi is not configured.'
    };
  }

  // Intentionally lightweight for scaffold. Real integration should map to your Strapi content type.
  return { synced: true };
}
