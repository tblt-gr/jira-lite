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

export function avatarUrl(user, preferredSize = 24) {
    const urls = user?.avatarUrls;

    if (!urls || typeof urls !== 'object') {
        return user?.avatarUrl || null;
    }

    const preferredKey = `${preferredSize}x${preferredSize}`;
    if (urls[preferredKey]) {
        return urls[preferredKey];
    }

    const availableSizes = Object.entries(urls)
        .map(([size, url]) => ({ size: Number.parseInt(size, 10), url }))
        .filter(({ size, url }) => Number.isFinite(size) && url)
        .sort((left, right) =>
            Math.abs(left.size - preferredSize)
            - Math.abs(right.size - preferredSize)
            || right.size - left.size
        );

    return availableSizes[0]?.url
        || Object.values(urls).find(Boolean)
        || user.avatarUrl
        || null;
}

export function createAvatar(user, preferredSize, className) {
    if (!user) {
        return null;
    }

    const avatar = document.createElement('span');
    const fallback = document.createElement('span');
    const image = createImage(
        avatarUrl(user, preferredSize),
        '',
        'user-avatar-image'
    );

    avatar.className = `${className} user-avatar`;
    fallback.className = 'user-avatar-fallback';
    fallback.textContent = initials(user.displayName);
    fallback.setAttribute('aria-hidden', 'true');
    avatar.append(fallback);

    if (image) {
        image.addEventListener('error', () => image.remove(), { once: true });
        avatar.append(image);
    }

    return avatar;
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
