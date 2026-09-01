export function issueViewUrl(issueKey) {
    const key = String(issueKey || '').trim();

    return key ? `/browse/${encodeURIComponent(key)}` : null;
}
