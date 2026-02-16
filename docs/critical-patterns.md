# Critical Patterns (Required Reading)

This document captures high-impact engineering patterns that must be applied to avoid repeat incidents.

## Coverage Gateway Fallback Contracts (Schema Drift + `muxAssetId` Mapping)

When an adapter has REST -> GraphQL fallback behavior, treat fallback query shape as a strict contract.

Required rules:
- Query only schema-safe fields for the target environment. Use alias-compatible forms when direct fields are not guaranteed across gateways.
- Include all downstream-required mapping fields in fallback queries (for coverage selection, this includes a valid `muxAssetId` extraction path).
- Fail deterministically when fallback returns candidate records but required mappings are missing. Do not silently render non-selectable output.
- Keep normalization logic and query documents aligned; do not rely on extractor heuristics if query fields are absent.

Required tests:
- Force REST-empty/404 paths so GraphQL fallback branches execute in CI.
- Add contract tests that assert fallback query documents include required mapping fields.
- Cover both fallback success (selectable mappings present) and deterministic failure (mappings absent).

Reference incident and fix:
- `/videoforge/docs/solutions/integration-issues/graphql-schema-drift-and-muxasset-mapping-coverage-gateway-20260215.md`
