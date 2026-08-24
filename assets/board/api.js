export async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json'
        },
        ...options
    });

    if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}
