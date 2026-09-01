// This module owns dialog orchestration and lifecycle; sibling modules own rendering and forms.
import { api } from '../api.js';
import { jiraMediaUrl } from '../dom.js';
import { createIssueView } from '../issue-view.js';
import { adfMentions, adfToText } from '../jira.js';
import { createMultiSelect } from '../multi-select.js';
import { issueViewUrl } from '../urls.js';
import { openCommentEditor, removeComment, renderComments, replyToComment } from './comments.js';
import { createIssueForms } from './forms.js';
import { createMentionMenu } from './mentions.js';
import { createTimeoutScheduler } from './timers.js';

export function createIssueDialog(context) {
    const { root, state, showToast, jiraIssueUrl, renderBoard, trans } = context;
    const lifecycleController = new AbortController();
    const { signal } = lifecycleController;
    const dialog = root.querySelector('#issue-dialog');
    const isStandalone = context.standalone === true;
    const transitionElement = root.querySelector('#transition-picker');
    const selectedTransitionIds = new Set();
    const labels = { all: trans('dialog.choose_status'), title: trans('dialog.new_status'), clear: '', empty: trans('dialog.no_transition'), selected: () => '' };
    let issueRequestController = null;
    let restoreFocusElement = null;
    const { clear: clearTimers, schedule: scheduleTimeout } = createTimeoutScheduler();
    const forms = createIssueForms({ root, state, api, adfToText, showToast, trans, signal });
    const mentions = createMentionMenu({
        api, commentInput: forms.commentInput, menu: root.querySelector('#mention-menu'),
        state, trans, scheduleTimeout, closeEmojiMenu: forms.closeEmojiMenu,
        onSubmit: () => root.querySelector('#comment-form').requestSubmit(), signal
    });
    const view = createIssueView({ root, state, openIssue, trans, signal });
    const transitionPicker = createMultiSelect({
        container: transitionElement, labels, selected: selectedTransitionIds, multiple: false,
        onChange: () => applyTransition([...selectedTransitionIds][0]), signal
    });
    forms.bind({ closeMentionMenu: mentions.close, refreshCurrentIssue, refreshIssueComments, renderEditableFields: view.renderEditableFields });

    function renderIssueComments(response, embeddedComments = null) {
        const container = root.querySelector('#issue-comments-list');
        const comments = Array.isArray(response?.comments) ? response.comments : (embeddedComments?.comments || []);
        if (response && Object.hasOwn(response, 'currentUser')) { state.currentUser = response.currentUser; }
        if (!comments.length) {
            container.replaceChildren();
            container.textContent = response?.unavailable ? trans('dialog.comments_unavailable') : trans('dialog.no_comments');
            return;
        }
        renderComments({
            container, comments, currentUser: state.currentUser, locale: document.documentElement.lang,
            trans, renderRichText: view.renderRichText,
            onReply: comment => replyToComment({ comment, commentInput: forms.commentInput, replyContext: forms.replyContext, mergeMention: mentions.merge, trans }),
            onEdit: (article, body, comment) => {
                if (!state.issue) { return; }
                openCommentEditor({ article, body, comment, issueKey: state.issue.key, api, adfToText, adfMentions, refresh: refreshIssueComments, setFormBusy: forms.setFormBusy, showToast, trans });
            },
            onDelete: deleteComment
        });
    }

    async function refreshIssueComments() {
        if (!state.issue) { return; }
        const comments = await api(`/api/jira/issue/${encodeURIComponent(state.issue.key)}/comments`);
        renderIssueComments(comments);
    }

    async function deleteComment(comment, button) {
        if (!state.issue) { return; }
        await removeComment({ api, comment, button, issueKey: state.issue.key, refresh: refreshIssueComments, showToast, trans });
    }

    function renderIssueDetails(issue) {
        const fields = issue.fields || {};
        const typeIcon = root.querySelector('#issue-type-icon');
        state.issue = issue;
        const issueKey = root.querySelector('#issue-key');
        issueKey.textContent = issue.key;
        issueKey.href = issueViewUrl(issue.key, context.boardId);
        forms.summaryElement.textContent = fields.summary || issue.key;
        forms.summaryInput.value = fields.summary || '';
        forms.descriptionInput.value = adfToText(fields.description).trim();
        if (fields.issuetype?.iconUrl) {
            typeIcon.src = jiraMediaUrl(fields.issuetype.iconUrl);
            typeIcon.hidden = false;
        } else {
            typeIcon.removeAttribute('src');
            typeIcon.hidden = true;
        }
        view.renderIssueFieldGroups(issue);
        view.renderTimeTracking(issue);
        view.renderIssueDescription(fields.description);
        view.renderIssueLinks(issue);
        view.renderIssueAttachments(issue);
        const boardIssue = (state.data?.issues?.issues || []).find(candidate => candidate.key === issue.key);
        if (boardIssue) { boardIssue.fields = { ...boardIssue.fields, ...issue.fields }; }
        context.onIssueRendered?.(issue);
    }

    async function refreshCurrentIssue() {
        if (!state.issue) { return null; }
        const issue = await api(`/api/jira/issue/${encodeURIComponent(state.issue.key)}`);
        renderIssueDetails(issue);
        return issue;
    }

    async function openIssue(issueKey) {
        issueRequestController?.abort();
        issueRequestController = new AbortController();
        const { signal: requestSignal } = issueRequestController;
        try {
            const key = encodeURIComponent(issueKey);
            const [issue, transitions, comments] = await Promise.all([
                api(`/api/jira/issue/${key}`, { signal: requestSignal }),
                api(`/api/jira/issue/${key}/transitions`, { signal: requestSignal }),
                api(`/api/jira/issue/${key}/comments`, { signal: requestSignal }).catch(() => ({ unavailable: true }))
            ]);
            if (requestSignal.aborted) { return; }
            const url = jiraIssueUrl(issue.key, issue);
            const link = root.querySelector('#open-issue');
            if (url) { link.href = url; } else { link.removeAttribute('href'); }
            link.toggleAttribute('aria-disabled', !url);
            renderIssueDetails(issue);
            forms.resetIssueEditors(issue, mentions.close);
            root.querySelectorAll('[data-issue-accordion]').forEach(accordion => { accordion.open = false; });
            renderIssueComments(comments, issue.fields?.comment);
            labels.all = issue.fields?.status?.name ? trans('dialog.current_status', { status: issue.fields.status.name }) : trans('dialog.choose_status');
            selectedTransitionIds.clear();
            transitionPicker.setOptions((transitions.transitions || []).map(item => ({ id: String(item.id), name: item.name || item.to?.name || String(item.id) })));
            if (isStandalone) {
                ['.issue-dialog-main', '.issue-sidebar', '.issue-dialog-layout'].forEach(selector => { root.querySelector(selector).scrollTop = 0; });
            } else if (!dialog.open) {
                restoreFocusElement = document.activeElement instanceof HTMLElement
                    ? document.activeElement : null;
                dialog.showModal();
            } else {
                ['.issue-dialog-main', '.issue-sidebar', '.issue-dialog-layout'].forEach(selector => { root.querySelector(selector).scrollTop = 0; });
            }
            return true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(trans('dialog.open_error_log'), error);
                showToast(error.message, 'error');
            }
            return false;
        }
    }

    async function applyTransition(transitionId) {
        if (!state.issue || !transitionId) { return; }
        const trigger = transitionElement.querySelector('.filter-trigger');
        trigger.disabled = true;
        try {
            const updatedIssue = await api(`/api/jira/issue/${encodeURIComponent(state.issue.key)}/transition`, { method: 'POST', body: JSON.stringify({ transitionId, boardId: context.boardId }) });
            renderIssueDetails(updatedIssue);
            renderBoard(false);
            if (context.closeAfterTransition === false) {
                await openIssue(updatedIssue.key);
            } else {
                closeIssue();
            }
            showToast(trans('dialog.status_updated'), 'success');
        } catch (error) {
            console.error(trans('dialog.transition_error_log'), error);
            showToast(error.message, 'error');
        } finally {
            selectedTransitionIds.clear();
            transitionPicker.update();
            trigger.disabled = false;
        }
    }

    function closeIssue() {
        if (isStandalone) {
            context.onClose?.();
        } else {
            dialog.close();
        }
    }

    root.querySelector('#close-dialog')?.addEventListener('click', closeIssue, { signal });
    if (!isStandalone) {
        dialog.addEventListener('close', () => {
            const element = restoreFocusElement;
            restoreFocusElement = null;
            window.requestAnimationFrame(() => {
                if (element?.isConnected) { element.focus(); }
            });
        }, { signal });
    }
    return {
        openIssue,
        destroy() {
            lifecycleController.abort();
            issueRequestController?.abort();
            clearTimers();
            if (!isStandalone && dialog.open) { dialog.close(); }
        }
    };
}
