import {
    createImage,
    jiraAttachmentMediaUrl,
    jiraMediaUrl
} from './dom.js';
import {
    activeSprintNames,
    adfToSegments
} from './jira.js';
import {
    fieldValueByName as selectFieldValueByName,
    storyPoints
} from './board-model.js';

export function createIssueView(context) {
    const { root, state, trans } = context;
    const listenerOptions = { signal: context.signal };

    function fieldValueByName(issue, pattern) {
        return selectFieldValueByName(
            issue,
            state.data?.issues?.names,
            pattern
        );
    }

    function openIssue(issueKey) {
        return context.openIssue(issueKey);
    }

    function addIssueMeta(container, label, value, iconUrl = null) {
        if (value === undefined || value === null || value === '') {
            return;
        }

        const item = document.createElement('div');
        const labelElement = document.createElement('span');
        const valueElement = document.createElement('span');
        item.className = 'issue-meta-item';
        labelElement.className = 'issue-meta-label';
        labelElement.textContent = label;
        valueElement.className = 'issue-meta-value';
        const icon = createImage(iconUrl, '', 'meta-icon');

        if (icon) {
            icon.addEventListener('error', () => icon.remove(), {
                once: true,
                signal: context.signal
            });
            valueElement.append(icon);
        }

        valueElement.append(
            value instanceof Node ? value : String(value)
        );
        item.append(labelElement, valueElement);
        container.append(item);
    }

    function issueReference(issue) {
        if (!issue?.key) {
            return null;
        }

        const button = document.createElement('button');
        const key = document.createElement('strong');
        const summary = document.createElement('span');

        button.type = 'button';
        button.className = 'issue-reference';
        button.setAttribute(
            'aria-label',
            trans('issue.open_modal', { key: issue.key })
        );
        button.addEventListener(
            'click',
            () => openIssue(issue.key),
            listenerOptions
        );
        key.textContent = issue.key;
        summary.textContent = issue.fields?.summary || '';
        button.append(key, summary);

        return button;
    }

    function fieldNames(items) {
        if (!Array.isArray(items)) {
            return '';
        }

        return items
            .map(item => item?.name || item?.value || item)
            .filter(Boolean)
            .join(', ');
    }

    function formatIssueDate(value, withTime = false) {
        if (!value) {
            return '';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat(document.documentElement.lang, withTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' }
        ).format(date);
    }

    function currentIssueSprintNames(issue) {
        const value = issue.fields?.sprint || fieldValueByName(issue, /sprint/i);

        return activeSprintNames(value);
    }

    function formatSeconds(value) {
        const seconds = Number(value);

        if (!Number.isFinite(seconds) || seconds <= 0) {
            return '';
        }

        const days = Math.floor(seconds / 28_800);
        const hours = Math.floor((seconds % 28_800) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return [
            days ? trans('issue.days_short', { count: days }) : '',
            hours ? trans('issue.hours_short', { count: hours }) : '',
            minutes ? trans('issue.minutes_short', { count: minutes }) : ''
        ].filter(Boolean).join(' ');
    }

    function renderTimeTracking(issue) {
        const tracking = issue.fields?.timetracking || {};
        const spentSeconds = Number(tracking.timeSpentSeconds || 0);
        const remainingSeconds = Number(
            tracking.remainingEstimateSeconds || 0
        );
        const total = spentSeconds + remainingSeconds;
        const progress = total > 0
            ? Math.min(100, Math.round((spentSeconds / total) * 100))
            : 0;

        root.querySelector('#time-progress-bar').style.width =
            `${progress}%`;
        root.querySelector('#time-spent').textContent = spentSeconds > 0
            ? trans('issue.logged_time', {
                value: tracking.timeSpent || formatSeconds(spentSeconds)
            })
            : trans('dialog.no_logged_time');
        root.querySelector('#time-remaining').textContent =
            tracking.remainingEstimate
                ? trans('issue.remaining_time_value', {
                    value: tracking.remainingEstimate
                })
                : '';
    }

    function renderEditableFields(issue) {
        const fields = issue.fields || {};
        const tracking = fields.timetracking || {};
        const preview = root.querySelector('#editable-fields-preview');

        preview.replaceChildren();
        addIssueMeta(
            preview,
            trans('dialog.labels'),
            fieldNames(fields.labels) || trans('common.none')
        );
        addIssueMeta(
            preview,
            trans('dialog.due_date'),
            formatIssueDate(fields.duedate) || trans('common.none')
        );
        addIssueMeta(
            preview,
            trans('issue.estimate'),
            tracking.originalEstimate || trans('issue.no_estimate')
        );
        addIssueMeta(
            preview,
            trans('dialog.remaining_time'),
            tracking.remainingEstimate || trans('issue.no_estimate')
        );

        root.querySelector('#labels-input').value =
            Array.isArray(fields.labels) ? fields.labels.join(', ') : '';
        root.querySelector('#due-date-input').value =
            fields.duedate || '';
        root.querySelector('#original-estimate-input').value =
            tracking.originalEstimate || '';
        root.querySelector('#remaining-estimate-input').value =
            tracking.remainingEstimate || '';
    }

    function renderIssueMeta(issue) {
        const container = root.querySelector('#issue-meta');
        const fields = issue.fields || {};

        container.replaceChildren();
        addIssueMeta(
            container,
            trans('issue.type'),
            fields.issuetype?.name,
            fields.issuetype?.iconUrl
        );
        addIssueMeta(
            container,
            trans('issue.priority'),
            fields.priority?.name,
            fields.priority?.iconUrl
        );
        addIssueMeta(
            container,
            trans('issue.parent'),
            issueReference(fields.parent)
        );
        addIssueMeta(container, trans('issue.project'), fields.project?.name);
        addIssueMeta(
            container,
            trans('issue.assignee'),
            fields.assignee?.displayName || trans('common.unassigned'),
            fields.assignee?.avatarUrls?.['24x24']
        );
        addIssueMeta(
            container,
            trans('issue.reporter'),
            fields.reporter?.displayName,
            fields.reporter?.avatarUrls?.['24x24']
        );
        addIssueMeta(
            container,
            trans('issue.creator'),
            fields.creator?.displayName,
            fields.creator?.avatarUrls?.['24x24']
        );
        addIssueMeta(
            container,
            trans('issue.sprint'),
            currentIssueSprintNames(issue)
        );

        const points = storyPoints(issue, state.data?.issues?.names);
        if (points !== null) {
            addIssueMeta(
                container,
                trans('issue.story_points'),
                trans('issue.story_points_value', { count: points })
            );
        }

        addIssueMeta(
            container,
            trans('issue.resolution'),
            fields.resolution?.name
        );
        addIssueMeta(
            container,
            trans('issue.components'),
            fieldNames(fields.components)
        );
        addIssueMeta(
            container,
            trans('issue.fix_versions'),
            fieldNames(fields.fixVersions)
        );
        addIssueMeta(
            container,
            trans('issue.affected_versions'),
            fieldNames(fields.versions)
        );
        addIssueMeta(
            container,
            trans('issue.created'),
            formatIssueDate(fields.created, true)
        );
        addIssueMeta(
            container,
            trans('issue.updated'),
            formatIssueDate(fields.updated, true)
        );
        addIssueMeta(container, trans('issue.votes'), fields.votes?.votes);
        addIssueMeta(
            container,
            trans('issue.watchers'),
            fields.watches?.watchCount
        );
        addIssueMeta(
            container,
            trans('issue.subtasks'),
            Array.isArray(fields.subtasks) ? fields.subtasks.length : null
        );
        addIssueMeta(
            container,
            trans('issue.attachments'),
            Array.isArray(fields.attachment) ? fields.attachment.length : null
        );
    }

    function safeExternalUrl(value, base = undefined) {
        try {
            const url = new URL(value, base);

            return ['http:', 'https:'].includes(url.protocol)
                ? url.href
                : null;
        } catch {
            return null;
        }
    }

    function createExternalLinkIcon() {
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        const arrow = document.createElementNS(namespace, 'path');
        const frame = document.createElementNS(namespace, 'path');

        svg.classList.add('ui-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        arrow.setAttribute('d', 'M14 5h5v5M19 5l-9 9');
        frame.setAttribute(
            'd',
            'M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6' +
            'a1 1 0 0 1 1-1h5'
        );
        svg.append(arrow, frame);

        return svg;
    }

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
                container.append(link);
                container.append(match[0].slice(candidate.length));
            } else {
                container.append(match[0]);
            }

            cursor = match.index + match[0].length;
        }

        container.append(text.slice(cursor));
    }

    function renderRichText(container, content, emptyText) {
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
                return;
            }

            if (href) {
                const link = document.createElement('a');
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = segment.text;
                container.append(link);
                return;
            }

            appendLinkifiedText(container, segment.text);
        });
    }

    function renderIssueDescription(description) {
        renderRichText(
            root.querySelector('#issue-description'),
            description,
            trans('issue.no_description')
        );
    }

    function renderIssueLinks(issue) {
        const section = root.querySelector('#issue-links');
        const container = root.querySelector('#issue-links-list');
        const links = Array.isArray(issue.fields?.issuelinks)
            ? issue.fields.issuelinks
            : [];

        container.replaceChildren();

        links.forEach(issueLink => {
            const linkedIssue = issueLink.outwardIssue || issueLink.inwardIssue;

            if (!linkedIssue?.key) {
                return;
            }

            const relation = issueLink.outwardIssue
                ? issueLink.type?.outward
                : issueLink.type?.inward;
            const item = document.createElement('button');
            const identity = document.createElement('span');
            const key = document.createElement('strong');
            const summary = document.createElement('span');
            const status = linkedIssue.fields?.status?.name;

            item.className = 'issue-link-card';
            item.type = 'button';
            item.setAttribute(
                'aria-label',
                trans('issue.open_modal', { key: linkedIssue.key })
            );
            item.addEventListener(
                'click',
                () => openIssue(linkedIssue.key),
                listenerOptions
            );

            identity.className = 'issue-link-identity';
            key.textContent = linkedIssue.key;
            summary.textContent =
                linkedIssue.fields?.summary || trans('issue.without_title');
            identity.append(key, summary);
            item.append(identity);

            if (relation || status) {
                const details = document.createElement('span');
                details.className = 'issue-link-details';

                if (relation) {
                    const relationLabel = document.createElement('span');
                    relationLabel.textContent = relation;
                    details.append(relationLabel);
                }

                if (status) {
                    const statusLabel = document.createElement('span');
                    statusLabel.className = 'issue-link-status';
                    statusLabel.textContent = status;
                    details.append(statusLabel);
                }

                item.append(details);
            }

            container.append(item);
        });

        section.hidden = container.childElementCount === 0;
    }

    function renderIssueAttachments(issue) {
        const section = root.querySelector('#issue-attachments');
        const container = root.querySelector('#issue-attachments-list');
        const attachments = Array.isArray(issue.fields?.attachment)
            ? issue.fields.attachment
            : [];

        container.replaceChildren();

        attachments.forEach(attachment => {
            const isImage =
                String(attachment?.mimeType || '').toLowerCase()
                    .startsWith('image/') || Boolean(attachment?.thumbnail);
            const imageUrl = attachment.thumbnail || attachment.content;
            const fullImageUrl = attachment.content || imageUrl;
            const attachmentThumbnail = jiraAttachmentMediaUrl(
                attachment.id,
                'thumbnail'
            );
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
            filename.textContent =
                attachment.filename || trans('issue.attachment');
            header.append(filename);

            if (href) {
                const open = document.createElement('a');
                open.className = 'issue-image-open';
                open.href = href;
                open.target = '_blank';
                open.rel = 'noopener noreferrer';
                open.append(
                    `${trans('issue.open')} `,
                    createExternalLinkIcon()
                );
                open.setAttribute(
                    'aria-label',
                    trans('issue.open_new_tab', {
                        name: filename.textContent
                    })
                );
                header.append(open);
            }

            card.append(header);

            if (isImage && imageUrl) {
                const image = createImage(
                    attachmentThumbnail || imageUrl,
                    filename.textContent,
                    'issue-attachment-image'
                );
                image.src = attachmentThumbnail || jiraMediaUrl(imageUrl);
                const preview = document.createElement(href ? 'a' : 'div');
                const unavailable = document.createElement('span');
                const previewSources = Array.from(new Set([
                    attachmentThumbnail,
                    attachmentContent,
                    jiraMediaUrl(attachment.thumbnail),
                    jiraMediaUrl(attachment.content)
                ].filter(Boolean)));
                let previewIndex = 0;

                preview.className = 'issue-image-preview';

                if (href) {
                    preview.href = href;
                    preview.target = '_blank';
                    preview.rel = 'noopener noreferrer';
                }

                unavailable.className = 'issue-image-unavailable';
                unavailable.textContent = trans(
                    'issue.preview_unavailable'
                );
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
            } else {
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

            container.append(card);
        });

        section.hidden = container.childElementCount === 0;
    }


    return {
        renderEditableFields,
        renderIssueAttachments,
        renderIssueDescription,
        renderIssueLinks,
        renderIssueMeta,
        renderRichText,
        renderTimeTracking
    };
}
