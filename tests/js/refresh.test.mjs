import assert from 'node:assert/strict';
import test from 'node:test';

import { createIssueRefresher } from '../../assets/board/refresh.js';

test('does not overwrite a local transition with an older refresh response', async () => {
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    let resolveResponse;
    const state = {
        data: {
            issues: {
                issues: [{
                    key: 'APP-1',
                    fields: { status: { id: '2', name: 'En cours' } }
                }]
            }
        },
        issueRevisions: new Map([['APP-1', 1]]),
        selectedEpicIds: new Set()
    };
    let renderCalls = 0;

    globalThis.document = { hidden: false };
    globalThis.fetch = () => new Promise(resolve => {
        resolveResponse = resolve;
    });

    try {
        const refresher = createIssueRefresher({
            boardId: 7,
            state,
            trans: key => key,
            availableEpics: () => [],
            renderEpics() {},
            renderFilters() {},
            writeEpicsToUrl() {},
            renderBoard() {
                ++renderCalls;
            },
            api: path => fetch(`/api/jira${path}`).then(response =>
                response.json()
            )
        });
        const refresh = refresher.refresh();

        state.issueRevisions.set('APP-1', 2);
        resolveResponse(new Response(JSON.stringify({
            cursor: '2026-08-27T12:00:00+00:00',
            issues: [{
                key: 'APP-1',
                fields: { status: { id: '1', name: 'À faire' } }
            }],
            removed: []
        })));
        await refresh;

        assert.equal(state.data.issues.issues[0].fields.status.id, '2');
        assert.equal(renderCalls, 0);
    } finally {
        globalThis.document = originalDocument;
        globalThis.fetch = originalFetch;
    }
});
