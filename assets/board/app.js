import { api } from './api.js';
import { createBoardFilters } from './board-filters.js';
import { createBoardShell } from './board-shell.js';
import { createBoardView, currentSprintName } from './board-view.js';
import { createBoardViewControls } from './board-view-controls.js';
import { connectCard } from './card-controller.js';
import { createCardView } from './card-view.js';
import { createIssueCreator } from './create-issue-dialog.js';
import { createDragDrop } from './drag-drop.js';
import { createEpicFilter } from './epic-filter.js';
import { createEpicJump } from './epic-jump.js';
import { trans } from './i18n.js';
import { createIssueDialog } from './dialog/issue-dialog.js';
import { createIssueRefresher } from './refresh.js';
import {
    availableEpics as selectAvailableEpics,
    epicForIssue as selectEpicForIssue,
    replaceIssues,
    storyPoints as selectStoryPoints
} from './board-model.js';

function createBoardState() {
    return {
        data: null,
        issue: null,
        selectedEpicIds: new Set(),
        epicFilterActive: false,
        selectedAssigneeIds: new Set(),
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
        issueRevisions: new Map(),
        currentUser: null,
        commentMentions: []
    };
}

// This module composes board features; DOM-heavy controls live in focused modules.
export function mountBoard(root, boardId) {
    const lifecycleController = new AbortController();
    const { signal } = lifecycleController;
    const listenerOptions = { signal };
    const state = createBoardState();
    const board = root.querySelector('#board');
    const search = root.querySelector('#search');
    const counter = root.querySelector('#counter');
    const reloadButton = root.querySelector('#reload');
    let boardRequestController = null;

    const shell = createBoardShell({ root, boardId, state, signal });

    function availableEpics() {
        return selectAvailableEpics(state.data);
    }

    function storyPoints(issue) {
        return selectStoryPoints(issue, state.data?.issues?.names);
    }

    function renderBoard(revealFirstIssue = false) {
        boardView.render(revealFirstIssue);
    }

    function markIssuesUpdated(issues) {
        issues.forEach(issue => {
            if (issue?.key) {
                const key = String(issue.key);
                state.issueRevisions.set(
                    key,
                    (state.issueRevisions.get(key) || 0) + 1
                );
            }
        });
    }

    const dragDrop = createDragDrop({
        state,
        board,
        boardId,
        trans,
        showToast: shell.showToast,
        renderBoard,
        markIssuesUpdated
    });
    const issueDialog = createIssueDialog({
        root,
        boardId,
        trans,
        state,
        showToast: shell.showToast,
        jiraIssueUrl: shell.jiraIssueUrl,
        renderBoard
    });

    function openIssue(issueKey) {
        return issueDialog.openIssue(issueKey);
    }

    function createCard(issue, epic = null) {
        const card = createCardView(issue, epic, storyPoints(issue), trans, signal);

        return connectCard(card, issue, {
            state,
            clearSelection: dragDrop.clearSelection,
            toggleSelection: dragDrop.toggleSelection,
            clearDropTargets: dragDrop.clearDropTargets,
            beginDragValidation: dragDrop.beginDragValidation,
            endDragValidation: dragDrop.endDragValidation,
            stopAutoScroll: dragDrop.stopAutoScroll,
            openIssue,
            signal,
            schedule: shell.schedule
        });
    }

    const viewControls = createBoardViewControls({
        board,
        boardId,
        state,
        toggleAllEpics: root.querySelector('#toggle-all-epics'),
        viewOptions: root.querySelectorAll('[data-view]'),
        availableEpics,
        renderBoard,
        trans,
        signal
    });

    const boardView = createBoardView({
        boardId,
        state,
        board,
        counter,
        search,
        jiraIssueUrl: shell.jiraIssueUrl,
        setEpicCollapsed: viewControls.setEpicCollapsed,
        saveCollapsedEpics: viewControls.saveCollapsedEpics,
        updateToggleAllEpics: viewControls.updateToggleAllEpics,
        enableDropZone: dragDrop.enableDropZone,
        createCard,
        epicForIssue: (issue, catalog = availableEpics()) =>
            selectEpicForIssue(issue, catalog),
        openCreateIssue: epic => issueCreator.open({ epic }),
        trans,
        signal
    });

    const epicFilter = createEpicFilter({
        state,
        epicFilter: root.querySelector('#epic-filter'),
        epicFilterTrigger: root.querySelector('#epic-filter-trigger'),
        epicFilterLabel: root.querySelector('#epic-filter-label'),
        epicFilterCount: root.querySelector('#epic-filter-count'),
        epicFilterMenu: root.querySelector('#epic-filter-menu'),
        availableEpics,
        renderBoard,
        trans,
        signal
    });
    const filters = createBoardFilters({
        state,
        assigneeFilter: root.querySelector('#assignee-filter'),
        versionFilter: root.querySelector('#version-filter'),
        typeFilter: root.querySelector('#type-filter'),
        columnFilter: root.querySelector('#column-filter'),
        renderBoard,
        trans,
        signal
    });
    const issueRefresher = createIssueRefresher({
        boardId,
        state,
        trans,
        availableEpics,
        renderEpics: epicFilter.render,
        renderFilters: filters.render,
        writeEpicsToUrl: epicFilter.writeToUrl,
        renderBoard,
        onError: message => shell.showToast(message, 'error')
    });

    const issueCreator = createIssueCreator({
        root,
        boardId,
        trans,
        showToast: shell.showToast,
        getEpics: () => state.data?.epics?.values || [],
        signal,
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
                    fields: { ...(issue.fields || {}), epic: selectedEpic }
                }
                : issue;

            state.data.issues.issues = replaceIssues(
                state.data.issues.issues,
                [createdIssue]
            );
            epicFilter.render();
            filters.render();
            renderBoard(false);
            await openIssue(issue.key);
        }
    });

    async function loadBoard() {
        boardRequestController?.abort();
        boardRequestController = new AbortController();
        const requestSignal = boardRequestController.signal;
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = trans('board.loading');
        board.replaceChildren(loading);

        try {
            state.data = await api(`/api/jira/board/${boardId}`, {
                signal: requestSignal
            });
            issueRefresher.setCursor(state.data.issues?.snapshotAt);
            shell.setBoardName(state.data.board?.name || trans('app.title'));
            shell.updatePageIcon(state.data.board);
            root.querySelector('#sprint-name').textContent = currentSprintName(
                state.data.issues?.issues || []
            );
            viewControls.restoreViewFromUrl();
            viewControls.forceSingleBoardWithoutEpics();
            epicFilter.render();
            filters.restoreFromUrl();
            filters.render();
            viewControls.updateViewButtons();
            renderBoard(state.epicFilterActive || filters.hasActive());
            await issueRefresher.refresh();
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }

            const message = document.createElement('div');
            message.className = 'loading';
            message.textContent = error.message;
            board.replaceChildren(message);
        }
    }

    function handlePopstate() {
        if (!state.data) {
            return;
        }

        viewControls.restoreViewFromUrl();
        viewControls.forceSingleBoardWithoutEpics();
        epicFilter.restoreFromUrl();
        filters.restoreFromUrl();
        filters.render();
        viewControls.updateViewButtons();
        epicFilter.update();
        renderBoard(state.epicFilterActive || filters.hasActive());
    }

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

    createEpicJump({ board, root, state, signal });
    search.addEventListener('input', () => renderBoard(), listenerOptions);
    window.addEventListener('popstate', handlePopstate, listenerOptions);
    reloadButton.addEventListener('click', refreshBoardInPlace, listenerOptions);
    shell.mountBoardSwitcher();
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
            shell.destroy();
        }
    };
}
