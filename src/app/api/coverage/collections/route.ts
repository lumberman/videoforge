import { NextResponse } from 'next/server';
import {
  fetchCoverageCollections,
  resolveCoverageGatewayBaseUrl
} from '@/services/coverage-gateway';

export const dynamic = 'force-dynamic';

const MAX_LANGUAGE_IDS = 20;
const MAX_LANGUAGE_ID_LENGTH = 64;
const LANGUAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function parseLanguageIds(
  request: Request
): { languageIds: string[]; error?: never } | { languageIds?: never; error: string } {
  const { searchParams } = new URL(request.url);
  const languageIds = [...new Set(
    (searchParams.get('languageIds') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )];

  if (languageIds.length === 0) {
    return { error: 'languageIds query param is required.' };
  }

  if (languageIds.length > MAX_LANGUAGE_IDS) {
    return {
      error: `languageIds supports at most ${MAX_LANGUAGE_IDS} values per request.`
    };
  }

  const invalid = languageIds.find(
    (id) => id.length > MAX_LANGUAGE_ID_LENGTH || !LANGUAGE_ID_PATTERN.test(id)
  );
  if (invalid) {
    return {
      error:
        'languageIds must contain only letters, numbers, underscores, and dashes (max 64 chars each).'
    };
  }

  return { languageIds };
}

export async function GET(request: Request) {
  const parsed = parseLanguageIds(request);
  if ('error' in parsed) {
    return NextResponse.json(
      { error: parsed.error },
      { status: 400 }
    );
  }
  const { languageIds } = parsed;

  const baseUrl = resolveCoverageGatewayBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          'Coverage gateway is not configured. Set CORE_API_ENDPOINT or NEXT_STAGE_GATEWAY_URL.'
      },
      { status: 503 }
    );
  }

  try {
    const collections = await fetchCoverageCollections(baseUrl, languageIds);
    return NextResponse.json({ languageIds, collections }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load coverage collections from gateway.';

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
