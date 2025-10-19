export function normalizeProxyUrl(url) {
    if (!url) {
        return '';
    }
    let normalizedUrl = url.trim();
    while (normalizedUrl.endsWith('/')) {
        normalizedUrl = normalizedUrl.slice(0, -1);
    }
    return normalizedUrl ? normalizedUrl + '/' : '';
}
