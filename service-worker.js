const APP_CACHE = 'mycanoe-app-v17';
const LEGACY_PACK_CACHE = 'mycanoe-offline-pack-v1';
const PACK_CACHE_PREFIX = 'mycanoe-offline-pack-v2-';
const ESRI_IMAGERY_HOST = 'server.arcgisonline.com';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa-icon.svg',
  './og.png',
  './owol_waterways_v2.json',
  './water_tiles/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(APP_SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok || response.type === 'opaque') await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, LEGACY_PACK_CACHE]);
    await Promise.all((await caches.keys()).filter((key) => key.startsWith('mycanoe-') && !keep.has(key) && !key.startsWith(PACK_CACHE_PREFIX)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cachedNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('./index.html', response.clone());
    return response;
  } catch (error) {
    // Cloudflare Pages redirects /index.html to /. A cached redirected response cannot
    // be returned to a navigation request, so prefer the non-redirected root response.
    return (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
  }
}

async function matchOfflinePack(request, options = {}) {
  const names = (await caches.keys()).filter((key) => key === LEGACY_PACK_CACHE || key.startsWith(PACK_CACHE_PREFIX)).reverse();
  for (const name of names) {
    const cached = await (await caches.open(name)).match(request, options);
    if (cached) return cached;
  }
  return null;
}

async function cachedData(request) {
  const cached = await matchOfflinePack(request, { ignoreSearch: true });
  if (!self.navigator.onLine && cached) return cached;
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

async function cachedSatellite(request) {
  const cached = await matchOfflinePack(request);
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (error) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(cachedNavigation(request));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.endsWith('/health.txt')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/diary/')) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith('/water_tiles/')) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
          await cache.put(request, response.clone());
          if (url.pathname.endsWith('/water_tiles/manifest.json')) {
            const manifest = await response.clone().json().catch(() => null);
            if (manifest && manifest.version) {
              const keys = await cache.keys();
              await Promise.all(keys.filter((key) => {
                const old = new URL(key.url);
                return /\/water_tiles\/[^/]+\.json$/.test(old.pathname) &&
                  !old.pathname.endsWith('/manifest.json') && old.searchParams.get('v') !== manifest.version;
              }).map((key) => cache.delete(key)));
            }
          }
        }
        return response;
      } catch (error) {
        return (await cache.match(request)) || Response.error();
      }
    })());
    return;
  }
  if (url.origin === self.location.origin && (/\/(protect_polygons|wlz|waterplay|rivers|roads|daiso_stores|hanaro_stores)\.geojson$/.test(url.pathname) || url.pathname.endsWith('/owol_waterways_v2.json'))) {
    event.respondWith(cachedData(request));
    return;
  }
  if (url.hostname === ESRI_IMAGERY_HOST && /\/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+$/.test(url.pathname)) {
    event.respondWith(cachedSatellite(request));
    return;
  }
  if (url.origin === self.location.origin || url.hostname === 'unpkg.com') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
