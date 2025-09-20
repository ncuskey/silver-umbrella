/**
 * Minimal offline-aware service worker.
 * Ensures analytics and API calls always hit the network.
 */

const RUNTIME_CACHE = 'runtime-v1';
const ANALYTICS_HOSTS = new Set(['static.cloudflareinsights.com']);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
// Version: sw-v-lt-local-1
// navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  const isAnalytics = ANALYTICS_HOSTS.has(url.hostname);
  const isSameOriginApi = url.origin === self.location.origin && url.pathname.startsWith('/api/');

  if (isAnalytics || isSameOriginApi) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(handleRuntimeRequest(request));
});

async function handleRuntimeRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (shouldCacheResponse(request, response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

function shouldCacheResponse(request, response) {
  if (request.method !== 'GET') return false;
  if (!response || !response.ok) return false;
  if (!response.type || (response.type !== 'basic' && response.type !== 'cors')) return false;
  const url = new URL(request.url);
  if (ANALYTICS_HOSTS.has(url.hostname)) return false;
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return false;
  return true;
}
