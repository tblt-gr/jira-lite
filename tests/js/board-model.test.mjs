import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createBoardViewModel,
    issueMatchesSearch,
    replaceIssues,
    storyPoints
} from '../../assets/board/board-model.js';

test('groups incomplete issues and keeps issues without an epic', () => {
    const data = {
        configuration: {
            columnConfig: {
                columns: [{
                    name: 'À faire',
                    statuses: [{ id: '1' }]
                }]
            }
        },
        epics: {
            values: [{ id: '10', key: 'APP-10', name: 'Refactor' }]
        },
        issues: {
            issues: [
                {
                    key: 'APP-1',
                    fields: {
                        summary: 'Avec epic',
                        status: { id: '1' },
                        epic: { id: '10' }
                    }
                },
                {
                    key: 'APP-2',
                    fields: { summary: 'Sans epic', status: { id: '1' } }
                },
                { key: 'APP-3', fields: {} }
            ]
        }
    };

    const model = createBoardViewModel({
        data,
        selectedEpicIds: new Set(),
        view: 'epic',
        searchQuery: ''
    });

    assert.equal(model.groups.length, 2);
    assert.deepEqual(
        model.groups[1].issues.map(issue => issue.key),
        ['APP-2', 'APP-3']
    );
});

test('search and story points tolerate missing Jira fields', () => {
    assert.equal(issueMatchesSearch({ key: 'APP-1' }, 'app-1'), true);
    assert.equal(storyPoints({ fields: {} }), null);
    assert.equal(storyPoints({ fields: { customfield_10016: 5 } }), 5);
});

test('replaces changed issues and removes stale issues', () => {
    const result = replaceIssues(
        [{ key: 'APP-1' }, { key: 'APP-2', value: 'old' }],
        [{ key: 'APP-2', value: 'new' }, { key: 'APP-3' }],
        ['APP-1']
    );

    assert.deepEqual(result, [
        { key: 'APP-2', value: 'new' },
        { key: 'APP-3' }
    ]);
});
