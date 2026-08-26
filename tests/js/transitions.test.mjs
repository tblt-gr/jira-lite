import assert from 'node:assert/strict';
import test from 'node:test';

import { createTransitionCache } from '../../assets/board/transitions.js';

test('transition cache intersects status ids across issues', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => ({
        ok: true,
        status: 200,
        json: async () => ({
            transitions: String(url).includes('APP-1')
                ? [{ to: { id: '2' } }, { to: { id: '3' } }]
                : [{ to: { id: '3' } }]
        })
    });

    try {
        const cache = createTransitionCache();
        const statuses = await cache.allowedStatusIds([
            { key: 'APP-1', fields: { status: { id: '1' } } },
            { key: 'APP-2', fields: { status: { id: '1' } } }
        ]);

        assert.deepEqual([...statuses], ['3']);
        assert.equal(await cache.allowedStatusIds([]), null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
