import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi } from '../../assets/board/api.js';

test('creates API clients with isolated route prefixes', async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls = [];

    globalThis.fetch = async url => {
        requestedUrls.push(String(url));

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        await createApi('/api/demo/')('/board/9001');
        await createApi()('/board/7');

        assert.deepEqual(requestedUrls, [
            '/api/demo/board/9001',
            '/api/jira/board/7'
        ]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
