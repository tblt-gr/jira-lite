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
    view,
    searchQuery
}) {
    const columns = data?.configuration?.columnConfig?.columns || [];
    const issues = data?.issues?.issues || [];
    const matchingIssues = issues.filter(issue =>
        issueMatchesSearch(issue, searchQuery)
    );
    const epics = availableEpics(data);
    const epicsById = new Map(
        epics.map(epic => [canonicalEpicId(epic), epic])
    );
    const selectedEpics = Array.from(selectedEpicIds || [])
        .map(id => epicsById.get(id))
        .filter(Boolean);
    const filteredIssues = selectedEpics.length
        ? matchingIssues.filter(issue => selectedEpics.some(epic =>
            issueBelongsToEpic(issue, canonicalEpicId(epic))
        ))
        : matchingIssues;
    let groups;

    if (view === 'epic') {
        const displayedEpics = selectedEpics.length ? selectedEpics : epics;
        const hasSearch = String(searchQuery || '').trim() !== '';

        groups = displayedEpics.map(epic => ({
            epic,
            issues: matchingIssues.filter(issue =>
                issueBelongsToEpic(issue, canonicalEpicId(epic))
            )
        })).filter(group => !hasSearch || group.issues.length > 0);

        if (!selectedEpics.length) {
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
        statusToColumn: statusColumnMap(columns),
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
