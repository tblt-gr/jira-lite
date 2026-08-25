import { api } from './api.js';
import {
    createImage,
    initials,
    jiraAttachmentMediaUrl,
    jiraMediaUrl
} from './dom.js';
import { createIssueRefresher } from './refresh.js';
import {
    activeSprintNames,
    adfMentions,
    adfToSegments,
    adfToText,
    canonicalEpicId,
    epicColor,
    epicIds,
    epicLabel,
    isActiveIssue,
    issueBelongsToEpic,
    issueEpicIds,
    issueEpicObject
} from './jira.js';

export function mountBoard(root, boardId) {
    const state = {
        data: null,
        issue: null,
        selectedEpicIds: new Set(),
        collapsedEpicIds: new Set(),
        view: 'epic',
        draggedIssue: null,
        draggedIssues: [],
        draggedCard: null,
        draggedCards: [],
        draggedWorkflow: null,
        selectedIssueKeys: new Set(),
        selectedColumnId: null,
        currentUser: null,
        commentMentions: [],
        justDragged: false
    };

    const board = document.querySelector('#board');
    const search = document.querySelector('#search');
    const epicFilter = document.querySelector('#epic-filter');
    const epicFilterTrigger = document.querySelector('#epic-filter-trigger');
    const epicFilterLabel = document.querySelector('#epic-filter-label');
    const epicFilterCount = document.querySelector('#epic-filter-count');
    const epicFilterMenu = document.querySelector('#epic-filter-menu');
    const counter = document.querySelector('#counter');
    const dialog = document.querySelector('#issue-dialog');
    const transition = document.querySelector('#transition');
    const summaryElement = document.querySelector('#issue-summary');
    const summaryForm = document.querySelector('#summary-form');
    const summaryInput = document.querySelector('#summary-input');
    const descriptionElement = document.querySelector('#issue-description');
    const descriptionForm = document.querySelector('#description-form');
    const descriptionInput = document.querySelector('#description-input');
    const fieldsForm = document.querySelector('#fields-form');
    const commentForm = document.querySelector('#comment-form');
    const commentInput = document.querySelector('#comment-input');
    const mentionMenu = document.querySelector('#mention-menu');
    const replyContext = document.querySelector('#comment-reply-context');
    const worklogForm = document.querySelector('#worklog-form');
    let mentionSearchTimer = null;
    let mentionRequestToken = 0;
    let activeMentionRange = null;
    const viewOptions = document.querySelectorAll('[data-view]');
    const toggleAllEpics = document.querySelector('#toggle-all-epics');
    const toastRegion = document.querySelector('#toast-region');
    const pageIcon = document.querySelector('#page-icon');
    const boardIcon = document.querySelector('#board-icon');
    const collapsedEpicsStorageKey = `jira-lite:${boardId}:collapsed-epics`;

    function updatePageIcon(boardData) {
        const iconUrl =
            boardData?.location?.avatarURI ||
            boardData?.location?.avatarUrl;

        if (iconUrl && pageIcon) {
            const mediaUrl = jiraMediaUrl(iconUrl);

            pageIcon.removeAttribute('type');
            pageIcon.href = mediaUrl;

            if (boardIcon) {
                boardIcon.onerror = () => {
                    boardIcon.onerror = null;
                    boardIcon.src = '/images/favicon.png';
                };
                boardIcon.src = mediaUrl;
            }
        }
    }

    function restoreCollapsedEpics() {
        try {
            const saved = JSON.parse(
                window.localStorage.getItem(collapsedEpicsStorageKey) || '[]'
            );

            if (Array.isArray(saved)) {
                state.collapsedEpicIds = new Set(saved.map(String));
            }
        } catch {
            state.collapsedEpicIds = new Set();
        }
    }

    function saveCollapsedEpics() {
        try {
            window.localStorage.setItem(
                collapsedEpicsStorageKey,
                JSON.stringify(Array.from(state.collapsedEpicIds))
            );
        } catch {
            // Le tableau reste utilisable si le stockage local est indisponible.
        }
    }

    function updateToggleAllEpics() {
        const groups = Array.from(board.querySelectorAll('.board-group'));
        const visible = state.view === 'epic' && groups.length > 0;

        toggleAllEpics.hidden = !visible;

        if (!visible) {
            return;
        }

        const allCollapsed = groups.every(group =>
            group.classList.contains('is-collapsed')
        );
        const label = allCollapsed ? 'Tout développer' : 'Tout réduire';

        toggleAllEpics.textContent = label;
        toggleAllEpics.setAttribute('aria-label', label);
    }

    function setEpicCollapsed(group, collapsed) {
        const id = group.dataset.groupId;
        const workflow = group.querySelector('.workflow-board');
        const button = group.querySelector('.group-collapse');
        const header = group.querySelector('.board-group-header');

        group.classList.toggle('is-collapsed', collapsed);

        if (workflow) {
            workflow.hidden = collapsed;
        }

        if (button) {
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute(
                'aria-label',
                collapsed ? 'Déplier cet epic' : 'Replier cet epic'
            );
        }

        header?.setAttribute('aria-expanded', String(!collapsed));

        if (collapsed) {
            state.collapsedEpicIds.add(id);
        } else {
            state.collapsedEpicIds.delete(id);
        }
    }

    function groupId(group) {
        return group.epic
            ? canonicalEpicId(group.epic)
            : '__without_epic__';
    }

    function jiraIssueUrl(issueKey, issue = null) {
        if (!issueKey) {
            return null;
        }

        const sources = [
            issue?.self,
            state.data?.board?.self,
            state.data?.epics?.self
        ];

        for (const source of sources) {
            try {
                const url = new URL(source);

                if (['http:', 'https:'].includes(url.protocol)) {
                    return `${url.origin}/browse/${encodeURIComponent(issueKey)}`;
                }
            } catch {
                // Essaie la prochaine URL Jira disponible.
            }
        }

        return null;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastRegion.append(toast);

        window.requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });

        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 180);
        }, 3200);
    }

    function fieldValueByName(issue, pattern) {
        const names = {
            ...(state.data?.issues?.names || {}),
            ...(issue.names || {})
        };

        for (const [fieldId, fieldName] of Object.entries(names)) {
            if (pattern.test(String(fieldName))) {
                const value = issue.fields?.[fieldId];

                if (value !== undefined && value !== null) {
                    return value;
                }
            }
        }

        return null;
    }

    function storyPoints(issue) {
        const namedValue = fieldValueByName(
            issue,
            /story point|points d.?effort/i
        );
        const fallback =
            issue.fields?.storyPoints ??
            issue.fields?.customfield_10016 ??
            issue.fields?.customfield_10026;
        const value = namedValue ?? fallback;

        return typeof value === 'number' || typeof value === 'string'
            ? value
            : null;
    }

    function availableEpics() {
        const activeEpicIds = new Set();
        const candidates = [...(state.data.epics?.values || [])];

        (state.data.issues?.issues || [])
            .filter(isActiveIssue)
            .forEach(issue => {
                issueEpicIds(issue).forEach(id => activeEpicIds.add(id));

                const issueEpic = issueEpicObject(issue);
                const alreadyKnown = issueEpic && candidates.some(epic =>
                    epicIds(epic).some(id =>
                        epicIds(issueEpic).includes(id)
                    )
                );

                if (issueEpic && !alreadyKnown) {
                    candidates.push(issueEpic);
                }
            });

        return candidates
            .filter(epic =>
                epicIds(epic).some(id => activeEpicIds.has(id))
            )
            .filter((epic, index, values) =>
                values.findIndex(candidate =>
                    canonicalEpicId(candidate) === canonicalEpicId(epic)
                ) === index
            );
    }

    function epicIdsFromUrl() {
        return new URL(window.location.href)
            .searchParams
            .getAll('epic')
            .filter(Boolean);
    }

    function restoreViewFromUrl() {
        const value = new URL(window.location.href)
            .searchParams
            .get('view');

        state.view = value === 'board' ? 'board' : 'epic';
    }

    function updateViewButtons() {
        viewOptions.forEach(button => {
            const active = button.dataset.view === state.view;

            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function setView(view, updateHistory = true) {
        state.view = view === 'board' ? 'board' : 'epic';

        if (updateHistory) {
            const url = new URL(window.location.href);
            url.searchParams.set('view', state.view);
            window.history.pushState({}, '', url);
        }

        updateViewButtons();
        renderBoard(state.selectedEpicIds.size > 0);
    }

    function writeEpicsToUrl(replace = false) {
        const url = new URL(window.location.href);

        url.searchParams.delete('epic');
        state.selectedEpicIds.forEach(id => {
            url.searchParams.append('epic', id);
        });

        window.history[replace ? 'replaceState' : 'pushState'](
            { epics: Array.from(state.selectedEpicIds) },
            '',
            url
        );
    }

    function restoreEpicsFromUrl() {
        const allowedIds = new Set(
            availableEpics().map(canonicalEpicId)
        );
        const requestedIds = epicIdsFromUrl();

        state.selectedEpicIds = new Set(
            requestedIds.filter(id => allowedIds.has(id))
        );

        if (state.selectedEpicIds.size !== requestedIds.length) {
            writeEpicsToUrl(true);
        }
    }

    function updateEpicFilter() {
        const catalog = new Map(
            availableEpics().map(epic => [canonicalEpicId(epic), epic])
        );
        const selected = Array.from(state.selectedEpicIds)
            .map(id => catalog.get(id))
            .filter(Boolean);

        epicFilterMenu.querySelectorAll('[data-epic-id]')
            .forEach(option => {
                const checked = state.selectedEpicIds.has(
                    option.dataset.epicId
                );
                const input = option.querySelector('input');

                option.classList.toggle('is-selected', checked);
                option.setAttribute('aria-selected', String(checked));

                if (input) {
                    input.checked = checked;
                }
            });

        const clearButton = epicFilterMenu.querySelector(
            '.epic-filter-clear'
        );

        if (clearButton) {
            clearButton.disabled = state.selectedEpicIds.size === 0;
        }

        if (!selected.length) {
            epicFilterLabel.textContent = 'Tous les epics actifs';
            epicFilterCount.textContent = '';
        } else if (selected.length === 1) {
            epicFilterLabel.textContent = epicLabel(selected[0]);
            epicFilterCount.textContent = '1';
        } else {
            epicFilterLabel.textContent =
                `${selected.length} epics sélectionnés`;
            epicFilterCount.textContent = selected.length;
        }
    }

    function toggleEpic(epicId) {
        if (state.selectedEpicIds.has(epicId)) {
            state.selectedEpicIds.delete(epicId);
        } else {
            state.selectedEpicIds.add(epicId);
        }

        writeEpicsToUrl();
        updateEpicFilter();
        renderBoard(state.selectedEpicIds.size > 0);
    }

    function matchesSearch(issue) {
        const query = search.value.trim().toLowerCase();

        const haystack = [
            issue.key,
            issue.fields?.summary || ''
        ].join(' ').toLowerCase();

        if (query && !haystack.includes(query)) {
            return false;
        }

        return true;
    }

    function renderEpics() {
        const values = availableEpics();

        epicFilterMenu.innerHTML = '';

        const menuHeader = document.createElement('div');
        menuHeader.className = 'epic-filter-menu-head';

        const menuTitle = document.createElement('span');
        menuTitle.textContent = 'Epics du sprint';

        const clearButton = document.createElement('button');
        clearButton.className = 'epic-filter-clear';
        clearButton.type = 'button';
        clearButton.textContent = 'Tout effacer';
        clearButton.addEventListener('click', event => {
            event.stopPropagation();
            state.selectedEpicIds.clear();
            writeEpicsToUrl();
            updateEpicFilter();
            renderBoard(false);
        });

        menuHeader.append(menuTitle, clearButton);
        epicFilterMenu.append(menuHeader);

        values.forEach(epic => {
            const id = String(epic.id ?? epic.key);
            const activeCount = (state.data.issues?.issues || [])
                .filter(isActiveIssue)
                .filter(issue => issueBelongsToEpic(issue, id))
                .length;

            const option = document.createElement('label');
            option.className = 'epic-filter-option';
            option.dataset.epicId = id;
            option.style.setProperty('--epic-color', epicColor(epic));
            option.setAttribute('role', 'option');
            option.tabIndex = 0;

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = id;
            input.tabIndex = -1;

            const dot = document.createElement('span');
            dot.className = 'epic-dot';

            const label = document.createElement('span');
            label.textContent = epicLabel(epic);

            const badge = document.createElement('span');
            badge.className = 'epic-count';
            badge.textContent = activeCount;

            option.append(input, dot, label, badge);

            input.addEventListener('change', () => {
                toggleEpic(id);
            });

            option.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    input.click();
                }
            });

            epicFilterMenu.append(option);
        });

        if (!values.length) {
            const empty = document.createElement('div');
            empty.className = 'epic-filter-empty';
            empty.textContent =
                'Aucun epic avec un ticket actif dans ce sprint.';
            epicFilterMenu.append(empty);
        }

        restoreEpicsFromUrl();
        updateEpicFilter();
    }

    function epicForIssue(issue, epicCatalog = availableEpics()) {
        const issueIds = issueEpicIds(issue);

        return epicCatalog.find(epic =>
            epicIds(epic).some(id => issueIds.has(id))
        ) || issueEpicObject(issue);
    }

    function clearDropTargets() {
        document.querySelectorAll('.column.is-drag-over')
            .forEach(column => column.classList.remove('is-drag-over'));
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
        const targetStatusIds = new Set(
            (column.statuses || []).map(status => String(status.id))
        );

        columnElement.addEventListener('dragover', event => {
            const valid =
                state.draggedIssues.length > 0 &&
                state.draggedWorkflow === workflow &&
                state.draggedIssues.every(issue =>
                    !targetStatusIds.has(String(
                        issue.fields?.status?.id || ''
                    ))
                );

            if (!valid) {
                return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            clearDropTargets();
            columnElement.classList.add('is-drag-over');
        });

        columnElement.addEventListener('dragleave', event => {
            if (!columnElement.contains(event.relatedTarget)) {
                columnElement.classList.remove('is-drag-over');
            }
        });

        columnElement.addEventListener('drop', event => {
            event.preventDefault();

            const issues = state.draggedIssues;
            const cards = state.draggedCards;
            const sameWorkflow = state.draggedWorkflow === workflow;
            const sourceColumn = state.draggedCard?.closest('.column');

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

            moveIssuesToColumn(
                issues.map((issue, index) => ({
                    issue,
                    card: cards[index]
                })),
                sourceColumn,
                columnElement,
                column,
                targetStatusIds
            );
        });
    }

    async function moveIssuesToColumn(
        items,
        sourceColumn,
        targetColumn,
        column,
        targetStatusIds,
    ) {
        const originalOrder = Array.from(
            sourceColumn.querySelectorAll('.card')
        );
        const optimisticStatusId = targetStatusIds.values().next().value;
        const prepared = items.map(({ issue, card }) => ({
            issue,
            card,
            originalStatus: { ...(issue.fields?.status || {}) }
        }));

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
            const results = await Promise.allSettled(prepared.map(
                async ({ issue }) => {
                    const issueUrl =
                        `/api/jira/issue/${encodeURIComponent(issue.key)}`;
                    const transitions = await api(`${issueUrl}/transitions`);
                    const selected = (transitions.transitions || [])
                        .find(item =>
                            targetStatusIds.has(String(item.to?.id))
                        );

                    if (!selected) {
                        throw new Error(
                            `aucune transition vers « ${column.name} »`
                        );
                    }

                    await api(`${issueUrl}/transition`, {
                        method: 'POST',
                        body: JSON.stringify({ transitionId: selected.id })
                    });

                    return selected;
                }
            ));
            const failedCards = new Set();
            let failedCount = 0;

            results.forEach((result, index) => {
                const item = prepared[index];

                if (result.status === 'fulfilled') {
                    item.issue.fields.status = {
                        ...item.originalStatus,
                        ...(result.value.to || {})
                    };
                    return;
                }

                item.issue.fields.status = item.originalStatus;
                failedCards.add(item.card);
                ++failedCount;
            });

            originalOrder.forEach(originalCard => {
                if (
                    originalCard.parentElement === sourceColumn ||
                    failedCards.has(originalCard)
                ) {
                    sourceColumn.append(originalCard);
                }
            });

            updateColumnCount(sourceColumn);
            updateColumnCount(targetColumn);

            if (failedCount) {
                const plural = failedCount > 1 ? 's' : '';
                showToast(
                    `${failedCount} ticket${plural} non déplacé${plural}`,
                    'error'
                );
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

    function renderBoard(revealFirstIssue = false) {
        state.selectedIssueKeys.clear();
        state.selectedColumnId = null;
        const previousScrollLeft = board.scrollLeft;
        const previousScrollTop = board.scrollTop;
        const columns =
            state.data.configuration?.columnConfig?.columns || [];
        const currentSprintIssues = state.data.issues?.issues || [];
        const matchingIssues = currentSprintIssues.filter(matchesSearch);
        const epicCatalog = availableEpics();
        const epicsById = new Map(
            epicCatalog.map(epic => [canonicalEpicId(epic), epic])
        );
        const selectedEpics = Array.from(state.selectedEpicIds)
            .map(id => epicsById.get(id))
            .filter(Boolean);
        const filteredIssues = selectedEpics.length
            ? matchingIssues.filter(issue =>
                selectedEpics.some(epic =>
                    issueBelongsToEpic(issue, canonicalEpicId(epic))
                )
            )
            : matchingIssues;
        let groups;

        if (state.view === 'epic') {
            const displayedEpics = selectedEpics.length
                ? selectedEpics
                : epicCatalog;
            const hasSearch = search.value.trim() !== '';

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

        const sprintLabel = currentSprintName(currentSprintIssues);
        const visibleIssueKeys = new Set(
            groups.flatMap(group =>
                group.issues.map(issue => issue.key)
            )
        );

        counter.textContent =
            `${visibleIssueKeys.size} ticket${
                visibleIssueKeys.size > 1 ? 's' : ''
            } · ${
                state.view === 'epic'
                    ? `${groups.length} groupe${groups.length > 1 ? 's' : ''}`
                    : 'board unique'
            }`;

        board.innerHTML = '';
        board.classList.toggle('is-grouped', state.view === 'epic');
        const workflowColumnsWidth = Array.from(
            { length: Math.max(columns.length, 1) },
            () => 'var(--workflow-column-width)'
        ).join(' + ');
        const workflowGapsWidth =
            Math.max(columns.length - 1, 0) * 9;
        board.style.setProperty(
            '--workflow-min-width',
            `calc(30px + ${workflowColumnsWidth} + ${workflowGapsWidth}px)`
        );

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML =
                '<strong>Aucun ticket à afficher</strong>' +
                '<span>Modifiez les filtres ou la recherche.</span>';
            board.append(empty);
            updateToggleAllEpics();
            return;
        }

        const statusToColumn = new Map();
        const columnsToReveal = [];

        columns.forEach(column => {
            (column.statuses || []).forEach(status => {
                statusToColumn.set(String(status.id), column);
            });
        });

        groups.forEach(group => {
            const groupElement = document.createElement('section');
            groupElement.className = 'board-group';
            const id = groupId(group);
            groupElement.dataset.groupId = id;
            const isCollapsible = state.view === 'epic';
            const isCollapsed = isCollapsible &&
                state.collapsedEpicIds.has(id);
            groupElement.classList.toggle('is-collapsed', isCollapsed);
            groupElement.style.setProperty(
                '--epic-color',
                group.epic ? epicColor(group.epic) : '#64748b'
            );

            const header = createGroupHeader(
                group,
                sprintLabel,
                state.view === 'epic',
                isCollapsed
            );
            const workflow = document.createElement('div');
            workflow.className = 'workflow-board';
            workflow.hidden = isCollapsed;
            workflow.id = `epic-workflow-${encodeURIComponent(id)}`;

            const collapseButton = header.querySelector('.group-collapse');
            collapseButton?.setAttribute('aria-controls', workflow.id);
            header.setAttribute('aria-controls', workflow.id);
            header.setAttribute('aria-expanded', String(!isCollapsed));

            const toggleGroup = () => {
                const collapsed = !groupElement.classList.contains(
                    'is-collapsed'
                );

                setEpicCollapsed(groupElement, collapsed);
                saveCollapsedEpics();
                updateToggleAllEpics();
            };

            if (isCollapsible) {
                header.classList.add('is-collapsible');
                header.addEventListener('click', toggleGroup);

                const groupTitle = header.querySelector('.board-group-title');

                groupTitle?.addEventListener('click', event => {
                    if (event.ctrlKey || event.metaKey) {
                        event.stopPropagation();
                        return;
                    }

                    event.preventDefault();
                });
                groupTitle?.addEventListener('auxclick', event => {
                    event.preventDefault();
                });
            }
            let firstPopulatedColumn = null;

            columns.forEach(column => {
                const wrapper = document.createElement('section');
                wrapper.className = 'column';
                wrapper.dataset.columnName = column.name;
                enableDropZone(wrapper, column, workflow);

                const head = document.createElement('div');
                head.className = 'column-head';

                const title = document.createElement('span');
                title.textContent = column.name;

                const columnIssues = group.issues.filter(issue => {
                    const mapped = statusToColumn.get(
                        String(issue.fields?.status?.id)
                    );

                    return mapped?.name === column.name;
                });

                const count = document.createElement('span');
                count.className = 'column-count';
                count.textContent = columnIssues.length;

                head.append(title, count);
                wrapper.append(head);

                if (columnIssues.length && !firstPopulatedColumn) {
                    firstPopulatedColumn = wrapper;
                }

                columnIssues.forEach(issue => {
                    wrapper.append(createCard(
                        issue,
                        epicForIssue(issue, epicCatalog)
                    ));
                });

                workflow.append(wrapper);
            });

            groupElement.append(header, workflow);
            board.append(groupElement);

            if (firstPopulatedColumn) {
                columnsToReveal.push({ workflow, firstPopulatedColumn });
            }
        });

        updateToggleAllEpics();

        window.requestAnimationFrame(() => {
            if (revealFirstIssue && columnsToReveal.length) {
                const { workflow, firstPopulatedColumn } = columnsToReveal[0];

                if (state.view !== 'epic') {
                    workflow.scrollTo({
                        left: Math.max(
                            0,
                            firstPopulatedColumn.offsetLeft - workflow.offsetLeft
                        ),
                        behavior: 'smooth'
                    });
                    return;
                }

                const boardBounds = board.getBoundingClientRect();
                const columnBounds =
                    firstPopulatedColumn.getBoundingClientRect();

                board.scrollTo({
                    left: Math.max(
                        0,
                        board.scrollLeft + columnBounds.left - boardBounds.left
                    ),
                    behavior: 'smooth'
                });
                return;
            }

            board.scrollTo({
                left: previousScrollLeft,
                top: previousScrollTop
            });
        });
    }

    function createGroupHeader(group, sprintLabel, grouped, collapsed = false) {
        const header = document.createElement('header');
        header.className = 'board-group-header';

        const color = document.createElement('span');
        color.className = 'group-color';

        const key = document.createElement('span');
        key.className = 'board-group-key';
        key.textContent = group.epic?.key || 'Sans clé';

        const issueUrl = grouped
            ? jiraIssueUrl(group.epic?.key, group.epic)
            : null;
        const title = document.createElement(issueUrl ? 'a' : 'h2');
        title.className = 'board-group-title';
        title.textContent = grouped
            ? epicLabel(group.epic)
            : sprintLabel;

        if (issueUrl) {
            title.href = issueUrl;
            title.target = '_blank';
            title.rel = 'noopener noreferrer';
            title.title = 'Ctrl/Cmd + clic pour ouvrir dans Jira';
        }

        const stats = document.createElement('span');
        stats.className = 'group-stats';
        stats.innerHTML =
            `(<strong class="group-ticket-count">${group.issues.length}</strong>` +
            ' tickets)';

        const actions = document.createElement('div');
        actions.className = 'group-actions';
        actions.append(color);

        if (grouped) {
            const collapse = document.createElement('button');
            collapse.type = 'button';
            collapse.className = 'group-collapse';
            collapse.setAttribute('aria-expanded', String(!collapsed));
            collapse.setAttribute(
                'aria-label',
                collapsed ? 'Déplier cet epic' : 'Replier cet epic'
            );
            collapse.innerHTML =
                '<svg class="group-collapse-icon" viewBox="0 0 20 20" ' +
                'aria-hidden="true" focusable="false">' +
                '<path d="m5 7.5 5 5 5-5" /></svg>';
            actions.append(collapse);
        }

        if (grouped) {
            actions.append(key);
        }

        actions.append(title, stats);
        header.append(actions);

        return header;
    }

    function currentSprintName(issues) {
        const sprint = issues.find(issue => issue.fields?.sprint)
            ?.fields?.sprint;

        return sprint?.name || '';
    }

    function createCard(issue, epic = null) {
        const card = document.createElement('article');
        card.className = 'card';
        card.dataset.issueKey = issue.key;
        card.draggable = true;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-pressed', 'false');
        card.setAttribute('aria-label', `${issue.key} ${
            issue.fields?.summary || ''
        }`);

        const top = document.createElement('div');
        top.className = 'card-top';

        const identity = document.createElement('div');
        identity.className = 'card-identity';
        const issueType = issue.fields?.issuetype;
        const typeIcon = createImage(
            issueType?.iconUrl,
            issueType?.name || 'Type',
            'issue-type-icon'
        );

        const key = document.createElement('span');
        key.className = 'card-key';
        key.textContent = issue.key;

        if (typeIcon) {
            typeIcon.title = issueType.name;
            typeIcon.addEventListener(
                'error',
                () => typeIcon.remove(),
                { once: true }
            );
            identity.append(typeIcon);
        }
        identity.append(key);

        const priority = issue.fields?.priority;
        const priorityView = document.createElement('span');
        priorityView.className = 'card-priority';

        if (priority) {
            const priorityIcon = createImage(
                priority.iconUrl,
                '',
                'priority-icon'
            );

            if (priorityIcon) {
                priorityIcon.addEventListener(
                    'error',
                    () => priorityIcon.remove(),
                    { once: true }
                );
                priorityView.append(priorityIcon);
            }

            priorityView.append(priority.name);
        }

        top.append(identity);

        if (priority) {
            top.append(priorityView);
        }

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = issue.fields?.summary || '';

        const details = document.createElement('div');
        details.className = 'card-details';

        if (epic) {
            const epicTag = document.createElement('span');
            epicTag.className = 'card-epic';
            epicTag.style.setProperty('--epic-color', epicColor(epic));
            epicTag.textContent = epicLabel(epic);
            details.append(epicTag);
        }

        (issue.fields?.labels || []).slice(0, 2).forEach(value => {
            const label = document.createElement('span');
            label.className = 'card-label';
            label.textContent = value;
            details.append(label);
        });

        if ((issue.fields?.labels || []).length > 2) {
            const more = document.createElement('span');
            more.className = 'card-label';
            more.textContent = `+${issue.fields.labels.length - 2}`;
            details.append(more);
        }

        const foot = document.createElement('div');
        foot.className = 'card-foot';
        const points = storyPoints(issue);

        if (points !== null) {
            const estimate = document.createElement('span');
            estimate.className = 'story-points';
            estimate.textContent = points;
            estimate.title = 'Story points';
            foot.append(estimate);
        }

        const assignee = issue.fields?.assignee;
        const assigneeView = document.createElement('span');
        assigneeView.className = 'assignee';
        assigneeView.title = assignee?.displayName || 'Non assigné';
        const avatar = createImage(
            assignee?.avatarUrls?.['24x24'] ||
                assignee?.avatarUrls?.['32x32'],
            '',
            'avatar'
        );

        if (avatar) {
            avatar.addEventListener('error', () => {
                const fallback = document.createElement('span');
                fallback.className = 'avatar avatar-fallback';
                fallback.textContent = initials(assignee?.displayName);
                avatar.replaceWith(fallback);
            }, { once: true });
            assigneeView.append(avatar);
        } else {
            const fallback = document.createElement('span');
            fallback.className = 'avatar avatar-fallback';
            fallback.textContent = initials(assignee?.displayName);
            assigneeView.append(fallback);
        }

        const assigneeName = document.createElement('span');
        assigneeName.className = 'assignee-name';
        assigneeName.textContent = assignee?.displayName || 'Non assigné';
        assigneeView.append(assigneeName);
        foot.append(assigneeView);

        card.append(top, title);

        if (details.children.length) {
            card.append(details);
        }

        card.append(foot);

        card.addEventListener('dragstart', event => {
            if (!card.classList.contains('is-selected')) {
                clearIssueSelection();
                toggleIssueSelection(card);
            }

            const sourceColumn = card.closest('.column');
            const issueByKey = new Map(
                (state.data.issues?.issues || []).map(item => [item.key, item])
            );
            issueByKey.set(issue.key, issue);
            const cards = Array.from(
                sourceColumn.querySelectorAll('.card.is-selected')
            );
            const issues = cards
                .map(item => issueByKey.get(item.dataset.issueKey))
                .filter(Boolean);

            state.draggedIssue = issues[0] || issue;
            state.draggedIssues = issues.length ? issues : [issue];
            state.draggedCard = card;
            state.draggedCards = cards.length ? cards : [card];
            state.draggedWorkflow = card.closest('.workflow-board');
            state.justDragged = true;
            state.draggedCards.forEach(item =>
                item.classList.add('is-dragging')
            );
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                state.draggedIssues.map(item => item.key).join('\n')
            );
        });

        card.addEventListener('dragend', () => {
            state.draggedCards.forEach(item =>
                item.classList.remove('is-dragging')
            );
            clearDropTargets();
            state.draggedIssue = null;
            state.draggedIssues = [];
            state.draggedCard = null;
            state.draggedCards = [];
            state.draggedWorkflow = null;

            window.setTimeout(() => {
                state.justDragged = false;
            }, 120);
        });

        card.addEventListener('click', event => {
            if (state.justDragged) {
                return;
            }

            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                toggleIssueSelection(card);
                return;
            }

            clearIssueSelection();
            openIssue(issue.key);
        });

        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();

                if (event.ctrlKey || event.metaKey) {
                    toggleIssueSelection(card);
                    return;
                }

                clearIssueSelection();
                openIssue(issue.key);
            }
        });

        return card;
    }

    function addIssueMeta(container, label, value, iconUrl = null) {
        if (value === undefined || value === null || value === '') {
            return;
        }

        const item = document.createElement('div');
        const labelElement = document.createElement('span');
        const valueElement = document.createElement('span');
        item.className = 'issue-meta-item';
        labelElement.className = 'issue-meta-label';
        labelElement.textContent = label;
        valueElement.className = 'issue-meta-value';
        const icon = createImage(iconUrl, '', 'meta-icon');

        if (icon) {
            icon.addEventListener('error', () => icon.remove(), { once: true });
            valueElement.append(icon);
        }

        valueElement.append(
            value instanceof Node ? value : String(value)
        );
        item.append(labelElement, valueElement);
        container.append(item);
    }

    function issueReference(issue) {
        if (!issue?.key) {
            return null;
        }

        const button = document.createElement('button');
        const key = document.createElement('strong');
        const summary = document.createElement('span');

        button.type = 'button';
        button.className = 'issue-reference';
        button.setAttribute(
            'aria-label',
            `Ouvrir ${issue.key} dans la modale`
        );
        button.addEventListener('click', () => openIssue(issue.key));
        key.textContent = issue.key;
        summary.textContent = issue.fields?.summary || '';
        button.append(key, summary);

        return button;
    }

    function fieldNames(items) {
        if (!Array.isArray(items)) {
            return '';
        }

        return items
            .map(item => item?.name || item?.value || item)
            .filter(Boolean)
            .join(', ');
    }

    function formatIssueDate(value, withTime = false) {
        if (!value) {
            return '';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat('fr-FR', withTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' }
        ).format(date);
    }

    function currentIssueSprintNames(issue) {
        const value = issue.fields?.sprint || fieldValueByName(issue, /sprint/i);

        return activeSprintNames(value);
    }

    function formatSeconds(value) {
        const seconds = Number(value);

        if (!Number.isFinite(seconds) || seconds <= 0) {
            return '';
        }

        const days = Math.floor(seconds / 28_800);
        const hours = Math.floor((seconds % 28_800) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return [
            days ? `${days}j` : '',
            hours ? `${hours}h` : '',
            minutes ? `${minutes}min` : ''
        ].filter(Boolean).join(' ');
    }

    function renderTimeTracking(issue) {
        const tracking = issue.fields?.timetracking || {};
        const spentSeconds = Number(tracking.timeSpentSeconds || 0);
        const remainingSeconds = Number(
            tracking.remainingEstimateSeconds || 0
        );
        const total = spentSeconds + remainingSeconds;
        const progress = total > 0
            ? Math.min(100, Math.round((spentSeconds / total) * 100))
            : 0;

        document.querySelector('#time-progress-bar').style.width =
            `${progress}%`;
        document.querySelector('#time-spent').textContent = spentSeconds > 0
            ? `${tracking.timeSpent || formatSeconds(spentSeconds)} consigné`
            : 'Aucun temps consigné';
        document.querySelector('#time-remaining').textContent =
            tracking.remainingEstimate
                ? `${tracking.remainingEstimate} restant`
                : '';
    }

    function renderEditableFields(issue) {
        const fields = issue.fields || {};
        const tracking = fields.timetracking || {};
        const preview = document.querySelector('#editable-fields-preview');

        preview.replaceChildren();
        addIssueMeta(
            preview,
            'Étiquettes',
            fieldNames(fields.labels) || 'Aucune'
        );
        addIssueMeta(
            preview,
            'Échéance',
            formatIssueDate(fields.duedate) || 'Aucune'
        );
        addIssueMeta(
            preview,
            'Estimation',
            tracking.originalEstimate || 'Non estimé'
        );
        addIssueMeta(
            preview,
            'Temps restant',
            tracking.remainingEstimate || 'Non estimé'
        );

        document.querySelector('#labels-input').value =
            Array.isArray(fields.labels) ? fields.labels.join(', ') : '';
        document.querySelector('#due-date-input').value =
            fields.duedate || '';
        document.querySelector('#original-estimate-input').value =
            tracking.originalEstimate || '';
        document.querySelector('#remaining-estimate-input').value =
            tracking.remainingEstimate || '';
    }

    function renderIssueMeta(issue) {
        const container = document.querySelector('#issue-meta');
        const fields = issue.fields || {};

        container.replaceChildren();
        addIssueMeta(
            container,
            'Type',
            fields.issuetype?.name,
            fields.issuetype?.iconUrl
        );
        addIssueMeta(
            container,
            'Priorité',
            fields.priority?.name,
            fields.priority?.iconUrl
        );
        addIssueMeta(
            container,
            'Parent',
            issueReference(fields.parent)
        );
        addIssueMeta(container, 'Projet', fields.project?.name);
        addIssueMeta(
            container,
            'Assigné',
            fields.assignee?.displayName || 'Non assigné',
            fields.assignee?.avatarUrls?.['24x24']
        );
        addIssueMeta(
            container,
            'Rapporteur',
            fields.reporter?.displayName,
            fields.reporter?.avatarUrls?.['24x24']
        );
        addIssueMeta(
            container,
            'Créateur',
            fields.creator?.displayName,
            fields.creator?.avatarUrls?.['24x24']
        );
        addIssueMeta(container, 'Sprint', currentIssueSprintNames(issue));

        const points = storyPoints(issue);
        if (points !== null) {
            addIssueMeta(container, 'Story points', `${points} points`);
        }

        addIssueMeta(container, 'Résolution', fields.resolution?.name);
        addIssueMeta(container, 'Composants', fieldNames(fields.components));
        addIssueMeta(
            container,
            'Versions cibles',
            fieldNames(fields.fixVersions)
        );
        addIssueMeta(
            container,
            'Versions affectées',
            fieldNames(fields.versions)
        );
        addIssueMeta(
            container,
            'Créé',
            formatIssueDate(fields.created, true)
        );
        addIssueMeta(
            container,
            'Mis à jour',
            formatIssueDate(fields.updated, true)
        );
        addIssueMeta(container, 'Votes', fields.votes?.votes);
        addIssueMeta(container, 'Abonnés', fields.watches?.watchCount);
        addIssueMeta(
            container,
            'Sous-tâches',
            Array.isArray(fields.subtasks) ? fields.subtasks.length : null
        );
        addIssueMeta(
            container,
            'Pièces jointes',
            Array.isArray(fields.attachment) ? fields.attachment.length : null
        );
    }

    function safeExternalUrl(value, base = undefined) {
        try {
            const url = new URL(value, base);

            return ['http:', 'https:'].includes(url.protocol)
                ? url.href
                : null;
        } catch {
            return null;
        }
    }

    function createExternalLinkIcon() {
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        const arrow = document.createElementNS(namespace, 'path');
        const frame = document.createElementNS(namespace, 'path');

        svg.classList.add('ui-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        arrow.setAttribute('d', 'M14 5h5v5M19 5l-9 9');
        frame.setAttribute(
            'd',
            'M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6' +
            'a1 1 0 0 1 1-1h5'
        );
        svg.append(arrow, frame);

        return svg;
    }

    function createFileIcon() {
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        const file = document.createElementNS(namespace, 'path');
        const fold = document.createElementNS(namespace, 'path');

        svg.classList.add('ui-icon', 'issue-file-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        file.setAttribute(
            'd',
            'M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z'
        );
        fold.setAttribute('d', 'M14 2v5h5');
        svg.append(file, fold);

        return svg;
    }

    function formatFileSize(value) {
        const bytes = Number(value);

        if (!Number.isFinite(bytes) || bytes < 0) {
            return '';
        }

        if (bytes < 1000) {
            return `${bytes} o`;
        }

        if (bytes < 1_000_000) {
            return `${(bytes / 1000).toFixed(1)} Ko`;
        }

        return `${(bytes / 1_000_000).toFixed(1)} Mo`;
    }

    function appendLinkifiedText(container, text) {
        const pattern = /https?:\/\/[^\s<>"']+/gi;
        let cursor = 0;

        for (const match of text.matchAll(pattern)) {
            const candidate = match[0].replace(/[),.;!?]+$/, '');
            const href = safeExternalUrl(candidate);

            container.append(text.slice(cursor, match.index));

            if (href) {
                const link = document.createElement('a');
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = candidate;
                container.append(link);
                container.append(match[0].slice(candidate.length));
            } else {
                container.append(match[0]);
            }

            cursor = match.index + match[0].length;
        }

        container.append(text.slice(cursor));
    }

    function renderRichText(container, content, emptyText) {
        const segments = typeof content === 'string'
            ? [{ text: content, href: null }]
            : adfToSegments(content);
        const fullText = segments.map(segment => segment.text).join('').trim();

        container.replaceChildren();

        if (!fullText) {
            container.textContent = emptyText;
            return;
        }

        segments.forEach(segment => {
            const href = safeExternalUrl(segment.href);

            if (segment.mention) {
                const mention = document.createElement('span');
                mention.className = 'comment-mention';
                mention.textContent = segment.text;
                container.append(mention);
                return;
            }

            if (href) {
                const link = document.createElement('a');
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = segment.text;
                container.append(link);
                return;
            }

            appendLinkifiedText(container, segment.text);
        });
    }

    function renderIssueDescription(description) {
        renderRichText(
            document.querySelector('#issue-description'),
            description,
            'Aucune description.'
        );
    }

    function renderIssueLinks(issue) {
        const section = document.querySelector('#issue-links');
        const container = document.querySelector('#issue-links-list');
        const links = Array.isArray(issue.fields?.issuelinks)
            ? issue.fields.issuelinks
            : [];

        container.replaceChildren();

        links.forEach(issueLink => {
            const linkedIssue = issueLink.outwardIssue || issueLink.inwardIssue;

            if (!linkedIssue?.key) {
                return;
            }

            const relation = issueLink.outwardIssue
                ? issueLink.type?.outward
                : issueLink.type?.inward;
            const item = document.createElement('button');
            const identity = document.createElement('span');
            const key = document.createElement('strong');
            const summary = document.createElement('span');
            const status = linkedIssue.fields?.status?.name;

            item.className = 'issue-link-card';
            item.type = 'button';
            item.setAttribute(
                'aria-label',
                `Ouvrir ${linkedIssue.key} dans la modale`
            );
            item.addEventListener('click', () => openIssue(linkedIssue.key));

            identity.className = 'issue-link-identity';
            key.textContent = linkedIssue.key;
            summary.textContent = linkedIssue.fields?.summary || 'Sans titre';
            identity.append(key, summary);
            item.append(identity);

            if (relation || status) {
                const details = document.createElement('span');
                details.className = 'issue-link-details';

                if (relation) {
                    const relationLabel = document.createElement('span');
                    relationLabel.textContent = relation;
                    details.append(relationLabel);
                }

                if (status) {
                    const statusLabel = document.createElement('span');
                    statusLabel.className = 'issue-link-status';
                    statusLabel.textContent = status;
                    details.append(statusLabel);
                }

                item.append(details);
            }

            container.append(item);
        });

        section.hidden = container.childElementCount === 0;
    }

    function renderIssueAttachments(issue) {
        const section = document.querySelector('#issue-attachments');
        const container = document.querySelector('#issue-attachments-list');
        const attachments = Array.isArray(issue.fields?.attachment)
            ? issue.fields.attachment
            : [];

        container.replaceChildren();

        attachments.forEach(attachment => {
            const isImage =
                String(attachment?.mimeType || '').toLowerCase()
                    .startsWith('image/') || Boolean(attachment?.thumbnail);
            const imageUrl = attachment.thumbnail || attachment.content;
            const fullImageUrl = attachment.content || imageUrl;
            const attachmentThumbnail = jiraAttachmentMediaUrl(
                attachment.id,
                'thumbnail'
            );
            const attachmentContent = jiraAttachmentMediaUrl(
                attachment.id,
                'content'
            );
            const card = document.createElement('figure');
            const header = document.createElement('figcaption');
            const filename = document.createElement('span');
            const href = isImage && fullImageUrl
                ? attachmentContent || jiraMediaUrl(fullImageUrl)
                : safeExternalUrl(attachment.content, issue.self);

            card.className = 'issue-attachment-card';
            filename.className = 'issue-image-name';
            filename.textContent = attachment.filename || 'Pièce jointe';
            header.append(filename);

            if (href) {
                const open = document.createElement('a');
                open.className = 'issue-image-open';
                open.href = href;
                open.target = '_blank';
                open.rel = 'noopener noreferrer';
                open.append('Ouvrir ', createExternalLinkIcon());
                open.setAttribute(
                    'aria-label',
                    `Ouvrir ${filename.textContent} dans un nouvel onglet`
                );
                header.append(open);
            }

            card.append(header);

            if (isImage && imageUrl) {
                const image = createImage(
                    attachmentThumbnail || imageUrl,
                    filename.textContent,
                    'issue-attachment-image'
                );
                image.src = attachmentThumbnail || jiraMediaUrl(imageUrl);
                const preview = document.createElement(href ? 'a' : 'div');
                const unavailable = document.createElement('span');
                const previewSources = Array.from(new Set([
                    attachmentThumbnail,
                    attachmentContent,
                    jiraMediaUrl(attachment.thumbnail),
                    jiraMediaUrl(attachment.content)
                ].filter(Boolean)));
                let previewIndex = 0;

                preview.className = 'issue-image-preview';

                if (href) {
                    preview.href = href;
                    preview.target = '_blank';
                    preview.rel = 'noopener noreferrer';
                }

                unavailable.className = 'issue-image-unavailable';
                unavailable.textContent = 'Prévisualisation indisponible';
                unavailable.hidden = true;
                preview.append(image, unavailable);
                image.addEventListener('error', () => {
                    previewIndex += 1;

                    if (previewSources[previewIndex]) {
                        image.src = previewSources[previewIndex];
                        return;
                    }

                    image.remove();
                    unavailable.hidden = false;
                });
                card.append(preview);
            } else {
                const preview = document.createElement(href ? 'a' : 'div');
                const details = document.createElement('span');
                const metadata = [
                    attachment.mimeType,
                    formatFileSize(attachment.size)
                ].filter(Boolean).join(' · ');

                preview.className = 'issue-file-preview';

                if (href) {
                    preview.href = href;
                    preview.target = '_blank';
                    preview.rel = 'noopener noreferrer';
                }

                details.textContent = metadata || 'Fichier joint';
                preview.append(createFileIcon(), details);
                card.append(preview);
            }

            container.append(card);
        });

        section.hidden = container.childElementCount === 0;
    }

    function formatCommentDate(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function renderIssueComments(response, embeddedComments = null) {
        const container = document.querySelector('#issue-comments-list');
        const comments = Array.isArray(response?.comments)
            ? response.comments
            : (embeddedComments?.comments || []);

        if (response && Object.hasOwn(response, 'currentUser')) {
            state.currentUser = response.currentUser;
        }

        container.replaceChildren();

        if (!comments.length) {
            container.textContent = response?.unavailable
                ? 'Commentaires indisponibles.'
                : 'Aucun commentaire.';
            return;
        }

        comments.forEach(comment => {
            const article = document.createElement('article');
            const header = document.createElement('header');
            const author = document.createElement('div');
            const authorName = document.createElement('strong');
            const date = document.createElement('time');
            const actions = document.createElement('div');
            const body = document.createElement('div');
            const avatar = createImage(
                comment.author?.avatarUrls?.['32x32'],
                '',
                'issue-comment-avatar'
            );

            article.className = 'issue-comment';
            author.className = 'issue-comment-author';
            actions.className = 'issue-comment-actions';
            authorName.textContent = comment.author?.displayName || 'Anonyme';
            date.textContent = formatCommentDate(
                comment.updated || comment.created
            );
            if (
                comment.updated
                && comment.created
                && comment.updated !== comment.created
            ) {
                date.textContent += ' · modifié';
            }
            date.dateTime = comment.updated || comment.created || '';
            body.className = 'issue-comment-body';

            if (avatar) {
                avatar.addEventListener('error', () => avatar.remove(), {
                    once: true
                });
                header.append(avatar);
            }

            author.append(authorName, date);
            header.append(author, actions);

            if (comment.author?.accountId) {
                const reply = document.createElement('button');
                reply.type = 'button';
                reply.textContent = 'Répondre';
                reply.addEventListener('click', () => replyToComment(comment));
                actions.append(reply);
            }

            if (
                comment.id
                && comment.author?.accountId
                && comment.author.accountId === state.currentUser?.accountId
            ) {
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.textContent = 'Modifier';
                edit.addEventListener('click', () => {
                    openCommentEditor(article, body, comment);
                });
                actions.append(edit);

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'comment-delete-button';
                remove.textContent = 'Supprimer';
                remove.addEventListener('click', () => {
                    deleteComment(comment, remove);
                });
                actions.append(remove);
            }

            renderRichText(body, comment.body, 'Commentaire vide.');
            article.append(header, body);
            container.append(article);
        });
    }

    function mergeCommentMention(mention) {
        state.commentMentions = [
            ...state.commentMentions.filter(candidate =>
                candidate.accountId !== mention.accountId
            ),
            mention
        ];
    }

    async function deleteComment(comment, button) {
        if (!state.issue || !comment.id) {
            return;
        }

        const confirmed = window.confirm(
            'Supprimer définitivement ce commentaire ?'
        );

        if (!confirmed) {
            return;
        }

        button.disabled = true;

        try {
            await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}`
                + `/comments/${encodeURIComponent(comment.id)}`,
                { method: 'DELETE' }
            );
            await refreshIssueComments();
            showToast('Commentaire supprimé', 'success');
        } catch (error) {
            showToast(error.message, 'error');
            button.disabled = false;
        }
    }

    function replyToComment(comment) {
        const displayName = comment.author?.displayName;
        const accountId = comment.author?.accountId;

        if (!displayName || !accountId) {
            return;
        }

        const mention = {
            accountId,
            text: `@${displayName}`
        };
        const current = commentInput.value.trimStart();

        if (!current.includes(mention.text)) {
            commentInput.value = `${mention.text} ${current}`;
        }

        mergeCommentMention(mention);
        replyContext.hidden = false;
        replyContext.dataset.accountId = accountId;
        document.querySelector('#comment-reply-label').textContent =
            `Réponse à ${displayName}`;
        commentInput.focus();
        commentInput.setSelectionRange(
            commentInput.value.length,
            commentInput.value.length
        );
    }

    function openCommentEditor(article, body, comment) {
        if (article.querySelector('.comment-edit-form')) {
            return;
        }

        const form = document.createElement('form');
        const textarea = document.createElement('textarea');
        const actions = document.createElement('div');
        const save = document.createElement('button');
        const cancel = document.createElement('button');

        form.className = 'comment-edit-form';
        textarea.rows = 4;
        textarea.required = true;
        textarea.value = adfToText(comment.body).trim();
        actions.className = 'inline-edit-actions';
        save.type = 'submit';
        save.textContent = 'Enregistrer';
        cancel.type = 'button';
        cancel.className = 'secondary-button';
        cancel.textContent = 'Annuler';
        actions.append(save, cancel);
        form.append(textarea, actions);
        body.hidden = true;
        article.append(form);
        textarea.focus();

        cancel.addEventListener('click', () => {
            form.remove();
            body.hidden = false;
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const updatedComment = textarea.value.trim();

            if (!updatedComment || !state.issue) {
                return;
            }

            setFormBusy(form, true);

            try {
                await api(
                    `/api/jira/issue/${encodeURIComponent(state.issue.key)}`
                    + `/comments/${encodeURIComponent(comment.id)}`,
                    {
                        method: 'PUT',
                        body: JSON.stringify({
                            comment: updatedComment,
                            mentions: adfMentions(comment.body)
                        })
                    }
                );
                await refreshIssueComments();
                showToast('Commentaire modifié', 'success');
            } catch (error) {
                showToast(error.message, 'error');
                setFormBusy(form, false);
            }
        });
    }

    function closeMentionMenu() {
        mentionMenu.hidden = true;
        mentionMenu.replaceChildren();
        activeMentionRange = null;
    }

    function selectMentionUser(user) {
        if (!activeMentionRange) {
            return;
        }

        const mentionText = `@${user.displayName}`;
        const value = commentInput.value;
        const before = value.slice(0, activeMentionRange.start);
        const after = value.slice(activeMentionRange.end).replace(/^\s*/, '');
        const replacement = `${mentionText} `;

        commentInput.value = `${before}${replacement}${after}`;
        mergeCommentMention({
            accountId: user.accountId,
            text: mentionText
        });
        const caret = before.length + replacement.length;

        closeMentionMenu();
        commentInput.focus();
        commentInput.setSelectionRange(caret, caret);
    }

    function renderMentionMenu(users) {
        mentionMenu.replaceChildren();

        if (!users.length) {
            const empty = document.createElement('span');
            empty.className = 'mention-menu-empty';
            empty.textContent = 'Aucune personne trouvée';
            mentionMenu.append(empty);
            mentionMenu.hidden = false;
            return;
        }

        users.forEach((user, index) => {
            const option = document.createElement('button');
            const identity = document.createElement('span');
            const avatar = createImage(
                user.avatarUrl,
                '',
                'mention-avatar'
            );

            option.type = 'button';
            option.className = 'mention-option';
            option.mentionUser = user;
            option.setAttribute('role', 'option');
            option.classList.toggle('is-active', index === 0);
            option.setAttribute('aria-selected', String(index === 0));
            identity.textContent = user.displayName;

            if (avatar) {
                avatar.addEventListener('error', () => avatar.remove(), {
                    once: true
                });
                option.append(avatar);
            }

            option.append(identity);
            option.addEventListener('mousedown', event => {
                event.preventDefault();
                selectMentionUser(user);
            });
            mentionMenu.append(option);
        });

        mentionMenu.hidden = false;
    }

    function scheduleMentionSearch() {
        window.clearTimeout(mentionSearchTimer);
        const caret = commentInput.selectionStart;
        const beforeCaret = commentInput.value.slice(0, caret);
        const match = beforeCaret.match(/(?:^|\s)@([^\s@]{1,40})$/u);

        if (!match) {
            closeMentionMenu();
            return;
        }

        const query = match[1];
        activeMentionRange = {
            start: caret - query.length - 1,
            end: caret
        };
        const requestToken = ++mentionRequestToken;

        mentionSearchTimer = window.setTimeout(async () => {
            try {
                const response = await api(
                    `/api/jira/users?query=${encodeURIComponent(query)}`
                );

                if (requestToken === mentionRequestToken) {
                    renderMentionMenu(response.users || []);
                }
            } catch {
                if (requestToken === mentionRequestToken) {
                    closeMentionMenu();
                }
            }
        }, 220);
    }

    async function refreshIssueComments() {
        if (!state.issue) {
            return;
        }

        const comments = await api(
            `/api/jira/issue/${encodeURIComponent(state.issue.key)}/comments`
        );
        renderIssueComments(comments);
    }

    function setFormBusy(form, busy) {
        form.querySelectorAll('button, input, textarea, select')
            .forEach(control => {
                control.disabled = busy;
            });
        form.setAttribute('aria-busy', String(busy));
    }

    function toggleEditor(name, visible) {
        const configurations = {
            summary: {
                form: summaryForm,
                preview: summaryElement,
                trigger: document.querySelector('#edit-summary'),
                focus: summaryInput
            },
            description: {
                form: descriptionForm,
                preview: descriptionElement,
                trigger: document.querySelector('#edit-description'),
                focus: descriptionInput
            },
            fields: {
                form: fieldsForm,
                preview: document.querySelector('#editable-fields-preview'),
                trigger: document.querySelector('#edit-fields'),
                focus: document.querySelector('#labels-input')
            },
            worklog: {
                form: worklogForm,
                preview: document.querySelector('.time-tracking-summary'),
                trigger: document.querySelector('#toggle-worklog'),
                focus: document.querySelector('#worklog-time')
            }
        };
        const editor = configurations[name];

        if (!editor) {
            return;
        }

        editor.form.hidden = !visible;
        editor.preview.hidden = visible;
        editor.trigger.hidden = visible;

        if (visible) {
            editor.focus.focus();
        }
    }

    function resetIssueEditors(issue) {
        summaryInput.value = issue.fields?.summary || '';
        descriptionInput.value = adfToText(
            issue.fields?.description
        ).trim();
        commentInput.value = '';
        state.commentMentions = [];
        replyContext.hidden = true;
        replyContext.removeAttribute('data-account-id');
        closeMentionMenu();
        document.querySelector('#worklog-time').value = '';
        document.querySelector('#worklog-comment').value = '';
        ['summary', 'description', 'fields', 'worklog']
            .forEach(name => toggleEditor(name, false));
    }

    function syncBoardIssue(issue) {
        const boardIssue = (state.data?.issues?.issues || [])
            .find(candidate => candidate.key === issue.key);

        if (boardIssue) {
            boardIssue.fields = {
                ...boardIssue.fields,
                ...issue.fields
            };
        }
    }

    function renderIssueDetails(issue) {
        const fields = issue.fields || {};
        const typeIcon = document.querySelector('#issue-type-icon');

        state.issue = issue;
        document.querySelector('#issue-key').textContent = issue.key;
        summaryElement.textContent = fields.summary || issue.key;
        summaryInput.value = fields.summary || '';
        descriptionInput.value = adfToText(fields.description).trim();

        if (fields.issuetype?.iconUrl) {
            typeIcon.src = jiraMediaUrl(fields.issuetype.iconUrl);
            typeIcon.hidden = false;
        } else {
            typeIcon.removeAttribute('src');
            typeIcon.hidden = true;
        }

        renderIssueMeta(issue);
        renderEditableFields(issue);
        renderTimeTracking(issue);
        renderIssueDescription(fields.description);
        renderIssueLinks(issue);
        renderIssueAttachments(issue);
        syncBoardIssue(issue);
    }

    async function refreshCurrentIssue() {
        if (!state.issue) {
            return null;
        }

        const issue = await api(
            `/api/jira/issue/${encodeURIComponent(state.issue.key)}`
        );

        renderIssueDetails(issue);

        return issue;
    }

    async function submitIssueUpdate(form, fields, editorName) {
        if (!state.issue) {
            return;
        }

        setFormBusy(form, true);

        try {
            await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify(fields)
                }
            );
            await refreshCurrentIssue();
            toggleEditor(editorName, false);
            showToast('Ticket mis à jour', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setFormBusy(form, false);
        }
    }

    async function openIssue(issueKey) {
        try {
            const encodedIssueKey = encodeURIComponent(issueKey);
            const [issue, transitions, comments] = await Promise.all([
                api(`/api/jira/issue/${encodedIssueKey}`),
                api(`/api/jira/issue/${encodedIssueKey}/transitions`),
                api(`/api/jira/issue/${encodedIssueKey}/comments`)
                    .catch(() => ({ unavailable: true }))
            ]);

            const issueUrl = jiraIssueUrl(issue.key, issue);
            const openIssueLink = document.querySelector('#open-issue');

            if (issueUrl) {
                openIssueLink.href = issueUrl;
            } else {
                openIssueLink.removeAttribute('href');
            }

            openIssueLink.toggleAttribute('aria-disabled', !issueUrl);

            renderIssueDetails(issue);
            resetIssueEditors(issue);
            renderIssueComments(comments, issue.fields?.comment);

            transition.innerHTML = '';

            const currentStatus = document.createElement('option');
            currentStatus.value = '';
            currentStatus.textContent = issue.fields?.status?.name
                ? `État : ${issue.fields.status.name}`
                : 'Changer l’état…';
            currentStatus.selected = true;
            transition.append(currentStatus);

            (transitions.transitions || []).forEach(item => {
                const option = document.createElement('option');

                option.value = item.id;
                option.textContent =
                    item.name || item.to?.name || item.id;

                transition.append(option);
            });

            document.querySelector('#apply-transition').disabled =
                true;

            if (!dialog.open) {
                dialog.showModal();
            } else {
                dialog.querySelector('.issue-dialog-main').scrollTop = 0;
                dialog.querySelector('.issue-sidebar').scrollTop = 0;
                dialog.querySelector('.issue-dialog-layout').scrollTop = 0;
            }
        } catch (error) {
            alert(error.message);
        }
    }

    async function applyTransition() {
        if (!state.issue || !transition.value) {
            return;
        }

        const button =
            document.querySelector('#apply-transition');

        button.disabled = true;

        try {
            await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}/transition`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        transitionId: transition.value
                    })
                }
            );

            dialog.close();
            await loadBoard();
        } catch (error) {
            alert(error.message);
        } finally {
            button.disabled = false;
        }
    }

    async function submitComment(event) {
        event.preventDefault();

        const comment = commentInput.value.trim();
        const mentions = state.commentMentions.filter(mention =>
            comment.includes(mention.text)
        );

        if (!state.issue || !comment) {
            return;
        }

        setFormBusy(commentForm, true);

        try {
            await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}/comments`,
                {
                    method: 'POST',
                    body: JSON.stringify({ comment, mentions })
                }
            );
            commentInput.value = '';
            state.commentMentions = [];
            replyContext.hidden = true;
            closeMentionMenu();
            await refreshIssueComments();
            showToast('Commentaire ajouté', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setFormBusy(commentForm, false);
        }
    }

    async function submitWorklog(event) {
        event.preventDefault();

        if (!state.issue) {
            return;
        }

        const timeSpent = document.querySelector('#worklog-time')
            .value.trim();
        const comment = document.querySelector('#worklog-comment')
            .value.trim();

        if (!timeSpent) {
            return;
        }

        setFormBusy(worklogForm, true);

        try {
            await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}/worklogs`,
                {
                    method: 'POST',
                    body: JSON.stringify({ timeSpent, comment })
                }
            );
            document.querySelector('#worklog-time').value = '';
            document.querySelector('#worklog-comment').value = '';
            await refreshCurrentIssue();
            toggleEditor('worklog', false);
            showToast('Temps consigné', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setFormBusy(worklogForm, false);
        }
    }

    function submitEditableFields(event) {
        event.preventDefault();

        const labels = document.querySelector('#labels-input').value
            .split(',')
            .map(label => label.trim())
            .filter(Boolean);

        submitIssueUpdate(fieldsForm, {
            labels,
            dueDate: document.querySelector('#due-date-input').value,
            originalEstimate: document
                .querySelector('#original-estimate-input').value.trim(),
            remainingEstimate: document
                .querySelector('#remaining-estimate-input').value.trim()
        }, 'fields');
    }

    async function loadBoard() {
        board.innerHTML =
            '<div class="loading">Chargement...</div>';

        try {
            state.data =
                await api(`/api/jira/board/${boardId}`);
            issueRefresher.setCursor(state.data.issues?.snapshotAt);

            document.querySelector('#board-name').textContent =
                state.data.board?.name || 'Jira Lite';
            updatePageIcon(state.data.board);
            document.querySelector('#sprint-name').textContent =
                currentSprintName(state.data.issues?.issues || []);

            restoreViewFromUrl();
            renderEpics();
            updateViewButtons();
            renderBoard(state.selectedEpicIds.size > 0);
            await issueRefresher.refresh();
        } catch (error) {
            board.innerHTML = '';

            const message = document.createElement('div');
            message.className = 'loading';
            message.textContent = error.message;

            board.append(message);
        }
    }

    const issueRefresher = createIssueRefresher({
        boardId,
        state,
        board,
        counter,
        matchesSearch,
        availableEpics,
        createCard,
        epicForIssue,
        updateColumnCount,
        renderEpics,
        updateEpicFilter,
        writeEpicsToUrl,
        renderBoard
    });

    restoreCollapsedEpics();

    search.addEventListener('input', () => renderBoard());
    epicFilterTrigger.addEventListener('click', event => {
        event.stopPropagation();
        const open = epicFilterMenu.hidden;

        epicFilterMenu.hidden = !open;
        epicFilterTrigger.setAttribute('aria-expanded', String(open));
        epicFilter.classList.toggle('is-open', open);
    });

    document.addEventListener('click', event => {
        if (!epicFilter.contains(event.target)) {
            epicFilterMenu.hidden = true;
            epicFilterTrigger.setAttribute('aria-expanded', 'false');
            epicFilter.classList.remove('is-open');
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            epicFilterMenu.hidden = true;
            epicFilterTrigger.setAttribute('aria-expanded', 'false');
            epicFilter.classList.remove('is-open');
            epicFilterTrigger.focus();
        }
    });

    viewOptions.forEach(button => {
        button.addEventListener('click', () => {
            setView(button.dataset.view);
        });
    });

    toggleAllEpics.addEventListener('click', () => {
        const groups = Array.from(board.querySelectorAll('.board-group'));
        const collapse = groups.some(group =>
            !group.classList.contains('is-collapsed')
        );

        groups.forEach(group => setEpicCollapsed(group, collapse));
        saveCollapsedEpics();
        updateToggleAllEpics();
    });

    window.addEventListener('popstate', () => {
        if (state.data) {
            restoreViewFromUrl();
            restoreEpicsFromUrl();
            updateViewButtons();
            updateEpicFilter();
            renderBoard(state.selectedEpicIds.size > 0);
        }
    });

    document.querySelector('#reload')
        .addEventListener('click', loadBoard);

    document.querySelector('#close-dialog')
        .addEventListener('click', () => dialog.close());

    document.querySelector('#apply-transition')
        .addEventListener('click', applyTransition);
    transition.addEventListener('change', () => {
        document.querySelector('#apply-transition').disabled =
            !transition.value;
    });

    document.querySelector('#edit-summary')
        .addEventListener('click', () => toggleEditor('summary', true));
    document.querySelector('#edit-description')
        .addEventListener('click', () => toggleEditor('description', true));
    document.querySelector('#edit-fields')
        .addEventListener('click', () => toggleEditor('fields', true));
    document.querySelector('#toggle-worklog')
        .addEventListener('click', () => toggleEditor('worklog', true));

    document.querySelectorAll('[data-cancel-edit]').forEach(button => {
        button.addEventListener('click', () => {
            const editor = button.dataset.cancelEdit;

            if (state.issue) {
                resetIssueEditors(state.issue);
                renderEditableFields(state.issue);
            }

            toggleEditor(editor, false);
        });
    });

    summaryForm.addEventListener('submit', event => {
        event.preventDefault();
        submitIssueUpdate(summaryForm, {
            summary: summaryInput.value.trim()
        }, 'summary');
    });

    descriptionForm.addEventListener('submit', event => {
        event.preventDefault();
        submitIssueUpdate(descriptionForm, {
            description: descriptionInput.value.trim()
        }, 'description');
    });

    fieldsForm.addEventListener('submit', submitEditableFields);
    commentForm.addEventListener('submit', submitComment);
    worklogForm.addEventListener('submit', submitWorklog);
    document.querySelector('#cancel-reply').addEventListener('click', () => {
        const accountId = replyContext.dataset.accountId;
        const mention = state.commentMentions.find(candidate =>
            candidate.accountId === accountId
        );

        if (mention && commentInput.value.startsWith(`${mention.text} `)) {
            commentInput.value = commentInput.value.slice(
                mention.text.length + 1
            );
        }

        state.commentMentions = state.commentMentions.filter(candidate =>
            candidate.accountId !== accountId
        );
        replyContext.hidden = true;
        replyContext.removeAttribute('data-account-id');
        commentInput.focus();
    });
    commentInput.addEventListener('input', scheduleMentionSearch);
    commentInput.addEventListener('blur', () => {
        window.setTimeout(() => closeMentionMenu(), 140);
    });
    commentInput.addEventListener('keydown', event => {
        if (!mentionMenu.hidden) {
            const options = Array.from(
                mentionMenu.querySelectorAll('.mention-option')
            );
            const activeIndex = options.findIndex(option =>
                option.classList.contains('is-active')
            );

            if (
                options.length
                && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
            ) {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                const nextIndex = (
                    activeIndex + direction + options.length
                ) % options.length;
                options.forEach((option, index) => {
                    option.classList.toggle('is-active', index === nextIndex);
                    option.setAttribute(
                        'aria-selected',
                        String(index === nextIndex)
                    );
                });
                return;
            }

            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                const selected = options[activeIndex] || options[0];

                if (selected?.mentionUser) {
                    event.preventDefault();
                    selectMentionUser(selected.mentionUser);
                    return;
                }
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeMentionMenu();
                return;
            }
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commentForm.requestSubmit();
        }
    });

    loadBoard();

    return {
        refresh: issueRefresher.refresh
    };
}
