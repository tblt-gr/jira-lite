import {
    createImage,
    jiraAttachmentMediaUrl,
    jiraMediaUrl
} from '../dom.js';
import { safeExternalUrl } from './rich-text.js';

// This module owns attachment cards and lightbox wiring; issue-view.js only coordinates sections.
function createFileIcon() {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const file = document.createElementNS(namespace, 'path');
    const fold = document.createElementNS(namespace, 'path');

    svg.classList.add('ui-icon', 'issue-file-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    file.setAttribute(
        'd',
        'M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z'
    );
    fold.setAttribute('d', 'M14 2v5h5');
    svg.append(file, fold);

    return svg;
}

function formatFileSize(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes) || bytes < 0) {
        return '';
    }

    if (bytes < 1000) {
        return `${bytes} o`;
    }

    if (bytes < 1_000_000) {
        return `${(bytes / 1000).toFixed(1)} Ko`;
    }

    return `${(bytes / 1_000_000).toFixed(1)} Mo`;
}

function renderImagePreview({ attachment, card, filename, href, imageViewer, listenerOptions, trans }) {
    const imageUrl = attachment.thumbnail || attachment.content;
    const attachmentThumbnail = jiraAttachmentMediaUrl(
        attachment.id,
        'thumbnail'
    );
    const attachmentContent = jiraAttachmentMediaUrl(attachment.id, 'content');
    const image = createImage(
        attachmentThumbnail || imageUrl,
        filename.textContent,
        'issue-attachment-image'
    );
    const preview = document.createElement(href ? 'a' : 'div');
    const unavailable = document.createElement('span');
    const previewSources = Array.from(new Set([
        attachmentThumbnail,
        attachmentContent,
        jiraMediaUrl(attachment.thumbnail),
        jiraMediaUrl(attachment.content)
    ].filter(Boolean)));
    const fullSources = Array.from(new Set([
        attachmentContent,
        jiraMediaUrl(attachment.content),
        attachmentThumbnail,
        jiraMediaUrl(attachment.thumbnail)
    ].filter(Boolean)));
    let previewIndex = 0;

    image.src = attachmentThumbnail || jiraMediaUrl(imageUrl);
    preview.className = 'issue-image-preview';

    if (href) {
        preview.href = href;
        preview.target = '_blank';
        preview.rel = 'noopener noreferrer';
    }

    preview.setAttribute(
        'aria-label',
        trans('issue.expand_image', { name: filename.textContent })
    );
    preview.addEventListener('click', event => {
        if (
            event.button !== 0 || event.ctrlKey || event.metaKey
            || event.shiftKey || event.altKey
        ) {
            return;
        }

        event.preventDefault();
        imageViewer.open({ sources: fullSources, name: filename.textContent, href });
    }, listenerOptions);

    unavailable.className = 'issue-image-unavailable';
    unavailable.textContent = trans('issue.preview_unavailable');
    unavailable.hidden = true;
    preview.append(image, unavailable);
    image.addEventListener('error', () => {
        previewIndex += 1;

        if (previewSources[previewIndex]) {
            image.src = previewSources[previewIndex];
            return;
        }

        image.remove();
        unavailable.hidden = false;
    }, listenerOptions);
    card.append(preview);
}

function renderFilePreview({ attachment, card, href, trans }) {
    const preview = document.createElement(href ? 'a' : 'div');
    const details = document.createElement('span');
    const metadata = [
        attachment.mimeType,
        formatFileSize(attachment.size)
    ].filter(Boolean).join(' · ');

    preview.className = 'issue-file-preview';

    if (href) {
        preview.href = href;
        preview.target = '_blank';
        preview.rel = 'noopener noreferrer';
    }

    details.textContent = metadata || trans('issue.attached_file');
    preview.append(createFileIcon(), details);
    card.append(preview);
}

export function createAttachmentRenderer({ root, imageViewer, signal, trans }) {
    const listenerOptions = { signal };

    return function renderIssueAttachments(issue) {
        const section = root.querySelector('#issue-attachments');
        const container = root.querySelector('#issue-attachments-list');
        const attachments = Array.isArray(issue.fields?.attachment)
            ? issue.fields.attachment
            : [];

        container.replaceChildren();

        attachments.forEach(attachment => {
            const isImage = String(attachment?.mimeType || '')
                .toLowerCase().startsWith('image/')
                || Boolean(attachment?.thumbnail);
            const fullImageUrl = attachment.content || attachment.thumbnail;
            const attachmentContent = jiraAttachmentMediaUrl(
                attachment.id,
                'content'
            );
            const card = document.createElement('figure');
            const header = document.createElement('figcaption');
            const filename = document.createElement('span');
            const href = isImage && fullImageUrl
                ? attachmentContent || jiraMediaUrl(fullImageUrl)
                : safeExternalUrl(attachment.content, issue.self);

            card.className = 'issue-attachment-card';
            filename.className = 'issue-image-name';
            filename.textContent = attachment.filename || trans('issue.attachment');
            header.append(filename);
            card.append(header);

            if (isImage && (attachment.thumbnail || attachment.content)) {
                renderImagePreview({
                    attachment,
                    card,
                    filename,
                    href,
                    imageViewer,
                    listenerOptions,
                    trans
                });
            } else {
                renderFilePreview({ attachment, card, href, trans });
            }

            container.append(card);
        });

        section.hidden = container.childElementCount === 0;
    };
}
