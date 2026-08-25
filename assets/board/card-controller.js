export function connectCard(card, issue, context) {
    card.addEventListener('dragstart', event => {
        if (!card.classList.contains('is-selected')) {
            context.clearSelection();
            context.toggleSelection(card);
        }

        const sourceColumn = card.closest('.column');
        const issueByKey = new Map(
            (context.state.data.issues?.issues || [])
                .map(item => [item.key, item])
        );
        issueByKey.set(issue.key, issue);
        const cards = Array.from(
            sourceColumn.querySelectorAll('.card.is-selected')
        );
        const issues = cards
            .map(item => issueByKey.get(item.dataset.issueKey))
            .filter(Boolean);

        context.state.drag.issues = issues.length ? issues : [issue];
        context.state.drag.card = card;
        context.state.drag.cards = cards.length ? cards : [card];
        context.state.drag.workflow = card.closest('.workflow-board');
        context.state.drag.justDragged = true;
        context.state.drag.cards.forEach(item =>
            item.classList.add('is-dragging')
        );
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(
            'text/plain',
            context.state.drag.issues.map(item => item.key).join('\n')
        );
        context.beginDragValidation();
    }, { signal: context.signal });

    card.addEventListener('dragend', () => {
        context.state.drag.cards.forEach(item =>
            item.classList.remove('is-dragging')
        );
        context.clearDropTargets();
        context.endDragValidation();
        context.stopAutoScroll();
        context.state.drag.issues = [];
        context.state.drag.card = null;
        context.state.drag.cards = [];
        context.state.drag.workflow = null;

        context.schedule(() => {
            if (!context.signal.aborted) {
                context.state.drag.justDragged = false;
            }
        }, 120);
    }, { signal: context.signal });

    function activate(event) {
        if (context.state.drag.justDragged) {
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            context.toggleSelection(card);
            return;
        }

        context.clearSelection();
        context.openIssue(issue.key);
    }

    card.addEventListener('click', activate, { signal: context.signal });
    card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(event);
        }
    }, { signal: context.signal });

    return card;
}
