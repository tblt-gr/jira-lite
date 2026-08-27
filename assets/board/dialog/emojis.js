export const COMMENT_EMOJIS = [
    '😀', '😃', '😊', '😂', '😉', '😍', '🥳', '🤔',
    '😅', '😢', '😮', '😬', '👍', '👎', '👏', '🙏',
    '💪', '🤝', '👌', '👀', '❤️', '💜', '🔥', '✨',
    '🎉', '✅', '❌', '⚠️', '🚀', '💡', '🐛', '⏳'
];

export function renderEmojiMenu({ menu, emojis, trans, onSelect }) {
    menu.replaceChildren();

    emojis.forEach(emoji => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'emoji-option';
        button.textContent = emoji;
        button.setAttribute('aria-label', trans('dialog.insert_emoji', {
            emoji
        }));
        button.addEventListener('click', () => onSelect(emoji));
        menu.append(button);
    });
}
