import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { env } from '@/config/env';

function sanitizeName(name: string): string {
  return name.replace(/\.\./g, '').replace(/\//g, '_');
}

async function writeArtifact(
  jobId: string,
  artifactName: string,
  value: string | Uint8Array
): Promise<string> {
  const safeName = sanitizeName(artifactName);
  const dir = path.join(env.artifactRootPath, jobId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  await writeFile(filePath, value);
  return `/api/artifacts/${encodeURIComponent(jobId)}/${encodeURIComponent(safeName)}`;
}

export async function storeJsonArtifact(
  jobId: string,
  artifactName: string,
  value: unknown
): Promise<string> {
  return writeArtifact(jobId, artifactName, `${JSON.stringify(value, null, 2)}\n`);
}

export async function storeTextArtifact(
  jobId: string,
  artifactName: string,
  value: string
): Promise<string> {
  return writeArtifact(jobId, artifactName, value);
}

export async function storeBinaryArtifact(
  jobId: string,
  artifactName: string,
  value: Uint8Array
): Promise<string> {
  return writeArtifact(jobId, artifactName, value);
}
