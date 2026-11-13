import { renderRoutePreview } from './route-preview-png.mjs';
import { STATIC_PREVIEW_COURSES, STATIC_PREVIEW_TRAILS } from './static-route-geometry.mjs';
import { normalizeExpedition } from './expedition.mjs';
import { applyCourseCorrection } from './course-corrections.mjs';

const assetCache = new Map();
export function parseCombinedRefs(value) {
  const parts = String(value || '').split(',');
  if (!parts.length || parts.some((ref) => !/^(course|trail):[a-zA-Z0-9_-]{1,100}$/.test(ref)))
    return null;
  return [...new Set(parts)];
}
async function asset(site, path) {
  const url = new URL(path, site).href;
  const previous = assetCache.get(url);
  if (previous && Date.now() - previous.time < 300000) return previous.promise;
  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error('asset-unavailable');
      return response.json();
    })
    .catch((error) => {
      assetCache.delete(url);
      throw error;
    });
  assetCache.set(url, { time: Date.now(), promise });
  return promise;
}
function linesOf(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return null;
}
function distance(lines) {
  let km = 0;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const [x, y] = line[i - 1],
        [xx, yy] = line[i];
      const rad = Math.PI / 180;
      const a =
        Math.sin(((yy - y) * rad) / 2) ** 2 +
        Math.cos(y * rad) * Math.cos(yy * rad) * Math.sin(((xx - x) * rad) / 2) ** 2;
      km += 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
    }
  return km;
}
function record(ref, value, geometry, designatedKm) {
  const lines = linesOf(geometry);
  if (
    !lines?.length ||
    lines.some(
      (line) =>
        !Array.isArray(line) ||
        line.length < 2 ||
        line.some(
          (p) =>
            !Array.isArray(p) ||
            !Number.isFinite(p[0]) ||
            !Number.isFinite(p[1]) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 85
        )
    )
  )
    throw new Error('invalid-route');
  const km = Number(designatedKm ?? value.km);
  return {
    ref,
    name: String(value.name || '코스').slice(0, 100),
    kind: ref.startsWith('trail:') || value.travelMode === 'land' ? '육로' : '물길',
    color: value.color || '',
    km: Number.isFinite(km) && km > 0 ? km : distance(lines),
    lines
  };
}
export async function combinedPreviewRecords(env, refs) {
  const read = async (key, fallback) => JSON.parse((await env.PLACES?.get(key)) || fallback);
  const [courses, obstacles, over, hidden] = await Promise.all([
    read('courses', '[]'),
    read('obstacles', '[]'),
    read('course_over', '{}'),
    read('course_hidden', '[]')
  ]);
  const result = [],
    missing = [];
  for (const ref of refs) {
    try {
      const split = ref.indexOf(':'),
        kind = ref.slice(0, split),
        id = ref.slice(split + 1);
      if (kind === 'trail') {
        const stored = obstacles.find((o) => String(o.id) === id || String(o.id) === 'trail:' + id);
        if (stored?.del || (stored && stored.type !== '육로')) throw new Error('route-not-found');
        const seed = STATIC_PREVIEW_TRAILS[id];
        const value = { ...seed, ...stored };
        const geometry = stored?.geometry || seed?.geometry;
        const official = seed && JSON.stringify(geometry) === JSON.stringify(seed.geometry);
        result.push(record(ref, value, geometry, official ? seed.designatedDistanceKm : undefined));
      } else if (id.startsWith('k')) {
        const raw = courses.find((c) => String(c.id) === id.slice(1));
        if (!raw || raw.del) throw new Error('route-not-found');
        const course = normalizeExpedition(applyCourseCorrection(raw), id);
        result.push(
          record(ref, course, {
            type: 'LineString',
            coordinates: (course.coords || []).map((p) => [Number(p[1]), Number(p[0])])
          })
        );
      } else {
        if (hidden.some((x) => String(x) === id)) throw new Error('route-not-found');
        const feature = STATIC_PREVIEW_COURSES[id];
        if (!feature) throw new Error('route-not-found');
        const patch = over[id] || {},
          value = normalizeExpedition({ ...feature, ...patch, id, static: true }, id);
        const geometry = patch.coords
          ? {
              type: 'LineString',
              coordinates: patch.coords.map((p) => [Number(p[1]), Number(p[0])])
            }
          : feature.geometry;
        result.push(record(ref, value, geometry));
      }
    } catch (error) {
      if (['route-not-found', 'invalid-route'].includes(error.message)) missing.push(ref);
      else throw error;
    }
  }
  return { records: result, missing };
}
export async function combinedPreviewVersion(records, missing = []) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('combined-map-v1\n' + JSON.stringify({ records, missing }))
  );
  return [...new Uint8Array(bytes)]
    .slice(0, 10)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function combinedPreviewContext(env) {
  try {
    return (await asset(env.SITE_URL || 'https://canoe.crowdbase.kr/', 'rivers.geojson')).features;
  } catch {
    return [];
  }
}
const imageCache = new Map();
export function combinedPreviewImage(env, records, version) {
  const prior = imageCache.get(version);
  if (prior && Date.now() - prior.time < 300000) return prior.promise;
  const promise = combinedPreviewContext(env).then((context) =>
    renderRoutePreview(records, context)
  );
  imageCache.set(version, { time: Date.now(), promise });
  if (imageCache.size > 8) imageCache.delete(imageCache.keys().next().value);
  promise.catch(() => {
    if (imageCache.get(version)?.promise === promise) imageCache.delete(version);
  });
  return promise;
}
function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
export function combinedShareHtml({ records, missing = [], shareUrl, targetUrl, imageUrl }) {
  const name = records.map((r) => r.name).join(' + ');
  const total = records.reduce((sum, r) => sum + r.km, 0).toFixed(2);
  const title =
    name.slice(0, 230) +
    (missing.length
      ? ' · ' + records.length + '/' + (records.length + missing.length) + '개 구간 표시'
      : '') +
    ' · ' +
    total +
    'km | 카누맵';
  const description = records
    .map((r, i) => `${i + 1}. ${r.kind} ${r.name} ${r.km.toFixed(2)}km`)
    .join(' · ')
    .slice(0, 500);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:url" content="${esc(shareUrl)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(imageUrl)}"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=${esc(targetUrl)}"></head><body><a href="${esc(targetUrl)}">${esc(name)} 전체 코스 열기</a><script>location.replace(${JSON.stringify(targetUrl).replace(/</g, '\\u003c')})</script></body></html>`;
}
