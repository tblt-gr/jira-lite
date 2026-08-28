import {
    canonicalEpicId,
    epicColor,
    epicLabel,
    isActiveIssue,
    issueBelongsToEpic
} from './jira.js';

const NO_EPIC_SELECTION = '__none__';

// This module owns epic filter DOM and URL state; board rendering is supplied as a callback.
export function createEpicFilter(context) {
    const {
        epicFilter,
        epicFilterCount,
        epicFilterLabel,
        epicFilterMenu,
        epicFilterTrigger,
        state,
        trans,
        signal
    } = context;

    function epicIdsFromUrl() {
        return new URL(window.location.href)
            .searchParams.getAll('epic').filter(Boolean);
    }

    function writeToUrl(replace = false) {
        const url = new URL(window.location.href);
        url.searchParams.delete('epic');

        if (state.epicFilterActive && !state.selectedEpicIds.size) {
            url.searchParams.append('epic', NO_EPIC_SELECTION);
        } else if (state.epicFilterActive) {
            state.selectedEpicIds.forEach(id => url.searchParams.append('epic', id));
        }

        window.history[replace ? 'replaceState' : 'pushState'](
            { epics: Array.from(state.selectedEpicIds) },
            '',
            url
        );
    }

    function restoreFromUrl() {
        const allowedIds = new Set(context.availableEpics().map(canonicalEpicId));
        const requestedIds = epicIdsFromUrl();
        const selectsNone = requestedIds.includes(NO_EPIC_SELECTION);

        state.selectedEpicIds = new Set(
            requestedIds.filter(id => allowedIds.has(id))
        );
        state.epicFilterActive = selectsNone || state.selectedEpicIds.size > 0;

        if (allowedIds.size > 0 && state.selectedEpicIds.size === allowedIds.size) {
            state.selectedEpicIds.clear();
            state.epicFilterActive = false;
        }

        const validRequestedCount = state.selectedEpicIds.size + (selectsNone ? 1 : 0);

        if (
            validRequestedCount !== requestedIds.length
            || (!state.epicFilterActive && requestedIds.length > 0)
        ) {
            writeToUrl(true);
        }
    }

    function update() {
        const catalog = new Map(
            context.availableEpics().map(epic => [canonicalEpicId(epic), epic])
        );
        const selected = Array.from(state.selectedEpicIds)
            .map(id => catalog.get(id)).filter(Boolean);
        const allSelected = !state.epicFilterActive;

        epicFilterMenu.querySelectorAll('[data-epic-id]').forEach(option => {
            const checked = allSelected
                || state.selectedEpicIds.has(option.dataset.epicId);
            const input = option.querySelector('input');

            option.classList.toggle('is-selected', checked);
            option.setAttribute('aria-selected', String(checked));
            if (input) {
                input.checked = checked;
            }
        });

        const allOption = epicFilterMenu.querySelector('.epic-filter-all-option');
        const allInput = allOption?.querySelector('input');

        if (allInput) {
            allInput.checked = allSelected;
            allInput.indeterminate = state.epicFilterActive
                && state.selectedEpicIds.size > 0;
            allOption.classList.toggle('is-selected', allSelected);
            allOption.classList.toggle('is-indeterminate', allInput.indeterminate);
            allOption.setAttribute('aria-selected', String(allSelected));
        }

        const clearButton = epicFilterMenu.querySelector('.epic-filter-clear');
        if (clearButton) {
            clearButton.disabled = !state.epicFilterActive;
        }

        if (!state.epicFilterActive) {
            epicFilterLabel.textContent = trans('board.all_active_epics');
            epicFilterCount.textContent = '';
        } else if (!selected.length) {
            epicFilterLabel.textContent = trans('board.no_epic_selected');
            epicFilterCount.textContent = '0';
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

    function selectOne(epicId, checked) {
        const values = context.availableEpics();

        if (!state.epicFilterActive) {
            state.selectedEpicIds = new Set(values.map(canonicalEpicId));
            state.epicFilterActive = true;
        }

        state.selectedEpicIds[checked ? 'add' : 'delete'](epicId);

        if (values.length > 0 && state.selectedEpicIds.size === values.length) {
            state.selectedEpicIds.clear();
            state.epicFilterActive = false;
        }

        writeToUrl();
        update();
        context.renderBoard(state.epicFilterActive);
    }

    function selectAll(checked) {
        state.selectedEpicIds.clear();
        state.epicFilterActive = !checked;
        writeToUrl();
        update();
        context.renderBoard(state.epicFilterActive);
    }

    function render() {
        const values = context.availableEpics();
        epicFilterMenu.replaceChildren();

        const menuHeader = document.createElement('div');
        const menuTitle = document.createElement('span');
        const clearButton = document.createElement('button');
        menuHeader.className = 'epic-filter-menu-head';
        menuTitle.textContent = trans('board.epics_title');
        clearButton.className = 'epic-filter-clear';
        clearButton.type = 'button';
        clearButton.textContent = trans('board.clear_all');
        clearButton.addEventListener('click', event => {
            event.stopPropagation();
            state.selectedEpicIds.clear();
            state.epicFilterActive = false;
            writeToUrl();
            update();
            context.renderBoard(false);
        }, { signal });
        menuHeader.append(menuTitle, clearButton);
        epicFilterMenu.append(menuHeader);

        const allOption = document.createElement('label');
        const allInput = document.createElement('input');
        const allLabel = document.createElement('span');
        const allCount = document.createElement('span');
        allOption.className = 'epic-filter-all-option';
        allOption.setAttribute('role', 'option');
        allOption.tabIndex = 0;
        allInput.type = 'checkbox';
        allInput.tabIndex = -1;
        allLabel.textContent = trans('board.all_active_epics');
        allCount.className = 'epic-count';
        allCount.textContent = values.length;
        allOption.append(allInput, allLabel, allCount);
        allInput.addEventListener('change', () => selectAll(allInput.checked), { signal });
        allOption.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                allInput.click();
            }
        }, { signal });
        epicFilterMenu.append(allOption);

        values.forEach(epic => {
            const id = String(epic.id ?? epic.key);
            const activeCount = (state.data.issues?.issues || [])
                .filter(isActiveIssue)
                .filter(issue => issueBelongsToEpic(issue, id)).length;
            const option = document.createElement('label');
            const input = document.createElement('input');
            const dot = document.createElement('span');
            const label = document.createElement('span');
            const badge = document.createElement('span');

            option.className = 'epic-filter-option';
            option.dataset.epicId = id;
            option.style.setProperty('--epic-color', epicColor(epic));
            option.setAttribute('role', 'option');
            option.tabIndex = 0;
            input.type = 'checkbox';
            input.value = id;
            input.tabIndex = -1;
            dot.className = 'epic-dot';
            label.textContent = epicLabel(epic, trans('board.without_epic'));
            badge.className = 'epic-count';
            badge.textContent = activeCount;
            option.append(input, dot, label, badge);
            input.addEventListener('change', () => selectOne(id, input.checked), { signal });
            option.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    input.click();
                }
            }, { signal });
            epicFilterMenu.append(option);
        });

        if (!values.length) {
            const empty = document.createElement('div');
            empty.className = 'epic-filter-empty';
            empty.textContent = trans('board.no_active_epic');
            epicFilterMenu.append(empty);
        }

        restoreFromUrl();
        update();
    }

    function close() {
        epicFilterMenu.hidden = true;
        epicFilterTrigger.setAttribute('aria-expanded', 'false');
        epicFilter.classList.remove('is-open');
    }

    epicFilterTrigger.addEventListener('click', () => {
        const open = epicFilterMenu.hidden;
        epicFilterMenu.hidden = !open;
        epicFilterTrigger.setAttribute('aria-expanded', String(open));
        epicFilter.classList.toggle('is-open', open);
    }, { signal });
    document.addEventListener('click', event => {
        if (!epicFilter.contains(event.target)) {
            close();
        }
    }, { signal });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const wasOpen = !epicFilterMenu.hidden;
            close();
            if (wasOpen) {
                epicFilterTrigger.focus();
            }
        }
    }, { signal });

    return { render, restoreFromUrl, update, writeToUrl };
}
