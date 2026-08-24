const STORAGE_KEY = 'jira-lite-theme';

function selectedTheme() {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);

        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
    } catch {
        // Le thème par défaut reste disponible sans stockage local.
    }

    return 'dark';
}

function updateToggle(button, theme) {
    const targetTheme = theme === 'dark' ? 'light' : 'dark';
    const label = targetTheme === 'light'
        ? 'Activer le thème clair'
        : 'Activer le thème sombre';

    button.querySelectorAll('[data-theme-icon]').forEach(icon => {
        icon.hidden = icon.dataset.themeIcon !== targetTheme;
    });
    button.setAttribute('aria-label', label);
    button.title = label;
}

function applyTheme(theme) {
    const selected = theme === 'light' ? 'light' : 'dark';

    document.documentElement.dataset.theme = selected;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        updateToggle(button, selected);
    });

    try {
        window.localStorage.setItem(STORAGE_KEY, selected);
    } catch {
        // Le changement reste actif pour la page courante.
    }
}

export function mountGlobalTheme() {
    applyTheme(selectedTheme());

    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            applyTheme(
                document.documentElement.dataset.theme === 'dark'
                    ? 'light'
                    : 'dark'
            );
        });
    });
}
