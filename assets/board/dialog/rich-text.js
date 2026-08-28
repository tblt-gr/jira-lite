import { adfToSegments } from '../jira.js';

// This module owns safe rich-text projection; dialog orchestration stays in issue-dialog.js.
export function safeExternalUrl(value, base = undefined) {
    try {
        const url = new URL(value, base);

        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function appendLinkifiedText(container, text) {
    const pattern = /https?:\/\/[^\s<>"']+/gi;
    let cursor = 0;

    for (const match of text.matchAll(pattern)) {
        const candidate = match[0].replace(/[),.;!?]+$/, '');
        const href = safeExternalUrl(candidate);

        container.append(text.slice(cursor, match.index));

        if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = candidate;
            container.append(link, match[0].slice(candidate.length));
        } else {
            container.append(match[0]);
        }

        cursor = match.index + match[0].length;
    }

    container.append(text.slice(cursor));
}

export function renderRichText(container, content, emptyText) {
    const segments = typeof content === 'string'
        ? [{ text: content, href: null }]
        : adfToSegments(content);
    const fullText = segments.map(segment => segment.text).join('').trim();

    container.replaceChildren();

    if (!fullText) {
        container.textContent = emptyText;
        return;
    }

    segments.forEach(segment => {
        const href = safeExternalUrl(segment.href);

        if (segment.mention) {
            const mention = document.createElement('span');
            mention.className = 'comment-mention';
            mention.textContent = segment.text;
            container.append(mention);
        } else if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = segment.text;
            container.append(link);
        } else {
            appendLinkifiedText(container, segment.text);
        }
    });
}
