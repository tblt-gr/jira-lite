import { api } from './api.js';
import { jiraMediaUrl } from './dom.js';
import { createIssueRefresher } from './refresh.js';
import { createCardView } from './card-view.js';
import { connectCard } from './card-controller.js';
import { createBoardView, currentSprintName } from './board-view.js';
import { createIssueDialog } from './issue-dialog.js';
import { createIssueCreator } from './create-issue-dialog.js';
import { createDragDrop } from './drag-drop.js';
import { trans } from './i18n.js';
import { createMultiSelect } from './multi-select.js';
import { createFavoriteButton, favoritesFirst } from '../favorites.js';
import {
    WITHOUT_VERSION_ID,
    availableColumns as selectAvailableColumns,
    availableEpics as selectAvailableEpics,
    availableIssueTypes as selectAvailableIssueTypes,
    availableVersions as selectAvailableVersions,
    epicForIssue as selectEpicForIssue,
    replaceIssues,
    statusColumnMap,
    storyPoints as selectStoryPoints
} from './board-model.js';
import {
    canonicalEpicId,
    epicColor,
    epicLabel,
    isActiveIssue,
    issueBelongsToEpic
} from './jira.js';

export function mountBoard(root, boardId) {
    const lifecycleController = new AbortController();
    const listenerOptions = { signal: lifecycleController.signal };
    let boardRequestController = null;
    const toastTimers = new Set();
    const toastFrames = new Set();
    const state = {
        data: null,
        issue: null,
        selectedEpicIds: new Set(),
        selectedVersionIds: new Set(),
        selectedTypeIds: new Set(),
        selectedColumnIds: new Set(),
        collapsedEpicIds: new Set(),
        view: 'epic',
        drag: {
            issues: [],
            cards: [],
            card: null,
            workflow: null,
            allowedStatusIds: null,
            justDragged: false
        },
        selectedIssueKeys: new Set(),
        selectedColumnId: null,
        currentUser: null,
        commentMentions: []
    };

    const board = root.querySelector('#board');
    const search = root.querySelector('#search');
    const epicFilter = root.querySelector('#epic-filter');
    const epicFilterTrigger = root.querySelector('#epic-filter-trigger');
    const epicFilterLabel = root.querySelector('#epic-filter-label');
    const epicFilterCount = root.querySelector('#epic-filter-count');
    const epicFilterMenu = root.querySelector('#epic-filter-menu');
    const versionFilter = root.querySelector('#version-filter');
    const typeFilter = root.querySelector('#type-filter');
    const columnFilter = root.querySelector('#column-filter');
    const counter = root.querySelector('#counter');
    const reloadButton = root.querySelector('#reload');
    let boardView = null;
    let dragDrop = null;
    const viewOptions = root.querySelectorAll('[data-view]');
    const toggleAllEpics = root.querySelector('#toggle-all-epics');
    const toastRegion = root.querySelector('#toast-region');
    const pageIcon = document.querySelector('#page-icon');
    const boardIcon = root.querySelector('#board-icon');
    const boardSwitcherNative = root.querySelector('#board-switcher-native');
    const boardNameLabel = root.querySelector('#board-name');
    let boardSwitcher = null;
    let boardOptions = [];
    const collapsedEpicsStorageKey = `jira-lite:${boardId}:collapsed-epics`;

    function schedule(callback, delay) {
        const timer = window.setTimeout(() => {
            toastTimers.delete(timer);
            callback();
        }, delay);
        toastTimers.add(timer);

        return timer;
    }

    function setBoardName(name) {
        if (boardNameLabel) {
            boardNameLabel.textContent = name;
        }

        if (!boardSwitcher) {
            return;
        }

        boardOptions = boardOptions.map(option =>
            option.id === String(boardId) ? { ...option, name } : option
        );
        renderBoardOptions();
    }

    /**
     * L'icône est déjà rendue côté serveur : on ne réassigne la source
     * que si elle change réellement, sinon l'image reclignote.
     */
    function isSameMedia(current, next) {
        try {
            const from = new URL(current, window.location.origin);
            const to = new URL(next, window.location.origin);

            return from.pathname === to.pathname
                && from.searchParams.get('url')
                    === to.searchParams.get('url');
        } catch {
            return false;
        }
    }

    function updatePageIcon(boardData) {
        const iconUrl =
            boardData?.location?.avatarURI ||
            boardData?.location?.avatarUrl;

        if (!iconUrl) {
            return;
        }

        const mediaUrl = jiraMediaUrl(iconUrl);

        if (pageIcon && !isSameMedia(pageIcon.getAttribute('href'), mediaUrl)) {
            pageIcon.removeAttribute('type');
            pageIcon.href = mediaUrl;
        }

        if (boardIcon && isSameMedia(boardIcon.getAttribute('src'), mediaUrl)) {
            return;
        }

        if (boardIcon) {
            boardIcon.onerror = () => {
                boardIcon.onerror = null;
                boardIcon.src = '/images/favicon.png';
            };
            boardIcon.src = mediaUrl;
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
        const label = trans(
            allCollapsed ? 'board.expand_all' : 'board.collapse_all'
        );

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
                trans(
                    collapsed ? 'board.expand_epic' : 'board.collapse_epic'
                )
            );
        }

        header?.setAttribute('aria-expanded', String(!collapsed));

        if (collapsed) {
            state.collapsedEpicIds.add(id);
        } else {
            state.collapsedEpicIds.delete(id);
        }
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

        const frame = window.requestAnimationFrame(() => {
            toastFrames.delete(frame);

            if (!lifecycleController.signal.aborted) {
                toast.classList.add('is-visible');
            }
        });
        toastFrames.add(frame);

        schedule(() => {
            toast.classList.remove('is-visible');
            schedule(() => toast.remove(), 180);
        }, 3200);
    }

    function storyPoints(issue) {
        return selectStoryPoints(issue, state.data?.issues?.names);
    }

    function availableEpics() {
        return selectAvailableEpics(state.data);
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

    /**
     * Un board sans epic (ou avec un seul) n'a rien à grouper :
     * on bascule alors sur la vue board unique.
     */
    function forceSingleBoardWithoutEpics() {
        if (availableEpics().length > 1 || state.view === 'board') {
            return;
        }

        state.view = 'board';

        const url = new URL(window.location.href);

        if (url.searchParams.get('view') !== 'board') {
            url.searchParams.set('view', 'board');
            window.history.replaceState({}, '', url);
        }
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
            epicFilterLabel.textContent = trans('board.all_active_epics');
            epicFilterCount.textContent = '';
        } else if (selected.length === 1) {
            epicFilterLabel.textContent = epicLabel(
                selected[0],
                trans('board.without_epic')
            );
            epicFilterCount.textContent = '1';
        } else {
            epicFilterLabel.textContent = trans('board.selected_epics', {
                count: selected.length
            });
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

    function renderEpics() {
        const values = availableEpics();

        epicFilterMenu.innerHTML = '';

        const menuHeader = document.createElement('div');
        menuHeader.className = 'epic-filter-menu-head';

        const menuTitle = document.createElement('span');
        menuTitle.textContent = trans('board.epics_title');

        const clearButton = document.createElement('button');
        clearButton.className = 'epic-filter-clear';
        clearButton.type = 'button';
        clearButton.textContent = trans('board.clear_all');
        clearButton.addEventListener('click', event => {
            event.stopPropagation();
            state.selectedEpicIds.clear();
            writeEpicsToUrl();
            updateEpicFilter();
            renderBoard(false);
        }, listenerOptions);

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
            label.textContent = epicLabel(epic, trans('board.without_epic'));

            const badge = document.createElement('span');
            badge.className = 'epic-count';
            badge.textContent = activeCount;

            option.append(input, dot, label, badge);

            input.addEventListener('change', () => {
                toggleEpic(id);
            }, listenerOptions);

            option.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    input.click();
                }
            }, listenerOptions);

            epicFilterMenu.append(option);
        });

        if (!values.length) {
            const empty = document.createElement('div');
            empty.className = 'epic-filter-empty';
            empty.textContent = trans('board.no_active_epic');
            epicFilterMenu.append(empty);
        }

        restoreEpicsFromUrl();
        updateEpicFilter();
    }

    function boardIssues() {
        return state.data?.issues?.issues || [];
    }

    function filterCatalogs() {
        const issues = boardIssues();
        const statusToColumn = statusColumnMap(
            state.data?.configuration?.columnConfig?.columns || []
        );
        const versions = selectAvailableVersions(state.data).map(version => ({
            ...version,
            count: issues.filter(issue =>
                (issue.fields?.fixVersions || []).some(candidate =>
                    String(candidate?.id ?? candidate?.name) === version.id
                )
            ).length
        }));
        const withoutVersion = issues.filter(issue =>
            !(issue.fields?.fixVersions || []).length
        ).length;

        if (withoutVersion) {
            versions.push({
                id: WITHOUT_VERSION_ID,
                name: trans('board.without_version'),
                count: withoutVersion
            });
        }

        const types = selectAvailableIssueTypes(state.data).map(type => ({
            ...type,
            count: issues.filter(issue => {
                const issueType = issue.fields?.issuetype;

                return String(issueType?.id ?? issueType?.name) === type.id;
            }).length
        }));

        const columns = selectAvailableColumns(state.data).map(column => ({
            ...column,
            count: issues.filter(issue => {
                const statusId = issue.fields?.status?.id;

                return statusId !== undefined
                    && statusId !== null
                    && statusToColumn.get(String(statusId))?.name
                        === column.name;
            }).length
        }));

        return { versions, types, columns };
    }

    function filterEntries() {
        return [
            ['version', state.selectedVersionIds],
            ['type', state.selectedTypeIds],
            ['column', state.selectedColumnIds]
        ];
    }

    function writeFiltersToUrl(replace = false) {
        const url = new URL(window.location.href);

        filterEntries().forEach(([param, selected]) => {
            url.searchParams.delete(param);
            selected.forEach(value => url.searchParams.append(param, value));
        });

        window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    }

    function restoreFiltersFromUrl() {
        const url = new URL(window.location.href);

        filterEntries().forEach(([param, selected]) => {
            selected.clear();
            url.searchParams
                .getAll(param)
                .filter(Boolean)
                .forEach(value => selected.add(value));
        });
    }

    function renderFilters() {
        const catalogs = filterCatalogs();
        const targets = [
            [versionSelect, catalogs.versions, state.selectedVersionIds],
            [typeSelect, catalogs.types, state.selectedTypeIds],
            [columnSelect, catalogs.columns, state.selectedColumnIds]
        ];
        let purged = false;

        targets.forEach(([select, options, selected]) => {
            const allowed = new Set(options.map(option => option.id));

            Array.from(selected).forEach(id => {
                if (!allowed.has(id)) {
                    selected.delete(id);
                    purged = true;
                }
            });

            select.setOptions(options);
        });

        if (purged) {
            writeFiltersToUrl(true);
        }
    }

    function hasActiveFilter() {
        return filterEntries().some(([, selected]) => selected.size > 0);
    }

    function epicForIssue(issue, epicCatalog = availableEpics()) {
        return selectEpicForIssue(issue, epicCatalog);
    }

    function renderBoard(revealFirstIssue = false) {
        boardView.render(revealFirstIssue);
    }
    function createCard(issue, epic = null) {
        const card = createCardView(
            issue,
            epic,
            storyPoints(issue),
            trans,
            lifecycleController.signal
        );

        return connectCard(card, issue, {
            state,
            clearSelection: dragDrop.clearSelection,
            toggleSelection: dragDrop.toggleSelection,
            clearDropTargets: dragDrop.clearDropTargets,
            beginDragValidation: dragDrop.beginDragValidation,
            endDragValidation: dragDrop.endDragValidation,
            stopAutoScroll: dragDrop.stopAutoScroll,
            openIssue,
            signal: lifecycleController.signal,
            schedule
        });
    }
    async function loadBoard() {
        boardRequestController?.abort();
        boardRequestController = new AbortController();
        const { signal } = boardRequestController;
        board.replaceChildren();
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = trans('board.loading');
        board.append(loading);

        try {
            state.data =
                await api(`/api/jira/board/${boardId}`, { signal });
            issueRefresher.setCursor(state.data.issues?.snapshotAt);

            setBoardName(state.data.board?.name || trans('app.title'));
            updatePageIcon(state.data.board);
            root.querySelector('#sprint-name').textContent =
                currentSprintName(state.data.issues?.issues || []);

            restoreViewFromUrl();
            forceSingleBoardWithoutEpics();
            renderEpics();
            restoreFiltersFromUrl();
            renderFilters();
            updateViewButtons();
            renderBoard(
                state.selectedEpicIds.size > 0 || hasActiveFilter()
            );
            await issueRefresher.refresh();
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }

            board.innerHTML = '';

            const message = document.createElement('div');
            message.className = 'loading';
            message.textContent = error.message;

            board.append(message);
        }
    }

    dragDrop = createDragDrop({
        state,
        board,
        boardId,
        trans,
        showToast,
        renderBoard
    });

    const issueDialog = createIssueDialog({
        root,
        boardId,
        trans,
        state,
        showToast,
        jiraIssueUrl,
        renderBoard
    });

    function openIssue(issueKey) {
        return issueDialog.openIssue(issueKey);
    }

    boardView = createBoardView({
        boardId,
        state,
        board,
        counter,
        search,
        jiraIssueUrl,
        setEpicCollapsed,
        saveCollapsedEpics,
        updateToggleAllEpics,
        enableDropZone: dragDrop.enableDropZone,
        createCard,
        epicForIssue,
        openCreateIssue: epic => issueCreator.open({ epic }),
        trans,
        signal: lifecycleController.signal
    });

    const issueRefresher = createIssueRefresher({
        boardId,
        state,
        trans,
        availableEpics,
        renderEpics,
        renderFilters,
        writeEpicsToUrl,
        renderBoard,
        onError: message => showToast(message, 'error')
    });

    const issueCreator = createIssueCreator({
        root,
        boardId,
        trans,
        showToast,
        getEpics: () => state.data?.epics?.values || [],
        signal: lifecycleController.signal,
        async onCreated(issue, creation) {
            if (!state.data?.issues || !issue?.key) {
                return;
            }

            const selectedEpic = (state.data.epics?.values || []).find(epic =>
                String(epic?.key || '') === creation.epicKey
            );
            const createdIssue = selectedEpic
                ? {
                    ...issue,
                    fields: {
                        ...(issue.fields || {}),
                        epic: selectedEpic
                    }
                }
                : issue;

            state.data.issues.issues = replaceIssues(
                state.data.issues.issues,
                [createdIssue]
            );
            renderEpics();
            renderFilters();
            renderBoard(false);

            await openIssue(issue.key);
        }
    });

    function createFilterSelect(container, keys, selected) {
        return createMultiSelect({
            container,
            labels: {
                all: trans(keys.all),
                title: trans(keys.title),
                clear: trans('board.clear_all'),
                empty: trans('board.no_filter_value'),
                selected: count =>
                    trans('board.selected_values', { count })
            },
            selected,
            onChange: () => {
                writeFiltersToUrl();
                renderBoard(false);
            },
            signal: lifecycleController.signal
        });
    }

    function mountBoardSwitcher() {
        const container = root.querySelector('#board-switcher');

        if (!container || !boardSwitcherNative) {
            return;
        }

        boardOptions = Array.from(boardSwitcherNative.options).map(option => ({
            id: option.value,
            name: option.textContent.trim(),
            url: option.dataset.url
        }));

        if (!boardOptions.length) {
            return;
        }

        const selectedBoardIds = new Set([String(boardId)]);

        boardSwitcher = createMultiSelect({
            container,
            labels: {
                all: trans('common.unnamed_board'),
                title: trans('board.switch_board'),
                clear: trans('board.clear_all'),
                empty: trans('board.no_filter_value'),
                selected: () => ''
            },
            selected: selectedBoardIds,
            multiple: false,
            onChange: () => {
                const [selectedId] = Array.from(selectedBoardIds);
                const target = boardOptions
                    .find(option => option.id === selectedId)?.url;

                if (target && selectedId !== String(boardId)) {
                    window.location.assign(target);
                }
            },
            renderSuffix: option => createFavoriteButton({
                boardId: option.id,
                labels: {
                    add: trans('board.favorite_add'),
                    remove: trans('board.favorite_remove')
                },
                onToggle: () => renderBoardOptions(),
                signal: lifecycleController.signal
            }),
            signal: lifecycleController.signal
        });

        renderBoardOptions();
    }

    function renderBoardOptions() {
        boardSwitcher?.setOptions(
            favoritesFirst(boardOptions, option => option.id)
                .map(({ id, name }) => ({ id, name }))
        );
    }

    const versionSelect = createFilterSelect(
        versionFilter,
        { all: 'board.all_versions', title: 'board.versions_title' },
        state.selectedVersionIds
    );
    const typeSelect = createFilterSelect(
        typeFilter,
        { all: 'board.all_types', title: 'board.types_title' },
        state.selectedTypeIds
    );
    const columnSelect = createFilterSelect(
        columnFilter,
        { all: 'board.all_columns', title: 'board.columns_title' },
        state.selectedColumnIds
    );

    restoreCollapsedEpics();

    search.addEventListener('input', () => renderBoard(), listenerOptions);
    epicFilterTrigger.addEventListener('click', () => {
        const open = epicFilterMenu.hidden;

        epicFilterMenu.hidden = !open;
        epicFilterTrigger.setAttribute('aria-expanded', String(open));
        epicFilter.classList.toggle('is-open', open);
    }, listenerOptions);

    function handleDocumentClick(event) {
        if (!epicFilter.contains(event.target)) {
            epicFilterMenu.hidden = true;
            epicFilterTrigger.setAttribute('aria-expanded', 'false');
            epicFilter.classList.remove('is-open');
        }
    }

    document.addEventListener('click', handleDocumentClick, listenerOptions);

    function handleDocumentKeydown(event) {
        if (event.key === 'Escape') {
            const epicWasOpen = !epicFilterMenu.hidden;
            epicFilterMenu.hidden = true;
            epicFilterTrigger.setAttribute('aria-expanded', 'false');
            epicFilter.classList.remove('is-open');

            if (epicWasOpen) {
                epicFilterTrigger.focus();
            }
        }
    }

    document.addEventListener('keydown', handleDocumentKeydown, listenerOptions);

    viewOptions.forEach(button => {
        button.addEventListener('click', () => {
            setView(button.dataset.view);
        }, listenerOptions);
    });

    toggleAllEpics.addEventListener('click', () => {
        const groups = Array.from(board.querySelectorAll('.board-group'));
        const collapse = groups.some(group =>
            !group.classList.contains('is-collapsed')
        );

        groups.forEach(group => setEpicCollapsed(group, collapse));
        saveCollapsedEpics();
        updateToggleAllEpics();
    }, listenerOptions);

    function handlePopstate() {
        if (state.data) {
            restoreViewFromUrl();
            forceSingleBoardWithoutEpics();
            restoreEpicsFromUrl();
            restoreFiltersFromUrl();
            renderFilters();
            updateViewButtons();
            updateEpicFilter();
            renderBoard(
                state.selectedEpicIds.size > 0 || hasActiveFilter()
            );
        }
    }

    window.addEventListener('popstate', handlePopstate, listenerOptions);

    async function refreshBoardInPlace() {
        if (!state.data) {
            await loadBoard();
            return;
        }

        reloadButton.disabled = true;
        reloadButton.classList.add('is-refreshing');
        reloadButton.setAttribute('aria-busy', 'true');

        try {
            await issueRefresher.refresh();
        } finally {
            reloadButton.disabled = false;
            reloadButton.classList.remove('is-refreshing');
            reloadButton.removeAttribute('aria-busy');
        }
    }

    reloadButton.addEventListener(
        'click',
        refreshBoardInPlace,
        listenerOptions
    );

    mountBoardSwitcher();

    loadBoard();

    return {
        refresh: issueRefresher.refresh,
        destroy() {
            lifecycleController.abort();
            boardRequestController?.abort();
            issueRefresher.destroy();
            dragDrop.destroy();
            boardView.destroy();
            issueCreator.destroy();
            issueDialog.destroy();
            toastTimers.forEach(timer => window.clearTimeout(timer));
            toastTimers.clear();
            toastFrames.forEach(frame => window.cancelAnimationFrame(frame));
            toastFrames.clear();
        }
    };
}
