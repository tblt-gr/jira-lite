import { createAvatar, createImage } from '../dom.js';
import { fieldValueByName } from '../board-model.js';
import {
    editableFieldDefinitions,
    formatSeconds,
    issueMetaDefinitions
} from './issue-field-definitions.js';

const PINNED_FIELDS_STORAGE_KEY = 'jira-lite:pinned-issue-fields';

// This module owns issue field rendering and pin persistence; issue-dialog.js owns lifecycle.
export function createIssueFields({ root, state, openIssue, signal, trans }) {
    const listenerOptions = { signal };

    function readPinnedFieldKeys() {
        try {
            const storedValue = JSON.parse(
                window.localStorage.getItem(PINNED_FIELDS_STORAGE_KEY) || '[]'
            );

            return Array.isArray(storedValue)
                ? [...new Set(storedValue.filter(value => typeof value === 'string'))]
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
        pinnedFieldKeys = pinnedFieldKeys.includes(fieldKey)
            ? pinnedFieldKeys.filter(key => key !== fieldKey)
            : [...pinnedFieldKeys, fieldKey];
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
        button.setAttribute('aria-label', trans(
            isPinned ? 'dialog.unpin_field' : 'dialog.pin_field',
            { field: label }
        ));
        button.title = button.getAttribute('aria-label');
        svg.classList.add('ui-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        pin.setAttribute('d', 'M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z');
        stem.setAttribute('d', 'M12 14v7');
        svg.append(pin, stem);
        button.append(svg);
        button.addEventListener('click', () => togglePinnedField(fieldKey), listenerOptions);

        return button;
    }

    function addIssueMeta(container, definition) {
        const { label, value, iconUrl = null, key = null, user = null } = definition;

        if (value === undefined || value === null || value === '') {
            return;
        }

        const item = document.createElement('div');
        const labelElement = document.createElement('span');
        const valueElement = document.createElement('span');
        const icon = user
            ? createAvatar(user, 24, 'meta-icon')
            : createImage(iconUrl, '', 'meta-icon');

        item.className = 'issue-meta-item';
        labelElement.className = 'issue-meta-label';
        labelElement.textContent = label;
        valueElement.className = 'issue-meta-value';

        if (icon) {
            if (!user) {
                icon.addEventListener('error', () => icon.remove(), { once: true, signal });
            }
            valueElement.append(icon);
        }

        valueElement.append(value instanceof Node ? value : String(value));
        item.append(labelElement, valueElement);

        if (key) {
            item.dataset.fieldKey = key;
            item.append(createPinButton(key, label));
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
        button.setAttribute('aria-label', trans('issue.open_modal', { key: issue.key }));
        button.addEventListener('click', () => openIssue(issue.key), listenerOptions);
        key.textContent = issue.key;
        summary.textContent = issue.fields?.summary || '';
        button.append(key, summary);

        return button;
    }

    function definitionsFor(issue) {
        return issueMetaDefinitions({
            issue,
            fieldValueByName: (candidate, pattern) => fieldValueByName(
                candidate,
                state.data?.issues?.names,
                pattern
            ),
            issueReference,
            issueFieldNames: state.data?.issues?.names,
            trans
        });
    }

    function renderDefinitions(container, definitions, pinned = false) {
        const ordered = pinned
            ? pinnedFieldKeys.map(key => definitions.find(field => field.key === key)).filter(Boolean)
            : definitions.filter(field => !pinnedFieldKeys.includes(field.key));

        container.replaceChildren();
        ordered.forEach(field => addIssueMeta(container, field));
    }

    function renderEditableFields(issue) {
        const fields = issue.fields || {};
        const tracking = fields.timetracking || {};

        renderDefinitions(
            root.querySelector('#editable-fields-preview'),
            editableFieldDefinitions(issue, trans)
        );
        root.querySelector('#labels-input').value = Array.isArray(fields.labels)
            ? fields.labels.join(', ')
            : '';
        root.querySelector('#due-date-input').value = fields.duedate || '';
        root.querySelector('#original-estimate-input').value = tracking.originalEstimate || '';
        root.querySelector('#remaining-estimate-input').value = tracking.remainingEstimate || '';
    }

    function renderTimeTracking(issue) {
        const tracking = issue.fields?.timetracking || {};
        const spentSeconds = Number(tracking.timeSpentSeconds || 0);
        const remainingSeconds = Number(tracking.remainingEstimateSeconds || 0);
        const total = spentSeconds + remainingSeconds;
        const progress = total > 0
            ? Math.min(100, Math.round((spentSeconds / total) * 100))
            : 0;

        root.querySelector('#time-progress-bar').style.width = `${progress}%`;
        root.querySelector('#time-spent').textContent = spentSeconds > 0
            ? trans('issue.logged_time', {
                value: tracking.timeSpent || formatSeconds(spentSeconds, trans)
            })
            : trans('dialog.no_logged_time');
        root.querySelector('#time-remaining').textContent = tracking.remainingEstimate
            ? trans('issue.remaining_time_value', { value: tracking.remainingEstimate })
            : '';
    }

    function renderIssueFieldGroups(issue) {
        const meta = definitionsFor(issue);
        const editable = editableFieldDefinitions(issue, trans);
        const metaContainer = root.querySelector('#issue-meta');
        const pinnedContainer = root.querySelector('#pinned-fields-list');

        renderEditableFields(issue);
        renderDefinitions(metaContainer, meta);
        root.querySelector('#issue-details-accordion').hidden = metaContainer.childElementCount === 0;
        renderDefinitions(pinnedContainer, [...editable, ...meta], true);
        root.querySelector('#issue-pinned-fields').hidden = pinnedContainer.childElementCount === 0;
    }

    return { renderEditableFields, renderIssueFieldGroups, renderTimeTracking };
}
