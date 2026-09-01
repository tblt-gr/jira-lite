import assert from 'node:assert/strict';
import test from 'node:test';

import {
    UNASSIGNED_ID,
    WITHOUT_VERSION_ID,
    availableAssignees,
    availableColumns,
    availableIssueTypes,
    availableVersions,
    createBoardViewModel,
    issueBoardId,
    issueMatchesSearch,
    replaceIssues,
    storyPoints
} from '../../assets/board/board-model.js';

test('finds the issue board from modern and legacy sprint fields', () => {
    assert.equal(issueBoardId({
        names: { customfield_10020: 'Sprint' },
        fields: {
            customfield_10020: [
                { state: 'closed', boardId: 7 },
                { state: 'active', boardId: 42 }
            ]
        }
    }), 42);
    assert.equal(issueBoardId({
        fields: {
            sprint: 'Sprint@1[id=3,rapidViewId=17,state=ACTIVE,name=Sprint 1]'
        }
    }), 17);
    assert.equal(issueBoardId({ fields: {} }), null);
});

const filterData = {
    configuration: {
        columnConfig: {
            columns: [
                { name: 'À faire', statuses: [{ id: '1' }] },
                { name: 'En cours', statuses: [{ id: '2' }] },
                { name: 'Terminé', statuses: [{ id: '3' }] }
            ]
        }
    },
    issues: {
        issues: [
            {
                key: 'APP-1',
                fields: {
                    summary: 'Corriger le tri',
                    status: { id: '1' },
                    issuetype: {
                        id: '10',
                        name: 'Bug',
                        iconUrl: 'bug.png'
                    },
                    fixVersions: [{ id: '100', name: '1.4.0' }],
                    assignee: {
                        accountId: 'alice',
                        displayName: 'Alice Martin',
                        avatarUrls: { '24x24': 'alice.png' }
                    }
                }
            },
            {
                key: 'APP-2',
                fields: {
                    summary: 'Ajouter les filtres',
                    status: { id: '2' },
                    issuetype: { id: '11', name: 'Story' },
                    fixVersions: [
                        { id: '100', name: '1.4.0' },
                        { id: '101', name: '1.5.0' }
                    ],
                    assignee: {
                        accountId: 'bob',
                        displayName: 'Bob Durand'
                    }
                }
            },
            {
                key: 'APP-3',
                fields: {
                    summary: 'Sans version',
                    status: { id: '3', statusCategory: { key: 'done' } },
                    issuetype: { id: '10', name: 'Bug' }
                }
            }
        ]
    }
};

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

test('lists board versions once, sorted by name', () => {
    assert.deepEqual(availableVersions(filterData), [
        { id: '100', name: '1.4.0' },
        { id: '101', name: '1.5.0' }
    ]);
});

test('lists board issue types once, sorted by name', () => {
    assert.deepEqual(availableIssueTypes(filterData), [
        { id: '10', name: 'Bug', iconUrl: 'bug.png' },
        { id: '11', name: 'Story', iconUrl: null }
    ]);
});

test('lists only assignees with a board issue', () => {
    assert.deepEqual(availableAssignees(filterData), [
        {
            id: 'alice',
            name: 'Alice Martin',
            user: filterData.issues.issues[0].fields.assignee
        },
        {
            id: 'bob',
            name: 'Bob Durand',
            user: filterData.issues.issues[1].fields.assignee
        }
    ]);
});

test('lists board columns in configuration order', () => {
    assert.deepEqual(availableColumns(filterData), [
        { id: 'À faire', name: 'À faire' },
        { id: 'En cours', name: 'En cours' },
        { id: 'Terminé', name: 'Terminé' }
    ]);
});

function filteredKeys(filters) {
    return createBoardViewModel({
        data: filterData,
        selectedEpicIds: new Set(),
        view: 'board',
        searchQuery: '',
        ...filters
    }).groups[0].issues.map(issue => issue.key);
}

test('keeps every issue when no filter is selected', () => {
    assert.deepEqual(filteredKeys({}), ['APP-1', 'APP-2', 'APP-3']);
});

test('filters issues by selected versions', () => {
    assert.deepEqual(
        filteredKeys({ selectedVersionIds: new Set(['101']) }),
        ['APP-2']
    );
});

test('filters issues without a version', () => {
    assert.deepEqual(
        filteredKeys({ selectedVersionIds: new Set([WITHOUT_VERSION_ID]) }),
        ['APP-3']
    );
});

test('filters issues by selected issue types', () => {
    assert.deepEqual(
        filteredKeys({ selectedTypeIds: new Set(['10']) }),
        ['APP-1', 'APP-3']
    );
});

test('filters issues by selected board columns', () => {
    assert.deepEqual(
        filteredKeys({ selectedColumnIds: new Set(['En cours']) }),
        ['APP-2']
    );
});

test('filters issues by multiple selected assignees', () => {
    assert.deepEqual(
        filteredKeys({ selectedAssigneeIds: new Set(['alice', 'bob']) }),
        ['APP-1', 'APP-2']
    );
});

test('filters unassigned issues', () => {
    assert.deepEqual(
        filteredKeys({ selectedAssigneeIds: new Set([UNASSIGNED_ID]) }),
        ['APP-3']
    );
});

test('combines filters with AND', () => {
    assert.deepEqual(
        filteredKeys({
            selectedVersionIds: new Set(['100']),
            selectedTypeIds: new Set(['10'])
        }),
        ['APP-1']
    );
});

test('applies filters to the epic view too', () => {
    const model = createBoardViewModel({
        data: filterData,
        selectedEpicIds: new Set(),
        view: 'epic',
        searchQuery: '',
        selectedTypeIds: new Set(['11'])
    });

    assert.deepEqual(
        model.groups.flatMap(group => group.issues.map(issue => issue.key)),
        ['APP-2']
    );
});

test('shows completed issues in the epic view when their column is selected', () => {
    const data = {
        ...filterData,
        epics: {
            values: [{ id: '20', key: 'APP-20', name: 'Terminé' }]
        },
        issues: {
            issues: filterData.issues.issues.map(issue => issue.key === 'APP-3'
                ? {
                    ...issue,
                    fields: {
                        ...issue.fields,
                        epic: { id: '20' }
                    }
                }
                : issue)
        }
    };
    const model = createBoardViewModel({
        data,
        selectedEpicIds: new Set(),
        view: 'epic',
        searchQuery: '',
        selectedColumnIds: new Set(['Terminé'])
    });

    assert.deepEqual(
        model.groups.flatMap(group => group.issues.map(issue => issue.key)),
        ['APP-3']
    );
});

test('supports an active epic filter with no selected epic', () => {
    const model = createBoardViewModel({
        data: filterData,
        selectedEpicIds: new Set(),
        epicFilterActive: true,
        view: 'epic',
        searchQuery: ''
    });

    assert.deepEqual(model.groups, []);
    assert.equal(model.visibleIssueCount, 0);
});

test('drops epic groups left empty by an active filter', () => {
    const data = {
        configuration: { columnConfig: { columns: [] } },
        epics: {
            values: [
                { id: '10', key: 'APP-E1', name: 'Filtres' },
                { id: '11', key: 'APP-E2', name: 'Refactor' }
            ]
        },
        issues: {
            issues: [
                {
                    key: 'APP-1',
                    fields: {
                        epic: { id: '10' },
                        issuetype: { id: '1', name: 'Bug' }
                    }
                },
                {
                    key: 'APP-2',
                    fields: {
                        epic: { id: '11' },
                        issuetype: { id: '2', name: 'Story' }
                    }
                }
            ]
        }
    };

    const model = createBoardViewModel({
        data,
        selectedEpicIds: new Set(),
        view: 'epic',
        searchQuery: '',
        selectedTypeIds: new Set(['1'])
    });

    assert.deepEqual(
        model.groups.map(group => group.epic?.id ?? null),
        ['10']
    );
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
