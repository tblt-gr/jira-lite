import { createFavoriteButton, favoritesFirst } from '../favorites.js';
import { jiraMediaUrl } from './dom.js';
import { trans } from './i18n.js';
import { createMultiSelect } from './multi-select.js';

// This module owns board chrome: identity, switcher, Jira links, toasts and their timers.
export function createBoardShell({ root, boardId, state, signal }) {
    const toastTimers = new Set();
    const toastFrames = new Set();
    const toastRegion = root.querySelector('#toast-region');
    const pageIcon = document.querySelector('#page-icon');
    const boardIcon = root.querySelector('#board-icon');
    const boardSwitcherNative = root.querySelector('#board-switcher-native');
    const boardNameLabel = root.querySelector('#board-name');
    let boardSwitcher = null;
    let boardOptions = [];

    function schedule(callback, delay) {
        const timer = window.setTimeout(() => {
            toastTimers.delete(timer);
            callback();
        }, delay);
        toastTimers.add(timer);

        return timer;
    }

    function renderBoardOptions() {
        boardSwitcher?.setOptions(
            favoritesFirst(boardOptions, option => option.id)
                .map(({ id, name }) => ({ id, name }))
        );
    }

    function setBoardName(name) {
        if (boardNameLabel) {
            boardNameLabel.textContent = name;
        }

        boardOptions = boardOptions.map(option =>
            option.id === String(boardId) ? { ...option, name } : option
        );
        renderBoardOptions();
    }

    function isSameMedia(current, next) {
        try {
            const from = new URL(current, window.location.origin);
            const to = new URL(next, window.location.origin);

            return from.pathname === to.pathname
                && from.searchParams.get('url') === to.searchParams.get('url');
        } catch {
            return false;
        }
    }

    function updatePageIcon(boardData) {
        const iconUrl = boardData?.location?.avatarURI
            || boardData?.location?.avatarUrl;

        if (!iconUrl) {
            return;
        }

        const mediaUrl = jiraMediaUrl(iconUrl);

        if (pageIcon && !isSameMedia(pageIcon.getAttribute('href'), mediaUrl)) {
            pageIcon.removeAttribute('type');
            pageIcon.href = mediaUrl;
        }

        if (boardIcon && !isSameMedia(boardIcon.getAttribute('src'), mediaUrl)) {
            boardIcon.onerror = () => {
                boardIcon.onerror = null;
                boardIcon.src = '/images/favicon.png';
            };
            boardIcon.src = mediaUrl;
        }
    }

    function jiraIssueUrl(issueKey, issue = null) {
        if (!issueKey) {
            return null;
        }

        const sources = [issue?.self, state.data?.board?.self, state.data?.epics?.self];

        for (const source of sources) {
            try {
                const url = new URL(source);

                if (['http:', 'https:'].includes(url.protocol)) {
                    return `${url.origin}/browse/${encodeURIComponent(issueKey)}`;
                }
            } catch {
                // Try the next Jira URL available in the snapshot.
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

            if (!signal.aborted) {
                toast.classList.add('is-visible');
            }
        });
        toastFrames.add(frame);
        schedule(() => {
            toast.classList.remove('is-visible');
            schedule(() => toast.remove(), 180);
        }, 3200);
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
                const target = boardOptions.find(
                    option => option.id === selectedId
                )?.url;

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
                onToggle: renderBoardOptions,
                signal
            }),
            signal
        });
        renderBoardOptions();
    }

    return {
        jiraIssueUrl,
        mountBoardSwitcher,
        schedule,
        setBoardName,
        showToast,
        updatePageIcon,
        destroy() {
            toastTimers.forEach(timer => window.clearTimeout(timer));
            toastTimers.clear();
            toastFrames.forEach(frame => window.cancelAnimationFrame(frame));
            toastFrames.clear();
        }
    };
}
