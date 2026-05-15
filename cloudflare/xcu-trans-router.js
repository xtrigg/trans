const PAGES_ORIGIN = 'https://trans-c2s.pages.dev';

function getUpstreamUrl(requestUrl) {
  const url = new URL(requestUrl);
  const upstream = new URL(PAGES_ORIGIN);
  upstream.search = url.search;

  if (url.pathname === '/trans' || url.pathname === '/trans/') {
    upstream.pathname = '/realtime-translation-poc';
    return upstream;
  }

  if (url.pathname.startsWith('/trans/')) {
    const strippedPath = url.pathname.slice('/trans'.length);
    upstream.pathname = strippedPath === '/realtime-translation-poc.html'
      ? '/realtime-translation-poc'
      : strippedPath;
    return upstream;
  }

  if (
    url.pathname === '/api-proxy/api/openai/realtime-translation/session'
    || url.pathname === '/api-proxy/api/openai/reply-translation'
    || url.pathname === '/api-proxy/api/openai/reply-speech'
    || url.pathname === '/api-proxy/api/openai/text-translation'
  ) {
    upstream.pathname = url.pathname;
    return upstream;
  }

  return null;
}

export default {
  async fetch(request) {
    const upstream = getUpstreamUrl(request.url);
    if (!upstream) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers(request.headers);
    headers.delete('host');

    return fetch(upstream, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual'
    });
  }
};

export { getUpstreamUrl };
