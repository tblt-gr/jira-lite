const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createChevron() {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('class', 'filter-chevron');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', 'm5 7.5 5 5 5-5');
    svg.append(path);

    return svg;
}

/**
 * Liste déroulante multi-sélection générique de la barre d'outils.
 * `labels` fournit les libellés déjà traduits, `selected` est le Set
 * d'identifiants partagé avec l'état du board.
 */
export function createMultiSelect({
    container,
    labels,
    selected,
    onChange,
    signal
}) {
    container.classList.add('filter-multiselect');
    container.replaceChildren();

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'filter-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = labels.all;

    const count = document.createElement('span');
    count.className = 'filter-count';

    trigger.append(label, count, createChevron());

    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-multiselectable', 'true');
    menu.hidden = true;

    container.append(trigger, menu);

    let options = [];

    function close(focusTrigger = false) {
        if (menu.hidden) {
            return;
        }

        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        container.classList.remove('is-open');

        if (focusTrigger) {
            trigger.focus();
        }
    }

    function update() {
        const chosen = options.filter(option => selected.has(option.id));

        menu.querySelectorAll('[data-filter-value]').forEach(node => {
            const checked = selected.has(node.dataset.filterValue);
            const input = node.querySelector('input');

            node.classList.toggle('is-selected', checked);
            node.setAttribute('aria-selected', String(checked));

            if (input) {
                input.checked = checked;
            }
        });

        const clearButton = menu.querySelector('.filter-clear');

        if (clearButton) {
            clearButton.disabled = selected.size === 0;
        }

        if (!chosen.length) {
            label.textContent = labels.all;
            count.textContent = '';
        } else if (chosen.length === 1) {
            label.textContent = chosen[0].name;
            count.textContent = '1';
        } else {
            label.textContent = labels.selected(chosen.length);
            count.textContent = chosen.length;
        }
    }

    function change() {
        update();
        onChange();
    }

    function toggleValue(id) {
        if (selected.has(id)) {
            selected.delete(id);
        } else {
            selected.add(id);
        }

        change();
    }

    function createOption(option) {
        const node = document.createElement('label');
        node.className = 'filter-option';
        node.dataset.filterValue = option.id;
        node.setAttribute('role', 'option');
        node.tabIndex = 0;

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = option.id;
        input.tabIndex = -1;

        const mark = document.createElement('span');
        mark.className = 'filter-option-mark';

        if (option.iconUrl) {
            const icon = document.createElement('img');
            icon.className = 'filter-option-icon';
            icon.src = option.iconUrl;
            icon.alt = '';
            mark.append(icon);
        }

        const name = document.createElement('span');
        name.textContent = option.name;

        const badge = document.createElement('span');
        badge.className = 'filter-option-count';
        badge.textContent = option.count ?? '';

        node.append(input, mark, name, badge);

        input.addEventListener('change', () => {
            toggleValue(option.id);
        }, { signal });

        node.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                input.click();
            }
        }, { signal });

        return node;
    }

    function setOptions(nextOptions) {
        options = nextOptions;
        menu.replaceChildren();

        const head = document.createElement('div');
        head.className = 'filter-menu-head';

        const title = document.createElement('span');
        title.textContent = labels.title;

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'filter-clear';
        clearButton.textContent = labels.clear;
        clearButton.addEventListener('click', event => {
            event.stopPropagation();
            selected.clear();
            change();
        }, { signal });

        head.append(title, clearButton);
        menu.append(head);

        options.forEach(option => menu.append(createOption(option)));

        if (!options.length) {
            const empty = document.createElement('div');
            empty.className = 'filter-empty';
            empty.textContent = labels.empty;
            menu.append(empty);
        }

        update();
    }

    trigger.addEventListener('click', event => {
        event.stopPropagation();
        const shouldOpen = menu.hidden;

        menu.hidden = !shouldOpen;
        trigger.setAttribute('aria-expanded', String(shouldOpen));
        container.classList.toggle('is-open', shouldOpen);
    }, { signal });

    document.addEventListener('click', event => {
        if (!container.contains(event.target)) {
            close();
        }
    }, { signal });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            close(true);
        }
    }, { signal });

    setOptions([]);

    return { setOptions, update, close };
}
