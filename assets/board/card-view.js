import { createImage, initials } from './dom.js';
import { epicColor, epicLabel } from './jira.js';

export function createCardView(
    issue,
    epic = null,
    points = null,
    trans = key => key,
    signal = undefined,
) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.issueKey = issue.key;
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute(
        'aria-label',
        `${issue.key} ${issue.fields?.summary || ''}`
    );

    const top = document.createElement('div');
    top.className = 'card-top';

    const identity = document.createElement('div');
    identity.className = 'card-identity';
    const issueType = issue.fields?.issuetype;
    const typeIcon = createImage(
        issueType?.iconUrl,
        issueType?.name || trans('card.type'),
        'issue-type-icon'
    );
    const key = document.createElement('span');
    key.className = 'card-key';
    key.textContent = issue.key;

    if (typeIcon) {
        typeIcon.title = issueType.name;
        typeIcon.addEventListener('error', () => typeIcon.remove(), {
            once: true,
            signal
        });
        identity.append(typeIcon);
    }

    identity.append(key);

    const priority = issue.fields?.priority;
    const priorityView = document.createElement('span');
    priorityView.className = 'card-priority';

    if (priority) {
        const priorityIcon = createImage(
            priority.iconUrl,
            '',
            'priority-icon'
        );

        if (priorityIcon) {
            priorityIcon.addEventListener(
                'error',
                () => priorityIcon.remove(),
                { once: true, signal }
            );
            priorityView.append(priorityIcon);
        }

        priorityView.append(priority.name);
    }

    top.append(identity);

    if (priority) {
        top.append(priorityView);
    }

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = issue.fields?.summary || '';

    const details = document.createElement('div');
    details.className = 'card-details';

    if (epic) {
        const epicTag = document.createElement('span');
        epicTag.className = 'card-epic';
        epicTag.style.setProperty('--epic-color', epicColor(epic));
        epicTag.textContent = epicLabel(epic, trans('board.without_epic'));
        details.append(epicTag);
    }

    (issue.fields?.labels || []).slice(0, 2).forEach(value => {
        const label = document.createElement('span');
        label.className = 'card-label';
        label.textContent = value;
        details.append(label);
    });

    if ((issue.fields?.labels || []).length > 2) {
        const more = document.createElement('span');
        more.className = 'card-label';
        more.textContent = trans('card.more_labels', {
            count: issue.fields.labels.length - 2
        });
        details.append(more);
    }

    const foot = document.createElement('div');
    foot.className = 'card-foot';

    if (points !== null) {
        const estimate = document.createElement('span');
        estimate.className = 'story-points';
        estimate.textContent = points;
        estimate.title = trans('card.story_points');
        foot.append(estimate);
    }

    const assignee = issue.fields?.assignee;
    const assigneeView = document.createElement('span');
    assigneeView.className = 'assignee';
    assigneeView.title = assignee?.displayName || trans('common.unassigned');
    const avatar = createImage(
        assignee?.avatarUrls?.['24x24'] || assignee?.avatarUrls?.['32x32'],
        '',
        'avatar'
    );

    if (avatar) {
        avatar.addEventListener('error', () => {
            const fallback = document.createElement('span');
            fallback.className = 'avatar avatar-fallback';
            fallback.textContent = initials(assignee?.displayName);
            avatar.replaceWith(fallback);
        }, { once: true, signal });
        assigneeView.append(avatar);
    } else {
        const fallback = document.createElement('span');
        fallback.className = 'avatar avatar-fallback';
        fallback.textContent = initials(assignee?.displayName);
        assigneeView.append(fallback);
    }

    const assigneeName = document.createElement('span');
    assigneeName.className = 'assignee-name';
    assigneeName.textContent =
        assignee?.displayName || trans('common.unassigned');
    assigneeView.append(assigneeName);
    foot.append(assigneeView);

    card.append(top, title);

    if (details.children.length) {
        card.append(details);
    }

    card.append(foot);

    return card;
}
