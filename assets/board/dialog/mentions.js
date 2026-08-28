import { createImage } from '../dom.js';

// This module owns mention autocomplete; issue-dialog.js supplies API and form integration.
export function createMentionMenu({
    api,
    commentInput,
    menu,
    state,
    trans,
    scheduleTimeout,
    closeEmojiMenu,
    onSubmit,
    signal
}) {
    let searchTimer = null;
    let requestToken = 0;
    let activeRange = null;

    function close() {
        menu.hidden = true;
        menu.replaceChildren();
        activeRange = null;
    }

    function merge(mention) {
        state.commentMentions = [
            ...state.commentMentions.filter(candidate =>
                candidate.accountId !== mention.accountId
            ),
            mention
        ];
    }

    function select(user) {
        if (!activeRange) {
            return;
        }

        const text = `@${user.displayName}`;
        const before = commentInput.value.slice(0, activeRange.start);
        const after = commentInput.value.slice(activeRange.end)
            .replace(/^\s*/, '');
        const replacement = `${text} `;

        commentInput.value = `${before}${replacement}${after}`;
        merge({ accountId: user.accountId, text });
        const caret = before.length + replacement.length;
        close();
        commentInput.focus();
        commentInput.setSelectionRange(caret, caret);
    }

    function render(users) {
        menu.replaceChildren();
        if (!users.length) {
            const empty = document.createElement('span');
            empty.className = 'mention-menu-empty';
            empty.textContent = trans('dialog.no_user');
            menu.append(empty);
            menu.hidden = false;
            return;
        }

        users.forEach((user, index) => {
            const option = document.createElement('button');
            const avatar = createImage(user.avatarUrl, '', 'mention-avatar');
            const identity = document.createElement('span');

            option.type = 'button';
            option.className = 'mention-option';
            option.mentionUser = user;
            option.setAttribute('role', 'option');
            option.classList.toggle('is-active', index === 0);
            option.setAttribute('aria-selected', String(index === 0));
            identity.textContent = user.displayName;
            if (avatar) {
                avatar.addEventListener('error', () => avatar.remove(), { once: true });
                option.append(avatar);
            }
            option.append(identity);
            option.addEventListener('mousedown', event => {
                event.preventDefault();
                select(user);
            });
            menu.append(option);
        });
        menu.hidden = false;
    }

    function search() {
        closeEmojiMenu();
        window.clearTimeout(searchTimer);
        const caret = commentInput.selectionStart;
        const match = commentInput.value.slice(0, caret)
            .match(/(?:^|\s)@([^\s@]{1,40})$/u);
        if (!match) {
            close();
            return;
        }

        const query = match[1];
        activeRange = { start: caret - query.length - 1, end: caret };
        const token = ++requestToken;
        searchTimer = scheduleTimeout(async () => {
            try {
                const response = await api(`/users?query=${encodeURIComponent(query)}`);
                if (token === requestToken) {
                    render(response.users || []);
                }
            } catch {
                if (token === requestToken) {
                    close();
                }
            }
        }, 220);
    }

    commentInput.addEventListener('input', search, { signal });
    commentInput.addEventListener('blur', () => scheduleTimeout(close, 140), { signal });
    commentInput.addEventListener('keydown', event => {
        const options = Array.from(menu.querySelectorAll('.mention-option'));
        const activeIndex = options.findIndex(option => option.classList.contains('is-active'));
        if (!menu.hidden && options.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const next = (activeIndex + direction + options.length) % options.length;
            options.forEach((option, index) => {
                option.classList.toggle('is-active', index === next);
                option.setAttribute('aria-selected', String(index === next));
            });
            return;
        }
        if (!menu.hidden && event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
            const selected = options[activeIndex] || options[0];
            if (selected?.mentionUser) {
                event.preventDefault();
                select(selected.mentionUser);
                return;
            }
        }
        if (!menu.hidden && event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSubmit();
        }
    }, { signal });

    return { close, merge };
}
