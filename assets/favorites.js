const STORAGE_KEY = 'jira-lite:favorite-boards';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'm12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 '
    + '5.6-.8z';

/**
 * Les favoris sont propres au navigateur : seuls les identifiants de board
 * sont conservés, dans le stockage local.
 */
export function readFavoriteBoards() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const values = raw ? JSON.parse(raw) : [];

        return new Set(Array.isArray(values) ? values.map(String) : []);
    } catch {
        return new Set();
    }
}

function writeFavoriteBoards(favorites) {
    try {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(Array.from(favorites))
        );
    } catch {
        // Stockage indisponible : on ignore silencieusement.
    }
}

export function toggleFavoriteBoard(boardId) {
    const id = String(boardId);
    const favorites = readFavoriteBoards();

    if (favorites.has(id)) {
        favorites.delete(id);
    } else {
        favorites.add(id);
    }

    writeFavoriteBoards(favorites);

    return favorites.has(id);
}

/**
 * Remonte les favoris en tête sans toucher à l'ordre existant :
 * `Array.prototype.sort` est stable, le tri alphabétique est donc conservé
 * à l'intérieur de chaque groupe.
 */
export function favoritesFirst(
    items,
    getId,
    favorites = readFavoriteBoards()
) {
    return items.slice().sort((first, second) =>
        Number(favorites.has(String(getId(second))))
        - Number(favorites.has(String(getId(first)))));
}

export function createStarIcon() {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('class', 'favorite-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', STAR_PATH);
    svg.append(path);

    return svg;
}

export function updateFavoriteButton(button, active, labels) {
    const label = active ? labels.remove : labels.add;

    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-pressed', String(active));
    button.title = label;
    button.setAttribute('aria-label', label);
}

export function createFavoriteButton({ boardId, labels, onToggle, signal }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-button';
    button.dataset.boardId = String(boardId);
    button.append(createStarIcon());
    updateFavoriteButton(
        button,
        readFavoriteBoards().has(String(boardId)),
        labels
    );

    button.addEventListener('click', event => {
        // Le bouton vit dans une option cliquable : on isole son clic.
        event.preventDefault();
        event.stopPropagation();

        const active = toggleFavoriteBoard(boardId);

        updateFavoriteButton(button, active, labels);
        onToggle?.(active);
    }, { signal });

    return button;
}
