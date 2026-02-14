export async function uploadEnrichedAsset(opts: {
  jobId: string;
  sourceAssetId: string;
  artifactUrls: Record<string, string>;
}): Promise<{ playbackId: string; status: 'uploaded' }> {
  const playbackId = `playback_${opts.jobId.slice(-8)}`;
  return {
    playbackId,
    status: 'uploaded'
  };
}
