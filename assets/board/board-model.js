import {
    canonicalEpicId,
    epicIds,
    isActiveIssue,
    issueBelongsToEpic,
    issueEpicIds,
    issueEpicObject
} from './jira.js';

export function fieldValueByName(issue, names, pattern) {
    for (const [fieldId, fieldName] of Object.entries({
        ...(names || {}),
        ...(issue.names || {})
    })) {
        if (!pattern.test(String(fieldName))) {
            continue;
        }

        const value = issue.fields?.[fieldId];

        if (value !== undefined && value !== null) {
            return value;
        }
    }

    return null;
}

export function storyPoints(issue, names = {}) {
    const namedValue = fieldValueByName(
        issue,
        names,
        /story point|points d.?effort/i
    );
    const fallback = issue.fields?.storyPoints
        ?? issue.fields?.customfield_10016
        ?? issue.fields?.customfield_10026;
    const value = namedValue ?? fallback;

    return typeof value === 'number' || typeof value === 'string'
        ? value
        : null;
}

export function availableEpics(data) {
    const activeEpicIds = new Set();
    const candidates = [...(data?.epics?.values || [])];

    (data?.issues?.issues || [])
        .filter(isActiveIssue)
        .forEach(issue => {
            issueEpicIds(issue).forEach(id => activeEpicIds.add(id));

            const issueEpic = issueEpicObject(issue);
            const issueIds = issueEpic ? epicIds(issueEpic) : [];
            const alreadyKnown = issueEpic && candidates.some(epic =>
                epicIds(epic).some(id => issueIds.includes(id))
            );

            if (issueEpic && !alreadyKnown) {
                candidates.push(issueEpic);
            }
        });

    return candidates
        .filter(epic => epicIds(epic).some(id => activeEpicIds.has(id)))
        .filter((epic, index, values) =>
            values.findIndex(candidate =>
                canonicalEpicId(candidate) === canonicalEpicId(epic)
            ) === index
        );
}

export const WITHOUT_VERSION_ID = 'none';

function boardIssuesOf(data) {
    return data?.issues?.issues || [];
}

function byName(first, second) {
    return first.name.localeCompare(second.name);
}

export function availableVersions(data) {
    const versions = new Map();

    boardIssuesOf(data).forEach(issue => {
        (issue.fields?.fixVersions || []).forEach(version => {
            const id = version?.id ?? version?.name;

            if (id === undefined || id === null) {
                return;
            }

            const key = String(id);

            if (!versions.has(key)) {
                versions.set(key, {
                    id: key,
                    name: String(version.name ?? key)
                });
            }
        });
    });

    return Array.from(versions.values()).sort(byName);
}

export function availableIssueTypes(data) {
    const types = new Map();

    boardIssuesOf(data).forEach(issue => {
        const type = issue.fields?.issuetype;
        const id = type?.id ?? type?.name;

        if (id === undefined || id === null) {
            return;
        }

        const key = String(id);

        if (!types.has(key)) {
            types.set(key, {
                id: key,
                name: String(type.name ?? key),
                iconUrl: type.iconUrl ? String(type.iconUrl) : null
            });
        }
    });

    return Array.from(types.values()).sort(byName);
}

export function availableColumns(data) {
    return (data?.configuration?.columnConfig?.columns || [])
        .map(column => String(column?.name ?? ''))
        .filter(Boolean)
        .map(name => ({ id: name, name }));
}

export function issueMatchesSearch(issue, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    if (!normalizedQuery) {
        return true;
    }

    return [issue.key, issue.fields?.summary || '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
}

function issueMatchesVersions(issue, selectedIds) {
    if (!selectedIds?.size) {
        return true;
    }

    const versions = issue.fields?.fixVersions || [];

    if (!versions.length) {
        return selectedIds.has(WITHOUT_VERSION_ID);
    }

    return versions.some(version =>
        selectedIds.has(String(version?.id ?? version?.name))
    );
}

function issueMatchesTypes(issue, selectedIds) {
    if (!selectedIds?.size) {
        return true;
    }

    const type = issue.fields?.issuetype;
    const id = type?.id ?? type?.name;

    return id !== undefined
        && id !== null
        && selectedIds.has(String(id));
}

function issueMatchesColumns(issue, selectedIds, statusToColumn) {
    if (!selectedIds?.size) {
        return true;
    }

    const statusId = issue.fields?.status?.id;
    const column = statusId === undefined || statusId === null
        ? null
        : statusToColumn.get(String(statusId));

    return Boolean(column) && selectedIds.has(String(column.name));
}

export function epicForIssue(issue, epicCatalog) {
    const issueIds = issueEpicIds(issue);

    return epicCatalog.find(epic =>
        epicIds(epic).some(id => issueIds.has(id))
    ) || issueEpicObject(issue);
}

export function statusColumnMap(columns) {
    const result = new Map();

    columns.forEach(column => {
        (column.statuses || []).forEach(status => {
            result.set(String(status.id), column);
        });
    });

    return result;
}

export function createBoardViewModel({
    data,
    selectedEpicIds,
    epicFilterActive,
    view,
    searchQuery,
    selectedVersionIds,
    selectedTypeIds,
    selectedColumnIds
}) {
    const columns = data?.configuration?.columnConfig?.columns || [];
    const issues = data?.issues?.issues || [];
    const statusToColumn = statusColumnMap(columns);
    const matchingIssues = issues.filter(issue =>
        issueMatchesSearch(issue, searchQuery)
        && issueMatchesVersions(issue, selectedVersionIds)
        && issueMatchesTypes(issue, selectedTypeIds)
        && issueMatchesColumns(issue, selectedColumnIds, statusToColumn)
    );
    const epics = availableEpics(data);
    const epicsById = new Map(
        epics.map(epic => [canonicalEpicId(epic), epic])
    );
    const selectedEpics = Array.from(selectedEpicIds || [])
        .map(id => epicsById.get(id))
        .filter(Boolean);
    const filtersByEpic = epicFilterActive
        ?? Boolean(selectedEpicIds?.size);
    const filteredIssues = filtersByEpic
        ? matchingIssues.filter(issue => selectedEpics.some(epic =>
            issueBelongsToEpic(issue, canonicalEpicId(epic))
        ))
        : matchingIssues;
    let groups;

    if (view === 'epic') {
        const displayedEpics = filtersByEpic ? selectedEpics : epics;
        const hidesEmptyGroups = String(searchQuery || '').trim() !== ''
            || Boolean(selectedVersionIds?.size)
            || Boolean(selectedTypeIds?.size)
            || Boolean(selectedColumnIds?.size);

        groups = displayedEpics.map(epic => ({
            epic,
            issues: matchingIssues.filter(issue =>
                issueBelongsToEpic(issue, canonicalEpicId(epic))
            )
        })).filter(group => !hidesEmptyGroups || group.issues.length > 0);

        if (!filtersByEpic) {
            const withoutEpic = matchingIssues.filter(issue =>
                issueEpicIds(issue).size === 0
            );

            if (withoutEpic.length) {
                groups.push({ epic: null, issues: withoutEpic });
            }
        }
    } else {
        groups = [{ epic: null, issues: filteredIssues }];
    }

    return {
        columns,
        epics,
        groups,
        issues,
        statusToColumn,
        visibleIssueCount: new Set(
            groups.flatMap(group => group.issues.map(issue => issue.key))
        ).size
    };
}

export function replaceIssues(currentIssues, changedIssues, removedKeys = []) {
    const issuesByKey = new Map(
        (currentIssues || []).map(issue => [issue.key, issue])
    );

    removedKeys.forEach(key => issuesByKey.delete(String(key)));
    (changedIssues || []).forEach(issue => issuesByKey.set(issue.key, issue));

    return Array.from(issuesByKey.values());
}
