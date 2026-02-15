import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type EnvOverrides = Record<string, string | undefined>;

const trackedKeys = [
  'WORKFLOW_WORLD',
  'JOBS_DB_PATH',
  'ARTIFACT_ROOT_PATH',
  'NODE_ENV',
  'OPENROUTER_API_KEY',
  'MUX_AI_WORKFLOW_SECRET_KEY',
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
  'STRAPI_ENDPOINT',
  'STRAPI_API_TOKEN'
] as const;

let importCounter = 0;

function captureEnv(keys: readonly string[]): EnvOverrides {
  const snapshot: EnvOverrides = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: EnvOverrides): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export async function withEnv<T>(
  overrides: EnvOverrides,
  run: () => Promise<T>
): Promise<T> {
  const keys = [...new Set([...Object.keys(overrides), ...trackedKeys])];
  const snapshot = captureEnv(keys);

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    restoreEnv(snapshot);
  }
}

export async function withTempDataEnv<T>(
  prefix: string,
  run: (ctx: { root: string; jobsDbPath: string; artifactRootPath: string }) => Promise<T>
): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), `videoforge-${prefix}-`));
  const jobsDbPath = path.join(root, 'jobs.json');
  const artifactRootPath = path.join(root, 'artifacts');

  try {
    return await withEnv(
      {
        WORKFLOW_WORLD: 'local',
        JOBS_DB_PATH: jobsDbPath,
        ARTIFACT_ROOT_PATH: artifactRootPath
      },
      async () => run({ root, jobsDbPath, artifactRootPath })
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function importFresh<T>(modulePath: string): Promise<T> {
  importCounter += 1;
  const rootResolved = path.resolve(process.cwd(), 'tests', modulePath);
  const candidates = [rootResolved, `${rootResolved}.ts`, `${rootResolved}.tsx`];

  let absolutePath = candidates[0] as string;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      absolutePath = candidate;
      break;
    } catch {
      // Continue until a matching candidate is found.
    }
  }

  const fileUrl = pathToFileURL(absolutePath).href;
  return (await import(`${fileUrl}?fresh=${Date.now()}-${importCounter}`)) as T;
}
