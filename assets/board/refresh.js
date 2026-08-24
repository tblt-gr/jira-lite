import { api } from './api.js';
import {
    canonicalEpicId,
    issueBelongsToEpic,
    issueEpicIds
} from './jira.js';

export function createIssueRefresher(context) {
    let cursor = new Date().toISOString();
    let refreshing = false;

    function availableEpicSignature() {
        return context.availableEpics()
            .map(canonicalEpicId)
            .sort()
            .join('|');
    }

    function statusColumnName(issue) {
        const statusId = String(issue.fields?.status?.id ?? '');
        const columns =
            context.state.data.configuration?.columnConfig?.columns || [];

        return columns.find(column =>
            (column.statuses || []).some(status =>
                String(status.id) === statusId
            )
        )?.name || null;
    }

    function issueIsVisible(issue) {
        if (!context.matchesSearch(issue)) {
            return false;
        }

        if (!context.state.selectedEpicIds.size) {
            return true;
        }

        return Array.from(context.state.selectedEpicIds).some(id =>
            issueBelongsToEpic(issue, id)
        );
    }

    function targetGroupsForIssue(issue) {
        if (context.state.view !== 'epic') {
            return Array.from(
                context.board.querySelectorAll('.board-group')
            );
        }

        const ids = issueEpicIds(issue);

        if (!ids.size) {
            const withoutEpic = context.board.querySelector(
                '[data-group-id="__without_epic__"]'
            );

            return withoutEpic ? [withoutEpic] : [];
        }

        return Array.from(context.board.querySelectorAll('.board-group'))
            .filter(group => ids.has(group.dataset.groupId));
    }

    function insertCardByRank(column, card, issueKey) {
        const order = new Map(
            (context.state.data.issues?.issues || [])
                .map((issue, index) => [issue.key, index])
        );
        const rank = order.get(issueKey) ?? Number.MAX_SAFE_INTEGER;
        const next = Array.from(column.querySelectorAll('.card'))
            .find(candidate =>
                (order.get(candidate.dataset.issueKey) ??
                    Number.MAX_SAFE_INTEGER) > rank
            );

        column.insertBefore(card, next || null);
    }

    function updateVisibleCounters() {
        context.board.querySelectorAll('.column')
            .forEach(context.updateColumnCount);

        context.board.querySelectorAll('.board-group').forEach(group => {
            const cards = Array.from(group.querySelectorAll('.card'));
            const uniqueKeys = new Set(cards.map(card => card.dataset.issueKey));
            const ticketCount = group.querySelector('.group-ticket-count');

            if (ticketCount) {
                ticketCount.textContent = uniqueKeys.size;
            }
        });

        const visibleKeys = new Set(
            Array.from(context.board.querySelectorAll('.card'))
                .map(card => card.dataset.issueKey)
        );
        const groupCount =
            context.board.querySelectorAll('.board-group').length;

        context.counter.textContent =
            `${visibleKeys.size} ticket${visibleKeys.size > 1 ? 's' : ''}` +
            ` · ${context.state.view === 'epic'
                ? `${groupCount} groupe${groupCount > 1 ? 's' : ''}`
                : 'board unique'}`;
    }

    function patchIssues(changedKeys) {
        const issueMap = new Map(
            (context.state.data.issues?.issues || [])
                .map(issue => [issue.key, issue])
        );

        changedKeys.forEach(key => {
            context.board.querySelectorAll('.card').forEach(card => {
                if (card.dataset.issueKey === key) {
                    card.remove();
                }
            });

            const issue = issueMap.get(key);

            if (!issue || !issueIsVisible(issue)) {
                return;
            }

            const columnName = statusColumnName(issue);

            if (!columnName) {
                return;
            }

            targetGroupsForIssue(issue).forEach(group => {
                const column = Array.from(group.querySelectorAll('.column'))
                    .find(item => item.dataset.columnName === columnName);

                if (!column) {
                    return;
                }

                insertCardByRank(
                    column,
                    context.createCard(issue, context.epicForIssue(issue)),
                    issue.key
                );
            });
        });

        updateVisibleCounters();
    }

    async function refresh() {
        if (!context.state.data || refreshing || document.hidden) {
            return;
        }

        refreshing = true;

        try {
            const changes = await api(
                `/api/jira/board/${context.boardId}/changes?since=${
                    encodeURIComponent(cursor)
                }`
            );
            const changedIssues = Array.isArray(changes.issues)
                ? changes.issues
                : [];
            const removedKeys = Array.isArray(changes.removed)
                ? changes.removed.map(String)
                : [];
            const changedKeys = new Set([
                ...removedKeys,
                ...changedIssues.map(issue => issue.key)
            ]);

            cursor = changes.cursor || new Date().toISOString();

            if (!changedKeys.size) {
                return;
            }

            const previousEpicSignature = availableEpicSignature();
            const issuesByKey = new Map(
                (context.state.data.issues?.issues || [])
                    .map(issue => [issue.key, issue])
            );

            removedKeys.forEach(key => issuesByKey.delete(key));
            changedIssues.forEach(issue => issuesByKey.set(issue.key, issue));
            context.state.data.issues.issues = Array.from(issuesByKey.values());

            const allowedEpicIds = new Set(
                context.availableEpics().map(canonicalEpicId)
            );
            context.state.selectedEpicIds = new Set(
                Array.from(context.state.selectedEpicIds)
                    .filter(id => allowedEpicIds.has(id))
            );

            context.renderEpics();
            context.updateEpicFilter();

            if (previousEpicSignature !== availableEpicSignature()) {
                context.writeEpicsToUrl(true);
                context.renderBoard(false);
            } else {
                patchIssues(changedKeys);
            }
        } catch {
            // Le prochain cycle réessaiera silencieusement.
        } finally {
            refreshing = false;
        }
    }

    return {
        refresh,
        setCursor(value) {
            cursor = value || cursor;
        }
    };
}
