import { createBoardViewModel } from './board-model.js';
import { epicColor, epicLabel } from './jira.js';

export function currentSprintName(issues) {
    const sprint = issues.find(issue => issue.fields?.sprint)?.fields?.sprint;

    return sprint?.name || '';
}

function groupId(group) {
    return group.epic ? String(group.epic.id ?? group.epic.key) : '__without_epic__';
}

function createGroupHeader(context, group, sprintLabel, grouped, collapsed) {
    const { trans } = context;
    const header = document.createElement('header');
    header.className = 'board-group-header';

    const color = document.createElement('span');
    color.className = 'group-color';
    const key = document.createElement('span');
    key.className = 'board-group-key';
    key.textContent = group.epic?.key || trans('board.without_key');
    const issueUrl = grouped
        ? context.jiraIssueUrl(group.epic?.key, group.epic)
        : null;
    const title = document.createElement(issueUrl ? 'a' : 'h2');
    title.className = 'board-group-title';
    title.textContent = grouped
        ? epicLabel(group.epic, trans('board.without_epic'))
        : sprintLabel;

    if (issueUrl) {
        title.href = issueUrl;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
        title.title = trans('board.open_epic_hint');
    }

    const stats = document.createElement('span');
    stats.className = 'group-stats';
    const ticketCount = document.createElement('strong');
    ticketCount.className = 'group-ticket-count';
    ticketCount.textContent = group.issues.length;
    stats.append(
        '(',
        ticketCount,
        ` ${trans(group.issues.length === 1
            ? 'board.ticket_label_one'
            : 'board.ticket_label_many')})`
    );
    const actions = document.createElement('div');
    actions.className = 'group-actions';
    actions.append(color);

    if (grouped) {
        const collapse = document.createElement('button');
        collapse.type = 'button';
        collapse.className = 'group-collapse';
        collapse.setAttribute('aria-expanded', String(!collapsed));
        collapse.setAttribute(
            'aria-label',
            trans(collapsed ? 'board.expand_epic' : 'board.collapse_epic')
        );
        collapse.innerHTML =
            '<svg class="group-collapse-icon" viewBox="0 0 20 20" ' +
            'aria-hidden="true" focusable="false">' +
            '<path d="m5 7.5 5 5 5-5" /></svg>';
        actions.append(collapse, key);
    }

    actions.append(title, stats);
    header.append(actions);

    return header;
}

export function createBoardView(context) {
    let renderFrame = null;

    function render(revealFirstIssue = false) {
        const { state, board } = context;
        state.selectedIssueKeys.clear();
        state.selectedColumnId = null;
        const previousScrollLeft = board.scrollLeft;
        const previousScrollTop = board.scrollTop;
        const model = createBoardViewModel({
            data: state.data,
            selectedEpicIds: state.selectedEpicIds,
            view: state.view,
            searchQuery: context.search.value,
            selectedVersionIds: state.selectedVersionIds,
            selectedTypeIds: state.selectedTypeIds,
            selectedColumnIds: state.selectedColumnIds
        });
        const sprintLabel = currentSprintName(model.issues);

        const issueCount = context.trans(
            model.visibleIssueCount === 1
                ? 'board.issue_count_one'
                : 'board.issue_count_many',
            { count: model.visibleIssueCount }
        );
        const groupCount = state.view === 'epic'
            ? context.trans(
                model.groups.length === 1
                    ? 'board.group_count_one'
                    : 'board.group_count_many',
                { count: model.groups.length }
            )
            : context.trans('board.single_board_count');
        context.counter.textContent = `${issueCount} · ${groupCount}`;

        board.innerHTML = '';
        board.classList.toggle('is-grouped', state.view === 'epic');
        const columnsWidth = Array.from(
            { length: Math.max(model.columns.length, 1) },
            () => 'var(--workflow-column-width)'
        ).join(' + ');
        board.style.setProperty(
            '--workflow-min-width',
            `calc(30px + ${columnsWidth} + ${
                Math.max(model.columns.length - 1, 0) * 9
            }px)`
        );

        if (!model.groups.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            const title = document.createElement('strong');
            const help = document.createElement('span');
            title.textContent = context.trans('board.no_issue_title');
            help.textContent = context.trans('board.no_issue_help');
            empty.append(title, help);
            board.append(empty);
            context.updateToggleAllEpics();
            return;
        }

        const columnsToReveal = [];

        model.groups.forEach(group => {
            const groupElement = document.createElement('section');
            const id = groupId(group);
            const isCollapsible = state.view === 'epic';
            const isCollapsed = isCollapsible
                && state.collapsedEpicIds.has(id);
            groupElement.className = 'board-group';
            groupElement.dataset.groupId = id;
            groupElement.classList.toggle('is-collapsed', isCollapsed);
            groupElement.style.setProperty(
                '--epic-color',
                group.epic ? epicColor(group.epic) : '#64748b'
            );

            const header = createGroupHeader(
                context,
                group,
                sprintLabel,
                isCollapsible,
                isCollapsed
            );
            const workflow = document.createElement('div');
            workflow.className = 'workflow-board';
            workflow.hidden = isCollapsed;
            workflow.id = `epic-workflow-${encodeURIComponent(id)}`;
            header.querySelector('.group-collapse')
                ?.setAttribute('aria-controls', workflow.id);
            header.setAttribute('aria-controls', workflow.id);
            header.setAttribute('aria-expanded', String(!isCollapsed));

            if (isCollapsible) {
                const toggleGroup = () => {
                    context.setEpicCollapsed(
                        groupElement,
                        !groupElement.classList.contains('is-collapsed')
                    );
                    context.saveCollapsedEpics();
                    context.updateToggleAllEpics();
                };
                header.classList.add('is-collapsible');
                header.addEventListener('click', toggleGroup, {
                    signal: context.signal
                });
                const groupTitle = header.querySelector('.board-group-title');
                groupTitle?.addEventListener('click', event => {
                    if (event.ctrlKey || event.metaKey) {
                        event.stopPropagation();
                    } else {
                        event.preventDefault();
                    }
                }, { signal: context.signal });
                groupTitle?.addEventListener('auxclick', event => {
                    event.preventDefault();
                }, { signal: context.signal });
            }

            let firstPopulatedColumn = null;

            model.columns.forEach(column => {
                const wrapper = document.createElement('section');
                wrapper.className = 'column';
                wrapper.dataset.columnName = column.name;
                context.enableDropZone(wrapper, column, workflow);
                const head = document.createElement('div');
                head.className = 'column-head';
                const title = document.createElement('span');
                title.className = 'column-title';
                title.textContent = column.name;
                const columnIssues = group.issues.filter(issue =>
                    model.statusToColumn.get(
                        String(issue.fields?.status?.id)
                    )?.name === column.name
                );
                const count = document.createElement('span');
                count.className = 'column-count';
                count.textContent = columnIssues.length;
                head.append(title, count);
                wrapper.append(head);

                if (columnIssues.length && !firstPopulatedColumn) {
                    firstPopulatedColumn = wrapper;
                }

                columnIssues.forEach(issue => {
                    wrapper.append(context.createCard(
                        issue,
                        isCollapsible
                            ? null
                            : context.epicForIssue(issue, model.epics)
                    ));
                });
                workflow.append(wrapper);
            });

            groupElement.append(header, workflow);
            board.append(groupElement);

            if (firstPopulatedColumn) {
                columnsToReveal.push({ workflow, firstPopulatedColumn });
            }
        });

        context.updateToggleAllEpics();
        renderFrame = window.requestAnimationFrame(() => {
            renderFrame = null;
            if (revealFirstIssue && columnsToReveal.length) {
                const { workflow, firstPopulatedColumn } = columnsToReveal[0];

                if (state.view !== 'epic') {
                    workflow.scrollTo({
                        left: Math.max(
                            0,
                            firstPopulatedColumn.offsetLeft - workflow.offsetLeft
                        ),
                        behavior: 'smooth'
                    });
                } else {
                    const boardBounds = board.getBoundingClientRect();
                    const columnBounds =
                        firstPopulatedColumn.getBoundingClientRect();
                    board.scrollTo({
                        left: Math.max(
                            0,
                            board.scrollLeft + columnBounds.left
                                - boardBounds.left
                        ),
                        behavior: 'smooth'
                    });
                }
                return;
            }

            board.scrollTo({
                left: previousScrollLeft,
                top: previousScrollTop
            });
        });
    }

    return {
        render,
        destroy() {
            if (renderFrame !== null) {
                window.cancelAnimationFrame(renderFrame);
                renderFrame = null;
            }
        }
    };
}
