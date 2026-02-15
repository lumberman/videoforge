import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { env } from '@/config/env';

const MIME_BY_EXT: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
  mp3: 'audio/mpeg',
  txt: 'text/plain; charset=utf-8'
};

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; artifact: string[] }> }
) {
  const { jobId, artifact } = await context.params;
  if (!Array.isArray(artifact) || artifact.length === 0) {
    return new Response('Artifact path is required.', { status: 400 });
  }
  if (
    jobId.includes('..') ||
    artifact.some(
      (segment) =>
        segment.includes('..') || segment.includes('/') || segment.includes('\\')
    )
  ) {
    return new Response('Invalid artifact path.', { status: 400 });
  }

  const safeJobId = sanitizeSegment(jobId);
  const segments = artifact.map(sanitizeSegment).filter(Boolean);
  if (segments.length === 0) {
    return new Response('Artifact path is required.', { status: 400 });
  }

  const joined = segments.join('_');
  const root = path.resolve(env.artifactRootPath, safeJobId);
  const artifactPath = path.resolve(root, joined);

  if (artifactPath === root || !artifactPath.startsWith(root)) {
    return new Response('Invalid artifact path.', { status: 400 });
  }

  try {
    const buffer = await readFile(artifactPath);
    const ext = path.extname(artifactPath).replace('.', '').toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response('Artifact not found.', { status: 404 });
  }
}
