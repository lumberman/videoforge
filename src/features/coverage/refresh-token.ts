export function isCoverageForceRefreshToken(value: string | undefined): boolean {
  return value?.trim() === '1';
}
