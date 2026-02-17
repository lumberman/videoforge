import { NextResponse } from 'next/server';
import {
  fetchCoverageLanguages,
  resolveCoverageGatewayBaseUrl
} from '@/services/coverage-gateway';

export const dynamic = 'force-dynamic';

function getGatewayErrorResponse() {
  return NextResponse.json(
    {
      error:
        'Coverage gateway is not configured. Set CORE_API_ENDPOINT or NEXT_STAGE_GATEWAY_URL.'
    },
    { status: 503 }
  );
}

export async function GET() {
  const baseUrl = resolveCoverageGatewayBaseUrl();
  if (!baseUrl) {
    return getGatewayErrorResponse();
  }

  try {
    const languages = await fetchCoverageLanguages(baseUrl);
    return NextResponse.json({ languages }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to load coverage languages from gateway.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
