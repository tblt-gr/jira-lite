import { trans } from './i18n.js';

export async function api(url, options = {}) {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});

    if (!headers.has('Content-Type') && method !== 'GET') {
        headers.set('Content-Type', 'application/json');
    }

    if (method !== 'GET' && method !== 'HEAD') {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')
            ?.content ?? '';

        headers.set('X-CSRF-Token', csrfToken);
    }

    const response = await fetch(url, {
        ...options,
        headers
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

export function createApi(baseUrl = '/api/jira') {
    const normalizedBaseUrl = String(baseUrl || '/api/jira')
        .replace(/\/+$/, '');

    return (path, options = {}) => api(
        `${normalizedBaseUrl}/${String(path).replace(/^\/+/, '')}`,
        options
    );
}
