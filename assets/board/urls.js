export function issueViewUrl(issueKey, boardId = null) {
    const key = String(issueKey || '').trim();

    if (!key) {
        return null;
    }

    const url = `/browse/${encodeURIComponent(key)}`;
    const numericBoardId = Number(boardId);

    return Number.isInteger(numericBoardId) && numericBoardId > 0
        ? `${url}?board=${numericBoardId}`
        : url;
}
