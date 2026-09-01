import { Controller } from '@hotwired/stimulus';
import { createIssueDialog } from '../board/dialog/issue-dialog.js';
import { trans } from '../board/i18n.js';
import { issueViewUrl } from '../board/urls.js';

export default class extends Controller {
    static values = {
        homeUrl: String,
        issueKey: String
    };

    connect() {
        this.lifecycleController = new AbortController();
        this.toastTimers = new Set();
        this.isDisconnecting = false;

        const state = {
            commentMentions: [],
            currentUser: null,
            data: null,
            issue: null
        };
        const dialog = this.element.querySelector('#issue-dialog');

        this.issueDialog = createIssueDialog({
            root: this.element,
            state,
            trans,
            standalone: true,
            showToast: (message, type) => this.showToast(message, type),
            jiraIssueUrl: (issueKey, issue) => this.jiraIssueUrl(issueKey, issue),
            renderBoard: () => {},
            closeAfterTransition: false,
            onClose: () => this.leave(),
            onIssueRendered: issue => {
                const url = issueViewUrl(issue.key);

                document.title = `${issue.key} · ${trans('app.title')}`;
                if (url && window.location.pathname !== url) {
                    window.history.replaceState({}, '', url);
                }
            }
        });

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
        this.toastTimers.forEach(timer => window.clearTimeout(timer));
        this.toastTimers.clear();
        this.issueDialog?.destroy();
        this.issueDialog = null;
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
