import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { importFresh, withTempDataEnv, withEnv } from './helpers/temp-env';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('coverage page renders gateway configuration guidance when env vars are missing', async () => {
  await withTempDataEnv('dashboard-coverage-no-gateway', async () => {
    await withEnv(
      {
        NEXT_PUBLIC_GATEWAY_URL: undefined,
        NEXT_STAGE_GATEWAY_URL: undefined
      },
      async () => {
        const pageModule = await importFresh<typeof import('../src/app/dashboard/coverage/page')>(
          '../src/app/dashboard/coverage/page'
        );

        const html = renderToStaticMarkup(await pageModule.default({}));
        assert.match(html, /Coverage gateway is not configured/i);
      }
    );
  });
});

test('coverage page renders empty state when gateway returns no collections', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/languages')) {
      return jsonResponse({
        languages: [
          {
            id: '529',
            englishLabel: 'English',
            nativeLabel: 'English'
          }
        ]
      });
    }

    if (url.includes('/api/coverage/collections')) {
      return jsonResponse({
        collections: []
      });
    }

    return jsonResponse({ error: 'unexpected request' }, 500);
  }) as typeof globalThis.fetch;

  try {
    await withTempDataEnv('dashboard-coverage-empty', async () => {
      await withEnv(
        {
          NEXT_PUBLIC_GATEWAY_URL: 'https://gateway.test'
        },
        async () => {
          const pageModule = await importFresh<
            typeof import('../src/app/dashboard/coverage/page')
          >('../src/app/dashboard/coverage/page');

          const html = renderToStaticMarkup(await pageModule.default({}));
          assert.match(html, /Coverage Reporting/i);
          assert.match(html, /No coverage records match the current filters\./i);
        }
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
