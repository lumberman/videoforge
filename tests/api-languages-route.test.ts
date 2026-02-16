import assert from 'node:assert/strict';
import test from 'node:test';
import { importFresh, withEnv } from './helpers/temp-env';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('api/languages search stays local-first and skips remote fetch on local hit', async () => {
  const originalFetch = globalThis.fetch;
  let remoteCallCount = 0;

  globalThis.fetch = (async () => {
    remoteCallCount += 1;
    return jsonResponse({ error: 'unexpected remote call' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
      },
      async () => {
        const routeModule = await importFresh<
          typeof import('../src/app/api/languages/route')
        >('../src/app/api/languages/route');

        const response = await routeModule.GET(
          new Request('http://localhost/api/languages?search=english')
        );

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          languages?: Array<{ id: string; englishLabel: string }>;
        };
        assert.ok((payload.languages?.length ?? 0) > 0);
        assert.equal(remoteCallCount, 0);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api/languages uses remote fallback only on local miss and supports stage gateway env', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calledUrls.push(url);

    return jsonResponse({
      data: {
        languages: [
          {
            id: 'remote-lang-1',
            name: [{ value: 'zzzz_codex_remote_only_123 language' }],
            nativeName: [{ value: 'Remote Native' }],
            countryLanguages: []
          }
        ]
      }
    });
  }) as typeof globalThis.fetch;

  try {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: undefined,
        NEXT_STAGE_GATEWAY_URL: 'https://stage.gateway.test'
      },
      async () => {
        const routeModule = await importFresh<
          typeof import('../src/app/api/languages/route')
        >('../src/app/api/languages/route');

        const response = await routeModule.GET(
          new Request('http://localhost/api/languages?search=zzzz_codex_remote_only_123')
        );

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
          languages?: Array<{ id: string; englishLabel: string }>;
        };

        assert.equal(calledUrls.length, 1);
        assert.equal(calledUrls[0], 'https://stage.gateway.test');
        assert.equal(payload.languages?.[0]?.id, 'remote-lang-1');
        assert.match(payload.languages?.[0]?.englishLabel ?? '', /zzzz_codex_remote_only_123/i);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
