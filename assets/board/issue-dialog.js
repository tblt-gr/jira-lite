import { api } from './api.js';
import { renderComments } from './dialog/comments.js';
import { COMMENT_EMOJIS, renderEmojiMenu } from './dialog/emojis.js';
import { createTimeoutScheduler } from './dialog/timers.js';
import {
    createImage,
    jiraMediaUrl
} from './dom.js';
import { createIssueView } from './issue-view.js';
import { createMultiSelect } from './multi-select.js';
import {
    adfMentions,
    adfToText
} from './jira.js';

export function createIssueDialog(context) {
    const { root, state, showToast, jiraIssueUrl, renderBoard, trans } = context;
    const lifecycleController = new AbortController();
    const listenerOptions = { signal: lifecycleController.signal };
    const dialog = root.querySelector('#issue-dialog');
    const transitionPickerElement = root.querySelector('#transition-picker');
    const summaryElement = root.querySelector('#issue-summary');
    const summaryForm = root.querySelector('#summary-form');
    const summaryInput = root.querySelector('#summary-input');
    const descriptionElement = root.querySelector('#issue-description');
    const descriptionForm = root.querySelector('#description-form');
    const descriptionInput = root.querySelector('#description-input');
    const fieldsForm = root.querySelector('#fields-form');
    const commentForm = root.querySelector('#comment-form');
    const commentInput = root.querySelector('#comment-input');
    const mentionMenu = root.querySelector('#mention-menu');
    const emojiPicker = root.querySelector('#emoji-picker');
    const emojiPickerTrigger = root.querySelector('#emoji-picker-trigger');
    const emojiMenu = root.querySelector('#emoji-menu');
    const replyContext = root.querySelector('#comment-reply-context');
    const worklogForm = root.querySelector('#worklog-form');
    const selectedTransitionIds = new Set();
    const transitionLabels = {
        all: trans('dialog.choose_status'),
        title: trans('dialog.new_status'),
        clear: '',
        empty: trans('dialog.no_transition'),
        selected: () => ''
    };
    let mentionSearchTimer = null;
    let mentionRequestToken = 0;
    let activeMentionRange = null;
    let issueRequestController = null;
    const { clear: clearTimers, schedule: scheduleTimeout } =
        createTimeoutScheduler();

    const {
        renderEditableFields,
        renderIssueAttachments,
        renderIssueDescription,
        renderIssueFieldGroups,
        renderIssueLinks,
        renderRichText,
        renderTimeTracking
    } = createIssueView({
        root,
        state,
        openIssue,
        trans,
        signal: lifecycleController.signal
    });
    const transitionPicker = createMultiSelect({
        container: transitionPickerElement,
        labels: transitionLabels,
        selected: selectedTransitionIds,
        multiple: false,
        onChange: () => {
            const [transitionId] = selectedTransitionIds;

            if (transitionId) {
                applyTransition(transitionId);
            }
        },
        signal: lifecycleController.signal
    });

    function renderIssueComments(response, embeddedComments = null) {
        const container = root.querySelector('#issue-comments-list');
        const comments = Array.isArray(response?.comments)
            ? response.comments
            : (embeddedComments?.comments || []);

        if (response && Object.hasOwn(response, 'currentUser')) {
            state.currentUser = response.currentUser;
        }

        if (!comments.length) {
            container.replaceChildren();
            container.textContent = response?.unavailable
                ? trans('dialog.comments_unavailable')
                : trans('dialog.no_comments');
            return;
        }

        renderComments({
            container,
            comments,
            currentUser: state.currentUser,
            locale: document.documentElement.lang,
            trans,
            renderRichText,
            onReply: replyToComment,
            onEdit: openCommentEditor,
            onDelete: deleteComment
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
            trans('dialog.delete_comment_confirm')
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
            showToast(trans('dialog.comment_deleted'), 'success');
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
        root.querySelector('#comment-reply-label').textContent = trans(
            'dialog.reply_to',
            { name: displayName }
        );
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
        save.className = 'primary-button';
        save.textContent = trans('common.save');
        cancel.type = 'button';
        cancel.className = 'secondary-button';
        cancel.textContent = trans('common.cancel');
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
                showToast(trans('dialog.comment_updated'), 'success');
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

    function closeEmojiMenu() {
        emojiMenu.hidden = true;
        emojiPickerTrigger.setAttribute('aria-expanded', 'false');
    }

    function insertCommentEmoji(emoji) {
        const start = commentInput.selectionStart ?? commentInput.value.length;
        const end = commentInput.selectionEnd ?? start;
        const value = commentInput.value;

        commentInput.value = value.slice(0, start)
            + emoji
            + value.slice(end);
        const caret = start + emoji.length;

        closeEmojiMenu();
        commentInput.focus();
        commentInput.setSelectionRange(caret, caret);
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
            empty.textContent = trans('dialog.no_user');
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
        closeEmojiMenu();
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

        mentionSearchTimer = scheduleTimeout(async () => {
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
                trigger: root.querySelector('#edit-summary'),
                confirmTrigger: root.querySelector('#confirm-summary'),
                focus: summaryInput
            },
            description: {
                form: descriptionForm,
                preview: descriptionElement,
                trigger: root.querySelector('#edit-description'),
                confirmTrigger: root.querySelector('#confirm-description'),
                focus: descriptionInput
            },
            fields: {
                form: fieldsForm,
                preview: root.querySelector('#editable-fields-preview'),
                trigger: root.querySelector('#edit-fields'),
                focus: root.querySelector('#labels-input')
            },
            worklog: {
                form: worklogForm,
                preview: root.querySelector('.time-tracking-summary'),
                trigger: root.querySelector('#toggle-worklog'),
                focus: root.querySelector('#worklog-time')
            }
        };
        const editor = configurations[name];

        if (!editor) {
            return;
        }

        editor.form.hidden = !visible;
        editor.preview.hidden = visible;
        editor.trigger.hidden = visible;

        if (editor.confirmTrigger) {
            editor.confirmTrigger.hidden = !visible;
        }

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
        closeEmojiMenu();
        root.querySelector('#worklog-time').value = '';
        root.querySelector('#worklog-comment').value = '';
        ['summary', 'description', 'fields', 'worklog']
            .forEach(name => toggleEditor(name, false));
    }

    function resetIssueAccordions() {
        root.querySelectorAll('[data-issue-accordion]').forEach(accordion => {
            accordion.open = false;
        });
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
        const typeIcon = root.querySelector('#issue-type-icon');

        state.issue = issue;
        root.querySelector('#issue-key').textContent = issue.key;
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

        renderIssueFieldGroups(issue);
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
            showToast(trans('dialog.issue_updated'), 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setFormBusy(form, false);
        }
    }

    async function openIssue(issueKey) {
        issueRequestController?.abort();
        issueRequestController = new AbortController();
        const { signal } = issueRequestController;

        try {
            const encodedIssueKey = encodeURIComponent(issueKey);
            const [issue, transitions, comments] = await Promise.all([
                api(`/api/jira/issue/${encodedIssueKey}`, { signal }),
                api(`/api/jira/issue/${encodedIssueKey}/transitions`, {
                    signal
                }),
                api(`/api/jira/issue/${encodedIssueKey}/comments`, { signal })
                    .catch(() => ({ unavailable: true }))
            ]);

            if (signal.aborted) {
                return;
            }

            const issueUrl = jiraIssueUrl(issue.key, issue);
            const openIssueLink = root.querySelector('#open-issue');

            if (issueUrl) {
                openIssueLink.href = issueUrl;
            } else {
                openIssueLink.removeAttribute('href');
            }

            openIssueLink.toggleAttribute('aria-disabled', !issueUrl);

            renderIssueDetails(issue);
            resetIssueEditors(issue);
            resetIssueAccordions();
            renderIssueComments(comments, issue.fields?.comment);

            transitionLabels.all = issue.fields?.status?.name
                ? trans('dialog.current_status', {
                    status: issue.fields.status.name
                })
                : trans('dialog.choose_status');
            selectedTransitionIds.clear();
            transitionPicker.setOptions(
                (transitions.transitions || []).map(item => ({
                    id: String(item.id),
                    name: item.name || item.to?.name || String(item.id)
                }))
            );

            if (!dialog.open) {
                dialog.showModal();
            } else {
                dialog.querySelector('.issue-dialog-main').scrollTop = 0;
                dialog.querySelector('.issue-sidebar').scrollTop = 0;
                dialog.querySelector('.issue-dialog-layout').scrollTop = 0;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(trans('dialog.open_error_log'), error);
                showToast(error.message, 'error');
            }
        }
    }

    async function applyTransition(transitionId) {
        if (!state.issue || !transitionId) {
            return;
        }

        const trigger = transitionPickerElement.querySelector('.filter-trigger');

        trigger.disabled = true;

        try {
            const updatedIssue = await api(
                `/api/jira/issue/${encodeURIComponent(state.issue.key)}/transition`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        transitionId,
                        boardId: context.boardId
                    })
                }
            );

            renderIssueDetails(updatedIssue);
            renderBoard(false);
            dialog.close();
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
            closeEmojiMenu();
            await refreshIssueComments();
            showToast(trans('dialog.comment_added'), 'success');
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

        const timeSpent = root.querySelector('#worklog-time')
            .value.trim();
        const comment = root.querySelector('#worklog-comment')
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
            root.querySelector('#worklog-time').value = '';
            root.querySelector('#worklog-comment').value = '';
            await refreshCurrentIssue();
            toggleEditor('worklog', false);
            showToast(trans('dialog.work_logged'), 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setFormBusy(worklogForm, false);
        }
    }

    function submitEditableFields(event) {
        event.preventDefault();

        const labels = root.querySelector('#labels-input').value
            .split(',')
            .map(label => label.trim())
            .filter(Boolean);

        submitIssueUpdate(fieldsForm, {
            labels,
            dueDate: root.querySelector('#due-date-input').value,
            originalEstimate: root.querySelector(
                '#original-estimate-input'
            ).value.trim(),
            remainingEstimate: root.querySelector(
                '#remaining-estimate-input'
            ).value.trim()
        }, 'fields');
    }


    root.querySelector('#close-dialog')
        .addEventListener('click', () => dialog.close(), listenerOptions);
    root.querySelector('#edit-summary').addEventListener(
        'click',
        () => toggleEditor('summary', true),
        listenerOptions
    );
    root.querySelector('#edit-description').addEventListener(
        'click',
        () => toggleEditor('description', true),
        listenerOptions
    );
    root.querySelector('#edit-fields').addEventListener(
        'click',
        () => toggleEditor('fields', true),
        listenerOptions
    );
    root.querySelector('#toggle-worklog').addEventListener(
        'click',
        () => toggleEditor('worklog', true),
        listenerOptions
    );
    root.querySelectorAll('[data-cancel-edit]').forEach(button => {
        button.addEventListener('click', () => {
            const editor = button.dataset.cancelEdit;

            if (state.issue) {
                resetIssueEditors(state.issue);
                renderEditableFields(state.issue);
            }

            toggleEditor(editor, false);
        }, listenerOptions);
    });
    summaryForm.addEventListener('submit', event => {
        event.preventDefault();
        submitIssueUpdate(summaryForm, {
            summary: summaryInput.value.trim()
        }, 'summary');
    }, listenerOptions);
    descriptionForm.addEventListener('submit', event => {
        event.preventDefault();
        submitIssueUpdate(descriptionForm, {
            description: descriptionInput.value.trim()
        }, 'description');
    }, listenerOptions);
    fieldsForm.addEventListener('submit', submitEditableFields, listenerOptions);
    commentForm.addEventListener('submit', submitComment, listenerOptions);
    worklogForm.addEventListener('submit', submitWorklog, listenerOptions);
    renderEmojiMenu({
        menu: emojiMenu,
        emojis: COMMENT_EMOJIS,
        trans,
        onSelect: insertCommentEmoji
    });
    emojiPickerTrigger.addEventListener('click', event => {
        event.stopPropagation();
        const open = emojiMenu.hidden;

        closeMentionMenu();
        emojiMenu.hidden = !open;
        emojiPickerTrigger.setAttribute('aria-expanded', String(open));
    }, listenerOptions);
    root.querySelector('#cancel-reply').addEventListener('click', () => {
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
    }, listenerOptions);
    commentInput.addEventListener(
        'input',
        scheduleMentionSearch,
        listenerOptions
    );
    commentInput.addEventListener('blur', () => {
        scheduleTimeout(closeMentionMenu, 140);
    }, listenerOptions);
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
    }, listenerOptions);

    function handleDocumentClick(event) {
        if (!emojiPicker.contains(event.target)) {
            closeEmojiMenu();
        }
    }

    function handleDocumentKeydown(event) {
        if (event.key === 'Escape') {
            closeEmojiMenu();
        }
    }

    document.addEventListener('click', handleDocumentClick, listenerOptions);
    document.addEventListener(
        'keydown',
        handleDocumentKeydown,
        listenerOptions
    );

    return {
        openIssue,
        destroy() {
            lifecycleController.abort();
            issueRequestController?.abort();
            clearTimers();
            dialog.close();
        }
    };
}
