const EPIC_COLORS = {
    color_1: '#8b7cf6',
    color_2: '#f87171',
    color_3: '#fb923c',
    color_4: '#facc15',
    color_5: '#94a3b8',
    color_6: '#34d399',
    color_7: '#38bdf8',
    color_8: '#c084fc',
    color_9: '#f472b6',
    color_10: '#fb7185'
};

export function adfToText(node) {
    if (!node) {
        return '';
    }

    if (node.type === 'text') {
        return node.text || '';
    }

    if (node.type === 'mention') {
        return node.attrs?.text || '@utilisateur';
    }

    if (!Array.isArray(node.content)) {
        return '';
    }

    const content = node.content.map(adfToText).join('');

    if ([
        'paragraph',
        'heading',
        'blockquote',
        'codeBlock',
        'listItem'
    ].includes(node.type)) {
        return `${content}\n`;
    }

    return content;
}

export function adfToSegments(node) {
    if (!node) {
        return [];
    }

    if (node.type === 'text') {
        const link = (node.marks || []).find(mark => mark.type === 'link');

        return [{
            text: node.text || '',
            href: link?.attrs?.href || null,
            mention: false
        }];
    }

    if (node.type === 'mention') {
        return [{
            text: node.attrs?.text || '@utilisateur',
            href: null,
            mention: true
        }];
    }

    if (node.type === 'hardBreak') {
        return [{ text: '\n', href: null }];
    }

    if (!Array.isArray(node.content)) {
        return [];
    }

    const segments = node.content.flatMap(adfToSegments);

    if ([
        'paragraph',
        'heading',
        'blockquote',
        'codeBlock',
        'listItem'
    ].includes(node.type)) {
        segments.push({ text: '\n', href: null });
    }

    return segments;
}

export function adfMentions(node) {
    if (!node) {
        return [];
    }

    if (node.type === 'mention' && node.attrs?.id) {
        return [{
            accountId: String(node.attrs.id),
            text: String(node.attrs.text || '@utilisateur')
        }];
    }

    if (!Array.isArray(node.content)) {
        return [];
    }

    const mentions = node.content.flatMap(adfMentions);

    return mentions.filter((mention, index) =>
        mentions.findIndex(candidate =>
            candidate.accountId === mention.accountId
            && candidate.text === mention.text
        ) === index
    );
}

export function issueEpicObject(issue) {
    const fields = issue.fields || {};

    for (const key of Object.keys(fields)) {
        const value = fields[key];

        if (
            /epic/i.test(key) &&
            value &&
            typeof value === 'object' &&
            (value.id || value.key)
        ) {
            return value;
        }
    }

    return null;
}

export function issueEpicIds(issue) {
    const fields = issue.fields || {};
    const ids = new Set();

    Object.keys(fields)
        .filter(key => /epic/i.test(key))
        .forEach(key => {
            const value = fields[key];

            if (value && typeof value === 'object') {
                [value.id, value.key]
                    .filter(item => item !== undefined && item !== null)
                    .forEach(item => ids.add(String(item)));
            } else if (value !== undefined && value !== null) {
                ids.add(String(value));
            }
        });

    return ids;
}

export function epicColor(epic) {
    const value = epic?.color?.key || epic?.color || '';

    if (typeof value === 'string' && value.startsWith('#')) {
        return value;
    }

    return EPIC_COLORS[value] || '#8b7cf6';
}

export function epicLabel(epic, fallback = '') {
    return epic?.summary || epic?.name || epic?.key || fallback;
}

export function epicIds(epic) {
    return [epic.id, epic.key]
        .filter(value => value !== undefined && value !== null)
        .map(String);
}

export function canonicalEpicId(epic) {
    return String(epic.id ?? epic.key);
}

export function issueBelongsToEpic(issue, epicId) {
    return issueEpicIds(issue).has(epicId);
}

export function isActiveIssue(issue) {
    const category =
        issue.fields?.status?.statusCategory ||
        issue.fields?.statusCategory;
    const key = String(category?.key || '').toLowerCase();
    const name = String(category?.name || '').toLowerCase();

    if (key) {
        return key !== 'done';
    }

    return !['done', 'terminé', 'termine'].includes(name);
}

function sprintState(sprint) {
    if (sprint && typeof sprint === 'object') {
        return String(sprint.state || '').toLowerCase();
    }

    const match = String(sprint || '').match(
        /(?:^|[[,])\s*state=([^,\]]+)/i
    );

    return String(match?.[1] || '').trim().toLowerCase();
}

function sprintName(sprint) {
    if (sprint && typeof sprint === 'object') {
        return sprint.name || '';
    }

    const value = String(sprint || '');
    const match = value.match(/(?:^|[[,])\s*name=([^,\]]+)/i);

    return String(match?.[1] || value).trim();
}

export function activeSprintNames(value) {
    const sprints = Array.isArray(value) ? value : [value];
    const names = sprints
        .filter(sprint => sprintState(sprint) === 'active')
        .map(sprintName)
        .filter(Boolean);

    return Array.from(new Set(names)).join(', ');
}
