// This module owns view selection and collapsed-epic persistence, not board rendering.
export function createBoardViewControls(context) {
    const {
        board,
        boardId,
        state,
        toggleAllEpics,
        trans,
        viewOptions,
        signal
    } = context;
    const collapsedEpicsStorageKey = `jira-lite:${boardId}:collapsed-epics`;

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
            // The board remains usable if local storage is unavailable.
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
        const label = trans(allCollapsed ? 'board.expand_all' : 'board.collapse_all');

        toggleAllEpics.textContent = label;
        toggleAllEpics.setAttribute('aria-label', label);
    }

    function setEpicCollapsed(group, collapsed) {
        const id = group.dataset.groupId;
        const workflow = group.querySelector('.workflow-board');
        const button = group.querySelector('.group-collapse');

        group.classList.toggle('is-collapsed', collapsed);
        if (workflow) {
            workflow.hidden = collapsed;
        }
        if (button) {
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', trans(
                collapsed ? 'board.expand_epic' : 'board.collapse_epic'
            ));
        }
        group.querySelector('.board-group-header')
            ?.setAttribute('aria-expanded', String(!collapsed));
        state.collapsedEpicIds[collapsed ? 'add' : 'delete'](id);
    }

    function restoreViewFromUrl() {
        const value = new URL(window.location.href).searchParams.get('view');
        state.view = value === 'board' ? 'board' : 'epic';
    }

    function forceSingleBoardWithoutEpics() {
        if (context.availableEpics().length > 1 || state.view === 'board') {
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

    function setView(view) {
        state.view = view === 'board' ? 'board' : 'epic';
        const url = new URL(window.location.href);
        url.searchParams.set('view', state.view);
        window.history.pushState({}, '', url);
        updateViewButtons();
        context.renderBoard(state.epicFilterActive);
    }

    viewOptions.forEach(button => {
        button.addEventListener('click', () => setView(button.dataset.view), { signal });
    });
    toggleAllEpics.addEventListener('click', () => {
        const groups = Array.from(board.querySelectorAll('.board-group'));
        const collapse = groups.some(group => !group.classList.contains('is-collapsed'));

        groups.forEach(group => setEpicCollapsed(group, collapse));
        saveCollapsedEpics();
        updateToggleAllEpics();
    }, { signal });
    restoreCollapsedEpics();

    return {
        forceSingleBoardWithoutEpics,
        restoreViewFromUrl,
        saveCollapsedEpics,
        setEpicCollapsed,
        updateToggleAllEpics,
        updateViewButtons
    };
}
