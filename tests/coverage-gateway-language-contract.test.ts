import assert from 'node:assert/strict';
import test from 'node:test';

import { importFresh, withEnv } from './helpers/temp-env';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('fetchCoverageLanguages GraphQL fallback uses schema-safe native label alias', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calledUrls.push(url);

    if (url.endsWith('/api/languages')) {
      return jsonResponse({ languages: [] });
    }

    if (url === 'https://gateway.test') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string };
      assert.match(body.query ?? '', /nativeName:\s*name\(primary:\s*true\)/i);
      assert.doesNotMatch(body.query ?? '', /\bnativeName\s*\{/);

      return jsonResponse({
        data: {
          languages: [
            {
              id: '529',
              name: [{ value: 'English' }],
              nativeName: [{ value: 'English' }]
            }
          ]
        }
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );
        const languages = await module.fetchCoverageLanguages('https://gateway.test');

        assert.equal(languages.length, 1);
        assert.equal(languages[0]?.id, '529');
        assert.equal(languages[0]?.englishLabel, 'English');
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calledUrls.some((url) => url.endsWith('/api/languages')), true);
  assert.equal(calledUrls.includes('https://gateway.test'), true);
});

test('fetchCoverageLanguages throws deterministic error when GraphQL fallback returns field error', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.endsWith('/api/languages')) {
      return jsonResponse({ languages: [] });
    }

    if (url === 'https://gateway.test') {
      return jsonResponse({
        errors: [{ message: 'Cannot query field "nativeName" on type "Language".' }]
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
      },
      async () => {
        const module = await importFresh<typeof import('../src/services/coverage-gateway')>(
          '../src/services/coverage-gateway'
        );

        await assert.rejects(
          async () => module.fetchCoverageLanguages('https://gateway.test'),
          /Cannot query field "nativeName"/i
        );
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
