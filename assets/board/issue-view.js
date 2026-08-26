import {
    createImage,
    jiraAttachmentMediaUrl,
    jiraMediaUrl
} from './dom.js';
import { createImageViewer } from './image-viewer.js';
import {
    activeSprintNames,
    adfToSegments
} from './jira.js';
import {
    fieldValueByName as selectFieldValueByName,
    storyPoints
} from './board-model.js';

const PINNED_FIELDS_STORAGE_KEY = 'jira-lite:pinned-issue-fields';

export function createIssueView(context) {
    const { root, state, trans } = context;
    const listenerOptions = { signal: context.signal };
    const imageViewer = createImageViewer({
        root,
        signal: context.signal
    });

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

    function readPinnedFieldKeys() {
        try {
            const storedValue = JSON.parse(
                window.localStorage.getItem(PINNED_FIELDS_STORAGE_KEY) || '[]'
            );

            return Array.isArray(storedValue)
                ? [...new Set(storedValue.filter(value =>
                    typeof value === 'string'
                ))]
                : [];
        } catch {
            return [];
        }
    }

    let pinnedFieldKeys = readPinnedFieldKeys();

    function savePinnedFieldKeys() {
        try {
            window.localStorage.setItem(
                PINNED_FIELDS_STORAGE_KEY,
                JSON.stringify(pinnedFieldKeys)
            );
        } catch {
            // The dialog remains usable when storage is unavailable.
        }
    }

    function togglePinnedField(fieldKey) {
        if (pinnedFieldKeys.includes(fieldKey)) {
            pinnedFieldKeys = pinnedFieldKeys.filter(key => key !== fieldKey);
        } else {
            pinnedFieldKeys.push(fieldKey);
        }

        savePinnedFieldKeys();

        if (state.issue) {
            renderIssueFieldGroups(state.issue);
        }
    }

    function createPinButton(fieldKey, label) {
        const button = document.createElement('button');
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        const pin = document.createElementNS(namespace, 'path');
        const stem = document.createElementNS(namespace, 'path');
        const isPinned = pinnedFieldKeys.includes(fieldKey);

        button.type = 'button';
        button.className = 'field-pin-button';
        button.classList.toggle('is-pinned', isPinned);
        button.setAttribute('aria-pressed', String(isPinned));
        button.setAttribute(
            'aria-label',
            trans(isPinned ? 'dialog.unpin_field' : 'dialog.pin_field', {
                field: label
            })
        );
        button.title = button.getAttribute('aria-label');
        svg.classList.add('ui-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        pin.setAttribute('d', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z');
        stem.setAttribute('d', 'M12 14v7');
        svg.append(pin, stem);
        button.append(svg);
        button.addEventListener(
            'click',
            () => togglePinnedField(fieldKey),
            listenerOptions
        );

        return button;
    }

    function addIssueMeta(
        container,
        label,
        value,
        iconUrl = null,
        fieldKey = null
    ) {
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

        if (fieldKey) {
            item.dataset.fieldKey = fieldKey;
            item.append(createPinButton(fieldKey, label));
        }

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

    function editableFieldDefinitions(issue) {
        const fields = issue.fields || {};
        const tracking = fields.timetracking || {};

        return [
            {
                key: 'labels',
                label: trans('dialog.labels'),
                value: fieldNames(fields.labels) || trans('common.none')
            },
            {
                key: 'due-date',
                label: trans('dialog.due_date'),
                value: formatIssueDate(fields.duedate) || trans('common.none')
            },
            {
                key: 'original-estimate',
                label: trans('issue.estimate'),
                value: tracking.originalEstimate || trans('issue.no_estimate')
            },
            {
                key: 'remaining-estimate',
                label: trans('dialog.remaining_time'),
                value: tracking.remainingEstimate || trans('issue.no_estimate')
            }
        ];
    }

    function renderFieldDefinitions(container, definitions, pinned = false) {
        const orderedDefinitions = pinned
            ? pinnedFieldKeys
                .map(key => definitions.find(field => field.key === key))
                .filter(Boolean)
            : definitions.filter(field =>
                !pinnedFieldKeys.includes(field.key)
            );

        container.replaceChildren();
        orderedDefinitions.forEach(field => addIssueMeta(
            container,
            field.label,
            field.value,
            field.iconUrl,
            field.key
        ));
    }

    function renderEditableFields(issue) {
        const fields = issue.fields || {};
        const tracking = fields.timetracking || {};
        const preview = root.querySelector('#editable-fields-preview');

        renderFieldDefinitions(preview, editableFieldDefinitions(issue));

        root.querySelector('#labels-input').value =
            Array.isArray(fields.labels) ? fields.labels.join(', ') : '';
        root.querySelector('#due-date-input').value =
            fields.duedate || '';
        root.querySelector('#original-estimate-input').value =
            tracking.originalEstimate || '';
        root.querySelector('#remaining-estimate-input').value =
            tracking.remainingEstimate || '';
    }

    function issueMetaDefinitions(issue) {
        const fields = issue.fields || {};
        const definitions = [
            {
                key: 'type',
                label: trans('issue.type'),
                value: fields.issuetype?.name,
                iconUrl: fields.issuetype?.iconUrl
            },
            {
                key: 'priority',
                label: trans('issue.priority'),
                value: fields.priority?.name,
                iconUrl: fields.priority?.iconUrl
            },
            {
                key: 'parent',
                label: trans('issue.parent'),
                value: issueReference(fields.parent)
            },
            {
                key: 'project',
                label: trans('issue.project'),
                value: fields.project?.name
            },
            {
                key: 'assignee',
                label: trans('issue.assignee'),
                value: fields.assignee?.displayName || trans('common.unassigned'),
                iconUrl: fields.assignee?.avatarUrls?.['24x24']
            },
            {
                key: 'reporter',
                label: trans('issue.reporter'),
                value: fields.reporter?.displayName,
                iconUrl: fields.reporter?.avatarUrls?.['24x24']
            },
            {
                key: 'creator',
                label: trans('issue.creator'),
                value: fields.creator?.displayName,
                iconUrl: fields.creator?.avatarUrls?.['24x24']
            },
            {
                key: 'sprint',
                label: trans('issue.sprint'),
                value: currentIssueSprintNames(issue)
            }
        ];

        const points = storyPoints(issue, state.data?.issues?.names);
        if (points !== null) {
            definitions.push({
                key: 'story-points',
                label: trans('issue.story_points'),
                value: trans('issue.story_points_value', { count: points })
            });
        }

        return definitions.concat([
            {
                key: 'resolution',
                label: trans('issue.resolution'),
                value: fields.resolution?.name
            },
            {
                key: 'components',
                label: trans('issue.components'),
                value: fieldNames(fields.components)
            },
            {
                key: 'fix-versions',
                label: trans('issue.fix_versions'),
                value: fieldNames(fields.fixVersions)
            },
            {
                key: 'affected-versions',
                label: trans('issue.affected_versions'),
                value: fieldNames(fields.versions)
            },
            {
                key: 'created',
                label: trans('issue.created'),
                value: formatIssueDate(fields.created, true)
            },
            {
                key: 'updated',
                label: trans('issue.updated'),
                value: formatIssueDate(fields.updated, true)
            },
            {
                key: 'votes',
                label: trans('issue.votes'),
                value: fields.votes?.votes
            },
            {
                key: 'watchers',
                label: trans('issue.watchers'),
                value: fields.watches?.watchCount
            },
            {
                key: 'subtasks',
                label: trans('issue.subtasks'),
                value: Array.isArray(fields.subtasks)
                    ? fields.subtasks.length
                    : null
            },
            {
                key: 'attachments',
                label: trans('issue.attachments'),
                value: Array.isArray(fields.attachment)
                    ? fields.attachment.length
                    : null
            }
        ]);
    }

    function renderIssueMeta(issue) {
        const container = root.querySelector('#issue-meta');
        const accordion = root.querySelector('#issue-details-accordion');

        renderFieldDefinitions(container, issueMetaDefinitions(issue));
        accordion.hidden = container.childElementCount === 0;
    }

    function renderPinnedFields(issue) {
        const section = root.querySelector('#issue-pinned-fields');
        const container = root.querySelector('#pinned-fields-list');
        const definitions = [
            ...editableFieldDefinitions(issue),
            ...issueMetaDefinitions(issue)
        ];

        renderFieldDefinitions(container, definitions, true);
        section.hidden = container.childElementCount === 0;
    }

    function renderIssueFieldGroups(issue) {
        renderEditableFields(issue);
        renderIssueMeta(issue);
        renderPinnedFields(issue);
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
                const fullSources = Array.from(new Set([
                    attachmentContent,
                    jiraMediaUrl(attachment.content),
                    attachmentThumbnail,
                    jiraMediaUrl(attachment.thumbnail)
                ].filter(Boolean)));
                let previewIndex = 0;

                preview.className = 'issue-image-preview';

                if (href) {
                    preview.href = href;
                    preview.target = '_blank';
                    preview.rel = 'noopener noreferrer';
                }

                preview.setAttribute(
                    'aria-label',
                    trans('issue.expand_image', {
                        name: filename.textContent
                    })
                );
                preview.addEventListener('click', event => {
                    if (
                        event.button !== 0 ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.shiftKey ||
                        event.altKey
                    ) {
                        return;
                    }

                    event.preventDefault();
                    imageViewer.open({
                        sources: fullSources,
                        name: filename.textContent,
                        href
                    });
                }, listenerOptions);

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
        renderIssueFieldGroups,
        renderIssueLinks,
        renderRichText,
        renderTimeTracking
    };
}
