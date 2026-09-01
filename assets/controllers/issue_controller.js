import { Controller } from '@hotwired/stimulus';
import { api } from '../board/api.js';
import { issueBoardId } from '../board/board-model.js';
import { createIssueDialog } from '../board/dialog/issue-dialog.js';
import { jiraMediaUrl } from '../board/dom.js';
import { trans } from '../board/i18n.js';
import { issueViewUrl } from '../board/urls.js';

export default class extends Controller {
    static values = {
        boardId: Number,
        homeUrl: String,
        issueKey: String
    };

    connect() {
        this.lifecycleController = new AbortController();
        this.toastTimers = new Set();
        this.isDisconnecting = false;
        this.boardRequestController = null;
        this.resolvedBoardId = null;
        this.defaultIconUrl = this.element.querySelector('#issue-board-icon')
            .getAttribute('src');
        this.defaultPageIconUrl = document.querySelector('#page-icon')
            .getAttribute('href');

        const state = {
            commentMentions: [],
            currentUser: null,
            data: null,
            issue: null
        };
        const dialog = this.element.querySelector('#issue-dialog');

        const issueDialogContext = {
            root: this.element,
            state,
            trans,
            standalone: true,
            showToast: (message, type) => this.showToast(message, type),
            jiraIssueUrl: (issueKey, issue) => this.jiraIssueUrl(issueKey, issue),
            renderBoard: () => {},
            boardId: this.boardIdValue || undefined,
            closeAfterTransition: false,
            onClose: () => this.leave(),
            onIssueRendered: issue => {
                const boardId = this.boardIdValue
                    || issueBoardId(issue)
                    || issueDialogContext.boardId;
                const url = issueViewUrl(issue.key, boardId);
                const currentUrl = `${window.location.pathname}${window.location.search}`;

                issueDialogContext.boardId = boardId || undefined;
                document.title = `${issue.key} · ${trans('app.title')}`;
                this.element.querySelector('#issue-page-key').textContent = issue.key;
                if (url && currentUrl !== url) {
                    window.history.replaceState({}, '', url);
                }
                this.updateIssueIcon(issue, boardId);
            }
        };
        this.issueDialog = createIssueDialog(issueDialogContext);

        this.issueDialog.openIssue(this.issueKeyValue).then(opened => {
            const status = this.element.querySelector('#issue-page-status');

            if (opened) {
                status.remove();
                dialog.hidden = false;
            } else {
                status.textContent = trans('dialog.open_error_log');
            }
        });
    }

    disconnect() {
        this.isDisconnecting = true;
        this.lifecycleController.abort();
        this.boardRequestController?.abort();
        this.toastTimers.forEach(timer => window.clearTimeout(timer));
        this.toastTimers.clear();
        this.issueDialog?.destroy();
        this.issueDialog = null;
    }

    async updateIssueIcon(issue, boardId) {
        if (boardId && String(boardId) === this.resolvedBoardId) {
            return;
        }

        this.boardRequestController?.abort();
        const projectIconUrl = this.projectIconUrl(issue);

        if (projectIconUrl) {
            this.setIcon(projectIconUrl);
        } else {
            this.resetIcon();
        }

        if (!boardId) {
            this.resolvedBoardId = null;
            return;
        }

        this.resolvedBoardId = String(boardId);
        this.boardRequestController = new AbortController();
        const { signal } = this.boardRequestController;

        try {
            const board = await api(`/api/jira/board/${boardId}/metadata`, {
                signal
            });
            const iconUrl = board?.location?.avatarURI
                || board?.location?.avatarUrl;

            if (!signal.aborted && iconUrl) {
                this.setIcon(iconUrl);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Unable to load the issue board icon.', error);
            }
        }
    }

    projectIconUrl(issue) {
        const urls = issue.fields?.project?.avatarUrls || {};

        return urls['48x48']
            || urls['32x32']
            || urls['24x24']
            || urls['16x16']
            || Object.values(urls).find(Boolean)
            || null;
    }

    setIcon(iconUrl) {
        if (!iconUrl) {
            return;
        }

        const mediaUrl = jiraMediaUrl(iconUrl);
        const navigationIcon = this.element.querySelector('#issue-board-icon');
        const pageIcon = document.querySelector('#page-icon');

        navigationIcon.onerror = () => {
            this.resetIcon();
        };
        navigationIcon.src = mediaUrl;
        pageIcon.removeAttribute('type');
        pageIcon.href = mediaUrl;
    }

    resetIcon() {
        const navigationIcon = this.element.querySelector('#issue-board-icon');
        const pageIcon = document.querySelector('#page-icon');

        navigationIcon.onerror = null;
        navigationIcon.src = this.defaultIconUrl;
        pageIcon.type = 'image/png';
        pageIcon.href = this.defaultPageIconUrl;
    }

    jiraIssueUrl(issueKey, issue) {
        if (!issueKey) {
            return null;
        }

        try {
            const url = new URL(issue?.self);

            return ['http:', 'https:'].includes(url.protocol)
                ? `${url.origin}/browse/${encodeURIComponent(issueKey)}`
                : null;
        } catch {
            return null;
        }
    }

    showToast(message, type = 'info') {
        const region = this.element.querySelector('#toast-region');
        const toast = document.createElement('div');

        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        region.append(toast);
        window.requestAnimationFrame(() => toast.classList.add('is-visible'));

        const timer = window.setTimeout(() => {
            this.toastTimers.delete(timer);
            toast.remove();
        }, 3380);
        this.toastTimers.add(timer);
    }

    leave() {
        if (this.isDisconnecting) {
            return;
        }

        try {
            const referrer = new URL(document.referrer);

            if (
                referrer.origin === window.location.origin
                && referrer.href !== window.location.href
            ) {
                window.history.back();
                return;
            }
        } catch {
            // A direct visit has no usable referrer.
        }

        window.location.assign(this.homeUrlValue);
    }
}
