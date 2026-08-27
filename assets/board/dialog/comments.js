import { createImage } from '../dom.js';

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
        const avatar = createImage(
            comment.author?.avatarUrls?.['32x32'],
            '',
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
            avatar.addEventListener('error', () => avatar.remove(), {
                once: true
            });
            header.append(avatar);
        }

        author.append(authorName, date);
        header.append(author, actions);

        if (comment.author?.accountId) {
            const reply = document.createElement('button');
            reply.type = 'button';
            reply.textContent = trans('dialog.reply');
            reply.addEventListener('click', () => onReply(comment));
            actions.append(reply);
        }

        if (
            comment.id
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
