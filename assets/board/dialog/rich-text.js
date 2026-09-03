import { adfToText } from '../jira.js';

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

        container.append(document.createTextNode(text.slice(cursor, match.index)));

        if (href) {
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = candidate;
            container.append(link, document.createTextNode(match[0].slice(candidate.length)));
        } else {
            container.append(document.createTextNode(match[0]));
        }

        cursor = match.index + match[0].length;
    }

    container.append(document.createTextNode(text.slice(cursor)));
}

function wrapInlineMark(content, mark) {
    switch (mark.type) {
        case 'strong':
            return { tag: 'strong', children: [content] };
        case 'em':
            return { tag: 'em', children: [content] };
        case 'code':
            return { tag: 'code', children: [content] };
        case 'strike':
            return { tag: 's', children: [content] };
        case 'underline':
            return { tag: 'u', children: [content] };
        case 'link':
            return {
                tag: 'a',
                attrs: {
                    href: mark.attrs?.href || '',
                    target: '_blank',
                    rel: 'noopener noreferrer'
                },
                children: [content]
            };
        default:
            return content;
    }
}

function buildInlineTree(nodes) {
    return (nodes || []).flatMap(node => {
        if (node.type === 'text') {
            let item = { type: 'text', value: node.text || '' };

            for (const mark of [...(node.marks || [])].reverse()) {
                item = wrapInlineMark(item, mark);
            }

            return [item];
        }

        if (node.type === 'hardBreak') {
            return [{ tag: 'br' }];
        }

        if (node.type === 'mention') {
            return [{
                tag: 'span',
                className: 'comment-mention',
                children: [{
                    type: 'text',
                    value: node.attrs?.text || '@utilisateur'
                }]
            }];
        }

        if (node.type === 'emoji') {
            return [{
                type: 'text',
                value: node.attrs?.text || node.attrs?.shortName || ''
            }];
        }

        if (Array.isArray(node.content)) {
            return buildInlineTree(node.content);
        }

        return [];
    });
}

function buildBlockTree(node) {
    if (!node) {
        return [];
    }

    switch (node.type) {
        case 'doc':
            return (node.content || []).flatMap(buildBlockTree);
        case 'paragraph':
            return [{
                tag: 'p',
                children: buildInlineTree(node.content)
            }];
        case 'heading': {
            const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));

            return [{
                tag: `h${level}`,
                children: buildInlineTree(node.content)
            }];
        }
        case 'bulletList':
            return [{
                tag: 'ul',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'orderedList':
            return [{
                tag: 'ol',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'listItem':
            return [{
                tag: 'li',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'blockquote':
            return [{
                tag: 'blockquote',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'codeBlock':
            return [{
                tag: 'pre',
                children: [{
                    tag: 'code',
                    children: [{ type: 'text', value: adfToText(node).replace(/\n$/, '') }]
                }]
            }];
        case 'rule':
            return [{ tag: 'hr' }];
        case 'panel':
            return [{
                tag: 'div',
                className: 'adf-panel',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'table':
            return [{
                tag: 'table',
                className: 'adf-table',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'tableRow':
            return [{
                tag: 'tr',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'tableHeader':
            return [{
                tag: 'th',
                children: buildInlineTree(node.content)
            }];
        case 'tableCell':
            return [{
                tag: 'td',
                children: (node.content || []).flatMap(buildBlockTree)
            }];
        case 'mediaSingle':
            return [{
                tag: 'p',
                className: 'adf-media-placeholder',
                children: [{ type: 'text', value: adfToText(node).trim() || '[media]' }]
            }];
        default:
            if (Array.isArray(node.content)) {
                return node.content.flatMap(buildBlockTree);
            }

            if (node.type === 'text' || node.type === 'mention' || node.type === 'hardBreak') {
                return [{
                    tag: 'p',
                    children: buildInlineTree([node])
                }];
            }

            return [];
    }
}

export function buildAdfRenderTree(content) {
    if (typeof content === 'string') {
        return content
            .split(/\r?\n/)
            .map(line => ({
                tag: 'p',
                children: line ? [{ type: 'text', value: line }] : []
            }));
    }

    return buildBlockTree(content);
}

function nodeHasVisibleContent(node) {
    if (node.type === 'text') {
        return node.value.trim().length > 0;
    }

    if (node.tag === 'hr') {
        return true;
    }

    return (node.children || []).some(nodeHasVisibleContent);
}

export function hasRichTextContent(content) {
    if (typeof content === 'string') {
        return content.trim().length > 0;
    }

    return buildAdfRenderTree(content).some(nodeHasVisibleContent);
}

function renderTreeToText(node, context = {}) {
    if (Array.isArray(node)) {
        return node.map(item => renderTreeToText(item, context)).join('');
    }

    if (!node || typeof node !== 'object') {
        return '';
    }

    if (node.type === 'text') {
        return node.value;
    }

    if (node.tag === 'br') {
        return '\n';
    }

    if (node.tag === 'hr') {
        return '\n';
    }

    const children = node.children || [];
    const childText = children.map(child => renderTreeToText(child, context)).join('');

    switch (node.tag) {
        case 'ul':
            return children.map(child => renderTreeToText(child, { list: 'bullet' })).join('');
        case 'ol':
            return children.map((child, index) => renderTreeToText(child, {
                list: 'ordered',
                index: index + 1
            })).join('');
        case 'li': {
            const prefix = context.list === 'ordered' ? `${context.index}. ` : '- ';
            return `${prefix}${childText.replace(/\n+$/, '')}\n`;
        }
        case 'p':
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'blockquote':
            return childText.length > 0 ? `${childText.replace(/\n+$/, '')}\n` : '\n';
        case 'pre':
            return `${childText.replace(/\n+$/, '')}\n`;
        case 'tr':
            return `${childText.replace(/\n+$/, '')}\n`;
        case 'td':
        case 'th':
            return `${childText.replace(/\n+/g, ' ').trimEnd()} | `;
        case 'table':
            return childText;
        default:
            return childText;
    }
}

export function adfToEditableText(content) {
    if (!content) {
        return '';
    }

    if (typeof content === 'string') {
        return content;
    }

    return renderTreeToText(buildAdfRenderTree(content)).replace(/\n+$/, '');
}

function renderTreeNode(node, container, options = {}) {
    if (node.type === 'text') {
        if (options.plainTextOnly) {
            container.append(document.createTextNode(node.value));
        } else {
            appendLinkifiedText(container, node.value);
        }

        return;
    }

    const href = node.tag === 'a' ? safeExternalUrl(String(node.attrs?.href || '')) : null;
    const element = document.createElement(node.tag === 'a' && !href ? 'span' : node.tag);

    if (node.className) {
        element.className = node.className;
    }

    if (node.attrs) {
        Object.entries(node.attrs).forEach(([name, value]) => {
            if (name === 'href') {
                if (href) {
                    element.href = href;
                }

                return;
            }

            element.setAttribute(name, String(value));
        });
    }

    const childOptions = {
        plainTextOnly: options.plainTextOnly || Boolean(href)
    };

    (node.children || []).forEach(child => renderTreeNode(child, element, childOptions));
    container.append(element);
}

function renderPlainText(container, content) {
    buildAdfRenderTree(content).forEach(node => renderTreeNode(node, container));
}

export function renderRichText(container, content, emptyText) {
    container.replaceChildren();

    if (!hasRichTextContent(content)) {
        container.textContent = emptyText;
        return;
    }

    renderPlainText(container, content);
}
