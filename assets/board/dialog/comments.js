import { createAvatar } from '../dom.js';

// This module owns comment rendering and mutations; issue-dialog.js supplies state and callbacks.
export function formatCommentDate(value, locale) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

export function renderComments({
    container,
    comments,
    currentUser,
    locale,
    trans,
    renderRichText,
    readOnly = false,
    onReply,
    onEdit,
    onDelete
}) {
    container.replaceChildren();

    comments.forEach(comment => {
        const article = document.createElement('article');
        const header = document.createElement('header');
        const author = document.createElement('div');
        const authorName = document.createElement('strong');
        const date = document.createElement('time');
        const actions = document.createElement('div');
        const body = document.createElement('div');
        const avatar = createAvatar(
            comment.author,
            32,
            'issue-comment-avatar'
        );

        article.className = 'issue-comment';
        author.className = 'issue-comment-author';
        actions.className = 'issue-comment-actions';
        authorName.textContent =
            comment.author?.displayName || trans('common.anonymous');
        date.textContent = formatCommentDate(
            comment.updated || comment.created,
            locale
        );
        if (comment.updated && comment.created && comment.updated !== comment.created) {
            date.textContent += ` · ${trans('dialog.edited')}`;
        }
        date.dateTime = comment.updated || comment.created || '';
        body.className = 'issue-comment-body';

        if (avatar) {
            header.append(avatar);
        }

        author.append(authorName, date);
        header.append(author, actions);

        if (!readOnly && comment.author?.accountId) {
            const reply = document.createElement('button');
            reply.type = 'button';
            reply.textContent = trans('dialog.reply');
            reply.addEventListener('click', () => onReply(comment));
            actions.append(reply);
        }

        if (
            !readOnly
            && comment.id
            && comment.author?.accountId
            && comment.author.accountId === currentUser?.accountId
        ) {
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = trans('common.edit');
            edit.addEventListener('click', () => onEdit(article, body, comment));
            actions.append(edit);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'comment-delete-button';
            remove.textContent = trans('common.delete');
            remove.addEventListener('click', () => onDelete(comment, remove));
            actions.append(remove);
        }

        renderRichText(body, comment.body, trans('common.empty_comment'));
        article.append(header, body);
        container.append(article);
    });
}

export function replyToComment({
    comment,
    commentInput,
    replyContext,
    mergeMention,
    trans
}) {
    const displayName = comment.author?.displayName;
    const accountId = comment.author?.accountId;

    if (!displayName || !accountId) {
        return;
    }

    const mention = { accountId, text: `@${displayName}` };
    const current = commentInput.value.trimStart();

    if (!current.includes(mention.text)) {
        commentInput.value = `${mention.text} ${current}`;
    }

    mergeMention(mention);
    replyContext.hidden = false;
    replyContext.dataset.accountId = accountId;
    replyContext.querySelector('#comment-reply-label').textContent = trans(
        'dialog.reply_to',
        { name: displayName }
    );
    commentInput.focus();
    commentInput.setSelectionRange(
        commentInput.value.length,
        commentInput.value.length
    );
}

export async function removeComment({
    api,
    comment,
    button,
    issueKey,
    refresh,
    showToast,
    trans
}) {
    if (!comment.id || !window.confirm(trans('dialog.delete_comment_confirm'))) {
        return;
    }

    button.disabled = true;

    try {
        await api(
            `/issue/${encodeURIComponent(issueKey)}`
            + `/comments/${encodeURIComponent(comment.id)}`,
            { method: 'DELETE' }
        );
        await refresh();
        showToast(trans('dialog.comment_deleted'), 'success');
    } catch (error) {
        showToast(error.message, 'error');
        button.disabled = false;
    }
}

export function openCommentEditor({
    article,
    body,
    comment,
    issueKey,
    api,
    adfToText,
    adfMentions,
    refresh,
    setFormBusy,
    showToast,
    trans
}) {
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

        if (!updatedComment) {
            return;
        }

        setFormBusy(form, true);

        try {
            await api(
                `/issue/${encodeURIComponent(issueKey)}`
                + `/comments/${encodeURIComponent(comment.id)}`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        comment: updatedComment,
                        mentions: adfMentions(comment.body)
                    })
                }
            );
            await refresh();
            showToast(trans('dialog.comment_updated'), 'success');
        } catch (error) {
            showToast(error.message, 'error');
            setFormBusy(form, false);
        }
    });
}
