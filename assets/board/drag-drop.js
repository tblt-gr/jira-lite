import { moveIssuesToColumn } from './drag-drop-transition.js';
import { createTransitionCache } from './transitions.js';

export function createDragDrop(context) {
    const {
        state,
        board,
        boardId,
        trans,
        showToast,
        renderBoard,
        markIssuesUpdated,
        api,
        readOnly
    } = context;
    const lifecycleController = new AbortController();
    const listenerOptions = { signal: lifecycleController.signal };
    const transitionCache = createTransitionCache(api);
    const columnStatusIds = new WeakMap();
    let dragScrollFrame = null;
    let dragScrollSpeed = 0;
    let dragToken = 0;

    function clearDropTargets() {
        board.querySelectorAll('.column.is-drag-over')
            .forEach(column => column.classList.remove('is-drag-over'));
    }

    function clearForbiddenTargets() {
        board.querySelectorAll('.column.is-drop-forbidden, .column.is-drop-allowed')
            .forEach(column => column.classList.remove(
                'is-drop-forbidden',
                'is-drop-allowed'
            ));
    }

    function acceptsStatuses(targetStatusIds) {
        const allowed = state.drag.allowedStatusIds;

        if (!allowed) {
            return true;
        }

        return Array.from(targetStatusIds).some(id => allowed.has(id));
    }

    function markForbiddenColumns(allowed) {
        const workflow = state.drag.workflow;

        if (!workflow || !allowed) {
            return;
        }

        const sourceStatusIds = new Set(state.drag.issues.map(issue =>
            String(issue.fields?.status?.id || '')
        ));

        workflow.querySelectorAll('.column').forEach(columnElement => {
            const statusIds = columnStatusIds.get(columnElement);

            if (!statusIds) {
                return;
            }

            const ids = Array.from(statusIds);
            // La colonne d'origine reste neutre : le drop y est déjà ignoré.
            const isSource = ids.some(id => sourceStatusIds.has(id));
            const isAllowed = ids.some(id => allowed.has(id));

            columnElement.classList.toggle(
                'is-drop-forbidden',
                !isSource && !isAllowed
            );
            columnElement.classList.toggle(
                'is-drop-allowed',
                !isSource && isAllowed
            );
        });
    }

    async function beginDragValidation() {
        const token = ++dragToken;
        const issues = state.drag.issues;
        state.drag.allowedStatusIds = null;

        if (!issues.length) {
            return;
        }

        const allowed = await transitionCache.allowedStatusIds(issues);

        if (token !== dragToken || !state.drag.issues.length) {
            return;
        }

        state.drag.allowedStatusIds = allowed;
        markForbiddenColumns(allowed);
    }

    function endDragValidation() {
        ++dragToken;
        state.drag.allowedStatusIds = null;
        clearForbiddenTargets();
    }

    function stopDragAutoScroll() {
        if (dragScrollFrame !== null) {
            window.cancelAnimationFrame(dragScrollFrame);
        }

        dragScrollFrame = null;
        dragScrollSpeed = 0;
        board.classList.remove(
            'is-auto-scrolling-left',
            'is-auto-scrolling-right'
        );
    }

    function runDragAutoScroll() {
        if (!state.drag.cards.length || dragScrollSpeed === 0) {
            stopDragAutoScroll();
            return;
        }

        const maximum = board.scrollWidth - board.clientWidth;
        const next = Math.max(
            0,
            Math.min(maximum, board.scrollLeft + dragScrollSpeed)
        );

        if (next === board.scrollLeft) {
            stopDragAutoScroll();
            return;
        }

        board.scrollLeft = next;
        dragScrollFrame = window.requestAnimationFrame(runDragAutoScroll);
    }

    function updateDragAutoScroll(clientX) {
        if (!state.drag.cards.length) {
            stopDragAutoScroll();
            return;
        }

        const edgeSize = Math.min(110, board.clientWidth * .18);
        const bounds = board.getBoundingClientRect();
        const maximum = board.scrollWidth - board.clientWidth;
        let direction = 0;
        let intensity = 0;

        if (clientX < bounds.left + edgeSize && board.scrollLeft > 0) {
            direction = -1;
            intensity = (bounds.left + edgeSize - clientX) / edgeSize;
        } else if (
            clientX > bounds.right - edgeSize
            && board.scrollLeft < maximum
        ) {
            direction = 1;
            intensity = (clientX - (bounds.right - edgeSize)) / edgeSize;
        }

        if (direction === 0) {
            stopDragAutoScroll();
            return;
        }

        dragScrollSpeed = direction * Math.max(
            2,
            Math.round(26 * Math.min(1, intensity) ** 2)
        );
        board.classList.toggle(
            'is-auto-scrolling-left',
            direction < 0
        );
        board.classList.toggle(
            'is-auto-scrolling-right',
            direction > 0
        );

        if (dragScrollFrame === null) {
            dragScrollFrame = window.requestAnimationFrame(runDragAutoScroll);
        }
    }

    function clearIssueSelection() {
        state.selectedIssueKeys.clear();
        state.selectedColumnId = null;
        board.querySelectorAll('.card.is-selected').forEach(card => {
            card.classList.remove('is-selected');
            card.setAttribute('aria-pressed', 'false');
        });
    }

    function columnSelectionId(column) {
        const groupId = column.closest('.board-group')?.dataset.groupId || '';

        return `${groupId}:${column.dataset.columnName || ''}`;
    }

    function toggleIssueSelection(card) {
        const column = card.closest('.column');

        if (!column) {
            return;
        }

        const selectionId = columnSelectionId(column);

        if (
            state.selectedColumnId &&
            state.selectedColumnId !== selectionId
        ) {
            clearIssueSelection();
        }

        const issueKey = card.dataset.issueKey;
        const selected = !state.selectedIssueKeys.has(issueKey);

        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));

        if (selected) {
            state.selectedIssueKeys.add(issueKey);
            state.selectedColumnId = selectionId;
        } else {
            state.selectedIssueKeys.delete(issueKey);

            if (!state.selectedIssueKeys.size) {
                state.selectedColumnId = null;
            }
        }
    }

    function updateColumnCount(column) {
        const count = column.querySelector('.column-count');

        if (count) {
            count.textContent = column.querySelectorAll('.card').length;
        }
    }

    function enableDropZone(columnElement, column, workflow) {
        if (readOnly) {
            return;
        }

        const targetStatusIds = new Set(
            (column.statuses || []).map(status => String(status.id))
        );
        columnStatusIds.set(columnElement, targetStatusIds);

        columnElement.addEventListener('dragover', event => {
            const valid =
                state.drag.issues.length > 0 &&
                state.drag.workflow === workflow &&
                state.drag.issues.every(issue =>
                    !targetStatusIds.has(String(
                        issue.fields?.status?.id || ''
                    ))
                ) &&
                acceptsStatuses(targetStatusIds);

            if (!valid) {
                columnElement.classList.remove('is-drag-over');
                return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            clearDropTargets();
            columnElement.classList.add('is-drag-over');
        }, listenerOptions);

        columnElement.addEventListener('dragleave', event => {
            if (!columnElement.contains(event.relatedTarget)) {
                columnElement.classList.remove('is-drag-over');
            }
        }, listenerOptions);

        columnElement.addEventListener('drop', event => {
            event.preventDefault();
            stopDragAutoScroll();

            const issues = state.drag.issues;
            const cards = state.drag.cards;
            const sameWorkflow = state.drag.workflow === workflow;
            const sourceColumn = state.drag.card?.closest('.column');

            clearDropTargets();

            if (
                !issues.length ||
                !cards.length ||
                !sameWorkflow ||
                !sourceColumn
            ) {
                return;
            }

            if (issues.some(issue => targetStatusIds.has(String(
                issue.fields?.status?.id || ''
            )))) {
                return;
            }

            if (!acceptsStatuses(targetStatusIds)) {
                return;
            }

            moveIssuesToColumn({
                items: issues.map((issue, index) => ({
                    issue,
                    card: cards[index]
                })),
                sourceColumn,
                targetColumn: columnElement,
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
            });
        }, listenerOptions);
    }

    function handleBoardDragover(event) {
        updateDragAutoScroll(event.clientX);
    }

    function handleBoardDragleave(event) {
        const bounds = board.getBoundingClientRect();
        const outside = event.clientX < bounds.left
            || event.clientX > bounds.right
            || event.clientY < bounds.top
            || event.clientY > bounds.bottom;

        if (outside) {
            stopDragAutoScroll();
        }
    }

    board.addEventListener('dragover', handleBoardDragover, listenerOptions);
    board.addEventListener('dragleave', handleBoardDragleave, listenerOptions);

    return {
        beginDragValidation,
        clearDropTargets,
        clearSelection: clearIssueSelection,
        enableDropZone,
        endDragValidation,
        stopAutoScroll: stopDragAutoScroll,
        toggleSelection: toggleIssueSelection,
        updateColumnCount,
        destroy() {
            lifecycleController.abort();
            stopDragAutoScroll();
            clearDropTargets();
            endDragValidation();
            transitionCache.clear();
        }
    };
}
