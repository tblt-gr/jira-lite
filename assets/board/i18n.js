let catalog = null;

function translations() {
    if (catalog !== null) {
        return catalog;
    }

    const source = document.querySelector('#board-translations');

    try {
        catalog = JSON.parse(source?.textContent || '{}');
    } catch (error) {
        console.error('Invalid frontend translation catalog.', error);
        catalog = {};
    }

    return catalog;
}

export function trans(key, parameters = {}) {
    let message = translations()[key] || key;

    Object.entries(parameters).forEach(([name, value]) => {
        message = message
            .replaceAll(`{${name}}`, String(value))
            .replaceAll(`%${name}%`, String(value));
    });

    return message;
}
