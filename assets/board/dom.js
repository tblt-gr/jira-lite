export function jiraMediaUrl(src) {
    if (!src || /^(?:data|blob):/i.test(src)) {
        return src;
    }

    if (
        String(src).startsWith('/api/jira/media?') ||
        String(src).startsWith('/api/jira/attachment/')
    ) {
        return src;
    }

    return `/api/jira/media?url=${encodeURIComponent(src)}`;
}

export function jiraAttachmentMediaUrl(id, variant = 'thumbnail') {
    if (!id) {
        return null;
    }

    const selectedVariant = variant === 'content' ? 'content' : 'thumbnail';

    return `/api/jira/attachment/${encodeURIComponent(id)}/${selectedVariant}`;
}

export function createImage(src, alt, className) {
    if (!src) {
        return null;
    }

    const image = document.createElement('img');
    image.src = jiraMediaUrl(src);
    image.alt = alt;
    image.className = className;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.draggable = false;

    return image;
}

export function initials(name) {
    return String(name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase();
}
