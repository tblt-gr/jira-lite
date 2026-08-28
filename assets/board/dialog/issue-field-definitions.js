import { activeSprintNames } from '../jira.js';
import { storyPoints } from '../board-model.js';

// This module maps Jira field data to display definitions without owning dialog DOM state.
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

export function formatSeconds(value, trans) {
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

export function editableFieldDefinitions(issue, trans) {
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

export function issueMetaDefinitions({
    issue,
    fieldValueByName,
    issueReference,
    issueFieldNames,
    trans
}) {
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
            user: fields.assignee
        },
        {
            key: 'reporter',
            label: trans('issue.reporter'),
            value: fields.reporter?.displayName,
            user: fields.reporter
        },
        {
            key: 'creator',
            label: trans('issue.creator'),
            value: fields.creator?.displayName,
            user: fields.creator
        },
        {
            key: 'sprint',
            label: trans('issue.sprint'),
            value: activeSprintNames(
                fields.sprint || fieldValueByName(issue, /sprint/i)
            )
        }
    ];
    const points = storyPoints(issue, issueFieldNames);

    if (points !== null) {
        definitions.push({
            key: 'story-points',
            label: trans('issue.story_points'),
            value: trans('issue.story_points_value', { count: points })
        });
    }

    return definitions.concat([
        { key: 'resolution', label: trans('issue.resolution'), value: fields.resolution?.name },
        { key: 'components', label: trans('issue.components'), value: fieldNames(fields.components) },
        { key: 'fix-versions', label: trans('issue.fix_versions'), value: fieldNames(fields.fixVersions) },
        { key: 'affected-versions', label: trans('issue.affected_versions'), value: fieldNames(fields.versions) },
        { key: 'created', label: trans('issue.created'), value: formatIssueDate(fields.created, true) },
        { key: 'updated', label: trans('issue.updated'), value: formatIssueDate(fields.updated, true) },
        { key: 'votes', label: trans('issue.votes'), value: fields.votes?.votes },
        { key: 'watchers', label: trans('issue.watchers'), value: fields.watches?.watchCount },
        {
            key: 'subtasks',
            label: trans('issue.subtasks'),
            value: Array.isArray(fields.subtasks) ? fields.subtasks.length : null
        },
        {
            key: 'attachments',
            label: trans('issue.attachments'),
            value: Array.isArray(fields.attachment) ? fields.attachment.length : null
        }
    ]);
}
