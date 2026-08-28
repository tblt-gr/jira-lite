import { createAvatar } from './dom.js';

function createUnassignedAvatar() {
    const avatar = document.createElement('span');
    avatar.className = 'assignee-filter-avatar assignee-filter-unassigned';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '?';

    return avatar;
}

// Compact multi-select: only avatars are visible, names remain accessible.
export function createAssigneeFilter({ container, selected, onChange, signal }) {
    function createButton(option, stackOrder) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'assignee-filter-button';
        button.dataset.assigneeId = option.id;
        button.style.zIndex = String(stackOrder);
        button.title = option.name;
        button.setAttribute('aria-label', option.name);

        const avatar = option.user
            ? createAvatar(option.user, 24, 'assignee-filter-avatar')
            : createUnassignedAvatar();

        button.append(avatar);
        button.addEventListener('click', () => {
            if (selected.has(option.id)) {
                selected.delete(option.id);
            } else {
                selected.add(option.id);
            }

            update();
            onChange();
        }, { signal });

        return button;
    }

    function update() {
        container.querySelectorAll('[data-assignee-id]').forEach(button => {
            const active = selected.has(button.dataset.assigneeId);
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function setOptions(options) {
        container.replaceChildren(...options.map((option, index) =>
            createButton(option, options.length - index)
        ));
        container.hidden = options.length === 0;
        update();
    }

    setOptions([]);

    return { setOptions, update };
}
