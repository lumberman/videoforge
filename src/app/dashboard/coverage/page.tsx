import React from 'react';
import { CoverageReportClient } from '@/features/coverage/coverage-report-client';
import { isCoverageForceRefreshToken } from '@/features/coverage/refresh-token';
import type { CoverageCollection, CoverageLanguageOption } from '@/features/coverage/types';
import {
  fetchCoverageCollections,
  fetchCoverageLanguages,
  resolveCoverageGatewayBaseUrl
} from '@/services/coverage-gateway';

export const dynamic = 'force-dynamic';

type CoveragePageSearchParams = {
  languageId?: string;
  languageIds?: string;
  refresh?: string;
};

function parseRequestedLanguageIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
}

export default async function CoveragePage({
  searchParams
}: {
  searchParams?: Promise<CoveragePageSearchParams | undefined>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const baseUrl = resolveCoverageGatewayBaseUrl();
  const gatewayConfigured = Boolean(baseUrl);

  let initialErrorMessage: string | null = null;
  let initialLanguages: CoverageLanguageOption[] = [];
  let initialCollections: CoverageCollection[] = [];
  let initialSelectedLanguageIds: string[] = [];

  if (!baseUrl) {
    initialErrorMessage =
      'Coverage gateway is not configured. Set CORE_API_ENDPOINT or NEXT_STAGE_GATEWAY_URL.';
  } else {
    try {
      initialLanguages = await fetchCoverageLanguages(baseUrl);

      const requestedLanguageIds = parseRequestedLanguageIds(
        resolvedSearchParams?.languageIds ?? resolvedSearchParams?.languageId
      );

      initialSelectedLanguageIds = requestedLanguageIds.filter((id) =>
        initialLanguages.some((language) => language.id === id)
      );

      if (initialSelectedLanguageIds.length === 0 && initialLanguages.length > 0) {
        initialSelectedLanguageIds = [initialLanguages[0].id];
      }

      if (initialSelectedLanguageIds.length > 0) {
        const forceRefresh = isCoverageForceRefreshToken(resolvedSearchParams?.refresh);
        initialCollections = await fetchCoverageCollections(baseUrl, initialSelectedLanguageIds, {
          forceRefresh
        });
      }
    } catch (error) {
      initialErrorMessage =
        error instanceof Error ? error.message : 'Unable to load coverage data from gateway.';
    }
  }

  return (
    <main>
      <CoverageReportClient
        gatewayConfigured={gatewayConfigured}
        initialLanguages={initialLanguages}
        initialCollections={initialCollections}
        initialSelectedLanguageIds={initialSelectedLanguageIds}
        initialErrorMessage={initialErrorMessage}
      />
    </main>
  );
}
