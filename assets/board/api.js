import { trans } from './i18n.js';

export async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json'
        },
        ...options
    });

    if (!response.ok) {
        let details = null;

        try {
            details = await response.json();
        } catch {
            // Certaines erreurs du proxy n'ont pas de corps JSON.
        }

        const fieldErrors = details?.errors
            ? Object.values(details.errors).filter(Boolean).join(' · ')
            : '';
        const message = details?.error
            || details?.errorMessages?.filter(Boolean).join(' · ')
            || fieldErrors
            || trans('api.http_error', { status: response.status });

        throw new Error(message);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}
