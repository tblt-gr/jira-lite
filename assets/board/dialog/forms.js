import { COMMENT_EMOJIS, renderEmojiMenu } from './emojis.js';

// This module owns issue edit forms; issue-dialog.js supplies refresh and rendering callbacks.
export function createIssueForms({ root, state, api, adfToText, showToast, trans, signal }) {
    const summaryElement = root.querySelector('#issue-summary');
    const summaryForm = root.querySelector('#summary-form');
    const summaryInput = root.querySelector('#summary-input');
    const descriptionForm = root.querySelector('#description-form');
    const descriptionInput = root.querySelector('#description-input');
    const fieldsForm = root.querySelector('#fields-form');
    const commentForm = root.querySelector('#comment-form');
    const commentInput = root.querySelector('#comment-input');
    const replyContext = root.querySelector('#comment-reply-context');
    const worklogForm = root.querySelector('#worklog-form');
    const emojiPicker = root.querySelector('#emoji-picker');
    const emojiPickerTrigger = root.querySelector('#emoji-picker-trigger');
    const emojiMenu = root.querySelector('#emoji-menu');

    function setFormBusy(form, busy) {
        form.querySelectorAll('button, input, textarea, select').forEach(control => { control.disabled = busy; });
        form.setAttribute('aria-busy', String(busy));
    }

    function toggleEditor(name, visible) {
        const configurations = {
            summary: { form: summaryForm, preview: summaryElement, trigger: root.querySelector('#edit-summary'), confirmTrigger: root.querySelector('#confirm-summary'), focus: summaryInput },
            description: { form: descriptionForm, preview: root.querySelector('#issue-description'), trigger: root.querySelector('#edit-description'), confirmTrigger: root.querySelector('#confirm-description'), focus: descriptionInput },
            fields: { form: fieldsForm, preview: root.querySelector('#editable-fields-preview'), trigger: root.querySelector('#edit-fields'), focus: root.querySelector('#labels-input') },
            worklog: { form: worklogForm, preview: root.querySelector('.time-tracking-summary'), trigger: root.querySelector('#toggle-worklog'), focus: root.querySelector('#worklog-time') }
        };
        const editor = configurations[name];
        if (!editor) { return; }
        editor.form.hidden = !visible;
        editor.preview.hidden = visible;
        editor.trigger.hidden = visible;
        if (editor.confirmTrigger) { editor.confirmTrigger.hidden = !visible; }
        if (visible) { editor.focus.focus(); }
    }

    function closeEmojiMenu() {
        emojiMenu.hidden = true;
        emojiPickerTrigger.setAttribute('aria-expanded', 'false');
    }

    function resetIssueEditors(issue, closeMentionMenu) {
        summaryInput.value = issue.fields?.summary || '';
        descriptionInput.value = adfToText(issue.fields?.description).trim();
        commentInput.value = '';
        state.commentMentions = [];
        replyContext.hidden = true;
        replyContext.removeAttribute('data-account-id');
        closeMentionMenu();
        closeEmojiMenu();
        root.querySelector('#worklog-time').value = '';
        root.querySelector('#worklog-comment').value = '';
        ['summary', 'description', 'fields', 'worklog'].forEach(name => toggleEditor(name, false));
    }

    function bind({ closeMentionMenu, refreshCurrentIssue, refreshIssueComments, renderEditableFields }) {
        const submitIssueUpdate = async (form, fields, editor) => {
            if (!state.issue) { return; }
            setFormBusy(form, true);
            try {
                await api(`/issue/${encodeURIComponent(state.issue.key)}`, { method: 'PATCH', body: JSON.stringify(fields) });
                await refreshCurrentIssue();
                toggleEditor(editor, false);
                showToast(trans('dialog.issue_updated'), 'success');
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                setFormBusy(form, false);
            }
        };
        const submitComment = async event => {
            event.preventDefault();
            const comment = commentInput.value.trim();
            const mentions = state.commentMentions.filter(mention => comment.includes(mention.text));
            if (!state.issue || !comment) { return; }
            setFormBusy(commentForm, true);
            try {
                await api(`/issue/${encodeURIComponent(state.issue.key)}/comments`, { method: 'POST', body: JSON.stringify({ comment, mentions }) });
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
        };
        const submitWorklog = async event => {
            event.preventDefault();
            if (!state.issue) { return; }
            const timeSpent = root.querySelector('#worklog-time').value.trim();
            const comment = root.querySelector('#worklog-comment').value.trim();
            if (!timeSpent) { return; }
            setFormBusy(worklogForm, true);
            try {
                await api(`/issue/${encodeURIComponent(state.issue.key)}/worklogs`, { method: 'POST', body: JSON.stringify({ timeSpent, comment }) });
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
        };
        root.querySelector('#edit-summary').addEventListener('click', () => toggleEditor('summary', true), { signal });
        root.querySelector('#edit-description').addEventListener('click', () => toggleEditor('description', true), { signal });
        root.querySelector('#edit-fields').addEventListener('click', () => toggleEditor('fields', true), { signal });
        root.querySelector('#toggle-worklog').addEventListener('click', () => toggleEditor('worklog', true), { signal });
        root.querySelectorAll('[data-cancel-edit]').forEach(button => button.addEventListener('click', () => {
            if (state.issue) { resetIssueEditors(state.issue, closeMentionMenu); renderEditableFields(state.issue); }
            toggleEditor(button.dataset.cancelEdit, false);
        }, { signal }));
        summaryForm.addEventListener('submit', event => { event.preventDefault(); submitIssueUpdate(summaryForm, { summary: summaryInput.value.trim() }, 'summary'); }, { signal });
        descriptionForm.addEventListener('submit', event => { event.preventDefault(); submitIssueUpdate(descriptionForm, { description: descriptionInput.value.trim() }, 'description'); }, { signal });
        fieldsForm.addEventListener('submit', event => {
            event.preventDefault();
            submitIssueUpdate(fieldsForm, {
                labels: root.querySelector('#labels-input').value.split(',').map(label => label.trim()).filter(Boolean),
                dueDate: root.querySelector('#due-date-input').value,
                originalEstimate: root.querySelector('#original-estimate-input').value.trim(),
                remainingEstimate: root.querySelector('#remaining-estimate-input').value.trim()
            }, 'fields');
        }, { signal });
        commentForm.addEventListener('submit', submitComment, { signal });
        worklogForm.addEventListener('submit', submitWorklog, { signal });
        renderEmojiMenu({ menu: emojiMenu, emojis: COMMENT_EMOJIS, trans, onSelect: emoji => {
            const start = commentInput.selectionStart ?? commentInput.value.length;
            const end = commentInput.selectionEnd ?? start;
            commentInput.value = commentInput.value.slice(0, start) + emoji + commentInput.value.slice(end);
            closeEmojiMenu();
            commentInput.focus();
            commentInput.setSelectionRange(start + emoji.length, start + emoji.length);
        } });
        emojiPickerTrigger.addEventListener('click', event => {
            event.stopPropagation();
            const open = emojiMenu.hidden;
            closeMentionMenu();
            emojiMenu.hidden = !open;
            emojiPickerTrigger.setAttribute('aria-expanded', String(open));
        }, { signal });
        root.querySelector('#cancel-reply').addEventListener('click', () => {
            const accountId = replyContext.dataset.accountId;
            const mention = state.commentMentions.find(candidate => candidate.accountId === accountId);
            if (mention && commentInput.value.startsWith(`${mention.text} `)) { commentInput.value = commentInput.value.slice(mention.text.length + 1); }
            state.commentMentions = state.commentMentions.filter(candidate => candidate.accountId !== accountId);
            replyContext.hidden = true;
            replyContext.removeAttribute('data-account-id');
            commentInput.focus();
        }, { signal });
        document.addEventListener('click', event => { if (!emojiPicker.contains(event.target)) { closeEmojiMenu(); } }, { signal });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeEmojiMenu(); } }, { signal });
    }

    return { summaryElement, summaryInput, descriptionInput, commentInput, replyContext, setFormBusy, toggleEditor, resetIssueEditors, closeEmojiMenu, bind };
}
