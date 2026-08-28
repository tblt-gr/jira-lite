import { epicLabel } from './jira.js';

export function createIssueCreator(context) {
    const {
        root,
        boardId,
        trans,
        showToast,
        onCreated,
        getEpics,
        signal,
        api
    } = context;
    const trigger = root.querySelector('#create-issue');
    const dialog = root.querySelector('#create-issue-dialog');
    const form = root.querySelector('#create-issue-form');
    const issueType = root.querySelector('#create-issue-type');
    const summary = root.querySelector('#create-summary');
    const sprint = root.querySelector('#create-sprint');
    const epic = root.querySelector('#create-epic');
    const submit = root.querySelector('#submit-create-issue');
    const errorMessage = root.querySelector('#create-form-error');
    const defaultSubmitLabel = submit.textContent;
    let metadata = null;
    let metadataRequest = null;
    let submitting = false;

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
    }

    function clearError() {
        errorMessage.textContent = '';
        errorMessage.hidden = true;
    }

    function populateEpics(selectedEpic = null) {
        const candidates = getEpics?.();
        const epics = Array.isArray(candidates) ? candidates : [];
        const selectedKey = String(selectedEpic?.key || '');
        const catalog = selectedKey && !epics.some(item =>
            String(item?.key || '') === selectedKey
        )
            ? [...epics, selectedEpic]
            : epics;

        epic.replaceChildren();
        const withoutEpic = document.createElement('option');
        withoutEpic.value = '';
        withoutEpic.textContent = trans('create.without_epic');
        epic.append(withoutEpic);

        catalog.forEach(item => {
            const key = String(item?.key || '');

            if (!key) {
                return;
            }

            const label = epicLabel(item, key);
            const option = document.createElement('option');
            option.value = key;
            option.textContent = [key, label]
                .filter((value, index, values) =>
                    value && values.indexOf(value) === index
                )
                .join(' · ');
            epic.append(option);
        });

        epic.value = selectedKey;
    }

    function populateMetadata(response) {
        metadata = response;
        const issueTypes = Array.isArray(response.issueTypes)
            ? response.issueTypes
            : [];
        const sprints = Array.isArray(response.sprints)
            ? response.sprints
            : [];

        issueType.replaceChildren();

        issueTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = type.name;
            issueType.append(option);
        });

        const defaultIssueType = issueTypes.find(type =>
            ['tâche', 'tache', 'task'].includes(
                String(type.name || '').trim().toLocaleLowerCase()
            )
        );

        if (defaultIssueType) {
            issueType.value = defaultIssueType.id;
        }

        sprint.replaceChildren();
        const backlog = document.createElement('option');
        backlog.value = '';
        backlog.textContent = trans('create.backlog');
        sprint.append(backlog);

        sprints.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            sprint.append(option);
        });

        if (sprints.length) {
            sprint.value = sprints[0].id;
        }

        issueType.disabled = !issueTypes.length;
        submit.disabled = !issueTypes.length;

        if (!issueTypes.length) {
            showError(trans('create.no_issue_type'));
            return;
        }

        if (dialog.open) {
            summary.focus();
        }
    }

    async function loadMetadata() {
        if (metadata) {
            populateMetadata(metadata);
            return;
        }

        metadataRequest?.abort();
        metadataRequest = new AbortController();
        issueType.disabled = true;
        submit.disabled = true;

        try {
            const response = await api(
                `/board/${boardId}/create-metadata`,
                { signal: metadataRequest.signal }
            );
            populateMetadata(response);
        } catch (error) {
            if (error.name !== 'AbortError') {
                showError(error.message);
            }
        } finally {
            metadataRequest = null;
        }
    }

    function close() {
        if (submitting) {
            return;
        }

        dialog.close();
    }

    function open({ epic: selectedEpic = null } = {}) {
        form.reset();
        clearError();
        populateEpics(selectedEpic);
        dialog.showModal();
        loadMetadata();
    }

    trigger.addEventListener('click', () => open(), { signal });
    root.querySelector('#close-create-dialog')
        .addEventListener('click', close, { signal });
    dialog.addEventListener('click', event => {
        if (event.target === dialog) {
            close();
        }
    }, { signal });
    dialog.addEventListener('cancel', event => {
        if (submitting) {
            event.preventDefault();
        }
    }, { signal });

    form.addEventListener('submit', async event => {
        event.preventDefault();

        if (submitting || !form.reportValidity()) {
            return;
        }

        submitting = true;
        clearError();
        submit.disabled = true;
        submit.textContent = trans('create.submitting');
        const data = new FormData(form);

        try {
            const issue = await api(`/board/${boardId}/issues`, {
                method: 'POST',
                body: JSON.stringify({
                    issueTypeId: data.get('issueTypeId'),
                    summary: data.get('summary'),
                    description: data.get('description'),
                    sprintId: data.get('sprintId'),
                    epicKey: data.get('epicKey')
                })
            });

            dialog.close();
            form.reset();
            showToast(trans('create.created', { key: issue.key }), 'success');
            await onCreated(issue, {
                epicKey: String(data.get('epicKey') || ''),
                sprintId: String(data.get('sprintId') || '')
            });
        } catch (error) {
            showError(error.message);
        } finally {
            submitting = false;
            submit.textContent = defaultSubmitLabel;
            submit.disabled = !metadata?.issueTypes?.length;
        }
    }, { signal });

    return {
        open,
        destroy() {
            metadataRequest?.abort();
            if (dialog.open) {
                dialog.close();
            }
        }
    };
}
