// This module owns optimistic Jira transitions; drag-drop.js owns pointer and selection state.
export async function moveIssuesToColumn({
    items,
    sourceColumn,
    targetColumn,
    column,
    targetStatusIds,
    boardId,
    trans,
    showToast,
    renderBoard,
    markIssuesUpdated,
    updateColumnCount,
    clearIssueSelection,
    api
}) {
    const originalOrder = Array.from(sourceColumn.querySelectorAll('.card'));
    const optimisticStatusId = targetStatusIds.values().next().value;
    const prepared = items.map(({ issue, card }) => ({
        issue,
        card,
        originalStatus: { ...(issue.fields?.status || {}) }
    }));

    markIssuesUpdated(prepared.map(({ issue }) => issue));
    prepared.forEach(({ issue, card, originalStatus }) => {
        issue.fields.status = {
            ...originalStatus,
            id: optimisticStatusId,
            name: column.name
        };
        targetColumn.append(card);
        card.classList.add('is-transitioning');
        card.draggable = false;
    });
    updateColumnCount(sourceColumn);
    updateColumnCount(targetColumn);
    targetColumn.classList.add('is-updating');

    try {
        const results = await Promise.allSettled(prepared.map(async ({ issue }) => {
            const issueUrl = `/issue/${encodeURIComponent(issue.key)}`;
            const transitions = await api(`${issueUrl}/transitions`);
            const selected = (transitions.transitions || []).find(item =>
                targetStatusIds.has(String(item.to?.id))
            );

            if (!selected) {
                throw new Error(trans('drag.no_transition', { column: column.name }));
            }

            const transitionedIssue = await api(`${issueUrl}/transition`, {
                method: 'POST',
                body: JSON.stringify({ transitionId: selected.id, boardId })
            });

            try {
                return await api(issueUrl, { cache: 'no-store' });
            } catch {
                return transitionedIssue;
            }
        }));
        const failedCards = new Set();
        let failedCount = 0;

        results.forEach((result, index) => {
            const item = prepared[index];

            if (result.status === 'fulfilled') {
                const updatedFields = result.value.fields || {};
                const updatedStatusId = String(updatedFields.status?.id || '');
                item.issue.fields = {
                    ...item.issue.fields,
                    ...updatedFields,
                    ...(!targetStatusIds.has(updatedStatusId)
                        ? { status: item.issue.fields.status }
                        : {})
                };
                markIssuesUpdated([item.issue]);
                return;
            }

            item.issue.fields.status = item.originalStatus;
            markIssuesUpdated([item.issue]);
            failedCards.add(item.card);
            ++failedCount;
        });

        originalOrder.forEach(originalCard => {
            if (
                originalCard.parentElement === sourceColumn
                || failedCards.has(originalCard)
            ) {
                sourceColumn.append(originalCard);
            }
        });
        updateColumnCount(sourceColumn);
        updateColumnCount(targetColumn);

        if (failedCount) {
            showToast(trans(
                failedCount === 1 ? 'drag.failed_one' : 'drag.failed_many',
                { count: failedCount }
            ), 'error');
        }

        if (prepared.some(item => !item.card.isConnected)) {
            renderBoard(false);
        }
    } finally {
        prepared.forEach(({ card }) => {
            card.classList.remove('is-transitioning');
            card.draggable = true;
        });
        targetColumn.classList.remove('is-updating');
        clearIssueSelection();
    }
}
