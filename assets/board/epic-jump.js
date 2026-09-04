// This module owns letter-key jumping to the first matching epic group.
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const CARD_SELECTOR = '.card';
const FILTER_TARGET_SELECTOR = [
    '#epic-filter',
    '#assignee-filter',
    '#column-filter',
    '#type-filter',
    '#version-filter',
    '.filter-multiselect',
    '.epic-multiselect'
].join(', ');
const FILTER_MENU_SELECTOR = '#epic-filter-menu, .filter-menu';

export function epicTitleStartsWith(title, letter) {
    const trimmed = String(title || '').trim();
    const typed = String(letter || '');

    if (!trimmed || typed.length !== 1) {
        return false;
    }

    const first = [...trimmed][0];

    return first.localeCompare(typed, undefined, { sensitivity: 'base' }) === 0;
}

export function findFirstEpicGroup(groups, letter) {
    return groups.find(group => epicTitleStartsWith(group.title, letter)) || null;
}

export function isJumpLetter(key) {
    return typeof key === 'string' && key.length === 1 && /\p{L}/u.test(key);
}

function matchesSelector(target, selector) {
    return Boolean(target?.closest?.(selector));
}

export function isEditableTarget(target) {
    return matchesSelector(target, EDITABLE_SELECTOR);
}

export function isOpenDialog(root, selector) {
    return Boolean(root?.querySelector?.(selector)?.open);
}

export function isOpenFilter(root) {
    return Array.from(root?.querySelectorAll?.(FILTER_MENU_SELECTOR) || [])
        .some(menu => !menu.hidden);
}

export function shouldHandleEpicJumpKey(event, context = {}) {
    if (event.defaultPrevented) {
        return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
        return false;
    }

    if (context.view !== 'epic' || !isJumpLetter(event.key)) {
        return false;
    }

    if (
        isEditableTarget(event.target)
        || matchesSelector(event.target, CARD_SELECTOR)
        || matchesSelector(event.target, FILTER_TARGET_SELECTOR)
        || context.isIssueOpen
        || context.isCreateOpen
        || context.isImageViewerOpen
        || context.isFilterOpen
    ) {
        return false;
    }

    return true;
}

export function collectEpicGroups(board) {
    return Array.from(board.querySelectorAll('.board-group'), group => ({
        element: group,
        title: group.querySelector('.board-group-title')?.textContent || ''
    }));
}

export function scrollBoardToEpic(board, group) {
    const boardBounds = board.getBoundingClientRect();
    const groupBounds = group.getBoundingClientRect();

    board.scrollTo({
        top: Math.max(0, board.scrollTop + groupBounds.top - boardBounds.top),
        left: board.scrollLeft,
        behavior: 'smooth'
    });
}

export function createEpicJump({
    board,
    root,
    state,
    signal,
    listenOn = typeof document === 'undefined' ? null : document
}) {
    listenOn?.addEventListener('keydown', event => {
        if (!shouldHandleEpicJumpKey(event, {
            view: state.view,
            isIssueOpen: isOpenDialog(root, '#issue-dialog'),
            isCreateOpen: isOpenDialog(root, '#create-issue-dialog'),
            isImageViewerOpen: isOpenDialog(root, '#image-viewer'),
            isFilterOpen: isOpenFilter(root)
        })) {
            return;
        }

        const match = findFirstEpicGroup(collectEpicGroups(board), event.key);

        if (!match) {
            return;
        }

        event.preventDefault();
        scrollBoardToEpic(board, match.element);
    }, { signal });
}
