// SNT PDF Annotator v3.19 — student PDF cache isolation
// Student PDF requests used the same Edge Function URL for every document and
// differed only by the x-viewer-token request header. Browser/PDF.js caching
// can therefore reuse a PDF from a previously opened student link. Give every
// page load its own harmless cache key on PDF requests only.
(() => {
  if (document.body?.dataset?.mode !== 'student') return;

  const sessionKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  function keyedUrl(value) {
    try {
      const raw = value instanceof Request ? value.url : String(value);
      const u = new URL(raw, location.href);
      if (u.searchParams.get('action') === 'pdf' && u.pathname.includes('/functions/v1/')) {
        u.searchParams.set('snt_pdf_session', sessionKey);
        return u.toString();
      }
    } catch {}
    return value instanceof Request ? value.url : value;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const nextUrl = keyedUrl(input);
    if (input instanceof Request) {
      return nativeFetch(new Request(nextUrl, input), init);
    }
    return nativeFetch(nextUrl, init);
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeOpen.call(this, method, keyedUrl(url), ...rest);
  };
})();
