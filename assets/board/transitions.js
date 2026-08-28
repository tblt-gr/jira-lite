const CACHE_TTL = 60000;

function issueCacheKey(issue) {
    return `${issue.key}:${issue.fields?.status?.id || ''}`;
}

function intersect(sets) {
    return sets.reduce((allowed, ids) => new Set(
        Array.from(allowed).filter(id => ids.has(id))
    ));
}

export function createTransitionCache(api) {
    const entries = new Map();

    function reachableStatusIds(issue) {
        const key = issueCacheKey(issue);
        const cached = entries.get(key);

        if (cached && cached.expiresAt > Date.now()) {
            return cached.promise;
        }

        const promise = api(
            `/issue/${encodeURIComponent(issue.key)}/transitions`
        ).then(response => new Set(
            (response.transitions || [])
                .map(transition => String(transition.to?.id || ''))
                .filter(Boolean)
        ));

        promise.catch(() => entries.delete(key));
        entries.set(key, {
            promise,
            expiresAt: Date.now() + CACHE_TTL
        });

        return promise;
    }

    return {
        /**
         * Statuts atteignables par tous les tickets fournis, ou null quand
         * l'information n'a pas pu être obtenue (on reste alors permissif).
         */
        async allowedStatusIds(issues) {
            if (!issues.length) {
                return null;
            }

            try {
                return intersect(await Promise.all(
                    issues.map(reachableStatusIds)
                ));
            } catch {
                return null;
            }
        },
        forget(issue) {
            entries.delete(issueCacheKey(issue));
        },
        clear() {
            entries.clear();
        }
    };
}
