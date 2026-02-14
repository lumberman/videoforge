import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

let storeLock = Promise.resolve();

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
  try {
    const content = await readFile(filePath, 'utf8');
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
    throw error;
  }
}

export async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
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
