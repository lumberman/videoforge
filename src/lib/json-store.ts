import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

let storeLock = Promise.resolve();
const TRANSIENT_PARSE_RETRIES = 3;
const TRANSIENT_PARSE_RETRY_DELAY_MS = 15;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storeLock.then(fn, fn);
  storeLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function readJsonFile<T>(
  filePath: string,
  defaultValue: T
): Promise<T> {
  for (let attempt = 0; attempt <= TRANSIENT_PARSE_RETRIES; attempt += 1) {
    try {
      const content = await readFile(filePath, 'utf8');

      if (content.trim().length === 0) {
        if (attempt < TRANSIENT_PARSE_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, TRANSIENT_PARSE_RETRY_DELAY_MS)
          );
          continue;
        }
      }

      return JSON.parse(content) as T;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        return defaultValue;
      }

      if (
        error instanceof SyntaxError &&
        error.message.includes('Unexpected end of JSON input') &&
        attempt < TRANSIENT_PARSE_RETRIES
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, TRANSIENT_PARSE_RETRY_DELAY_MS)
        );
        continue;
      }

      throw error;
    }
  }

  return defaultValue;
}

export async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(value, null, 2);
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, filePath);
}

export async function updateJsonFile<T>(
  filePath: string,
  defaultValue: T,
  mutator: (current: T) => T
): Promise<T> {
  return withLock(async () => {
    const current = await readJsonFile(filePath, defaultValue);
    const next = mutator(current);
    await writeJsonFile(filePath, next);
    return next;
  });
}
