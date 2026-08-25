import { api } from './api.js';
import { canonicalEpicId } from './jira.js';
import { replaceIssues } from './board-model.js';

export function createIssueRefresher(context) {
    let cursor = new Date().toISOString();
    let requestController = null;
    let refreshing = false;
    let destroyed = false;

    async function refresh() {
        if (
            destroyed
            || !context.state.data
            || refreshing
            || document.hidden
        ) {
            return;
        }

        refreshing = true;
        requestController = new AbortController();

        try {
            const changes = await api(
                `/api/jira/board/${context.boardId}/changes?since=${
                    encodeURIComponent(cursor)
                }`,
                { signal: requestController.signal }
            );
            const changedIssues = Array.isArray(changes.issues)
                ? changes.issues
                : [];
            const removedKeys = Array.isArray(changes.removed)
                ? changes.removed.map(String)
                : [];

            cursor = changes.cursor || new Date().toISOString();

            if (!changedIssues.length && !removedKeys.length) {
                return;
            }

            context.state.data.issues.issues = replaceIssues(
                context.state.data.issues?.issues,
                changedIssues,
                removedKeys
            );

            const allowedEpicIds = new Set(
                context.availableEpics().map(canonicalEpicId)
            );
            context.state.selectedEpicIds = new Set(
                Array.from(context.state.selectedEpicIds)
                    .filter(id => allowedEpicIds.has(id))
            );

            context.renderEpics();
            context.writeEpicsToUrl(true);
            context.renderBoard(false);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(context.trans('refresh.error_log'), error);
                context.onError?.(context.trans('refresh.failed'));
            }
        } finally {
            refreshing = false;
            requestController = null;
        }
    }

    return {
        refresh,
        setCursor(value) {
            cursor = value || cursor;
        },
        destroy() {
            destroyed = true;
            requestController?.abort();
        }
    };
}
