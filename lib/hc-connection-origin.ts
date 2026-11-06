// Next's internal Request URL can use localhost in development. The Host header
// is the authority the browser actually addressed; a browser cannot override it.
export function allowedHcConnectionOrigin(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const expected = new URL(`${requestUrl.protocol}//${request.headers.get('host') || requestUrl.host}`);
    return request.headers.get('origin') === expected.origin &&
      (expected.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname));
  } catch { return false; }
}
