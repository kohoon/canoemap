function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function normalizeRiverShare(value) {
  const name = String(value?.name || '').trim().slice(0, 80);
  const lat = Number(value?.lat), lng = Number(value?.lng);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { name, lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}

export async function riverShareId(record) {
  const input = `river-v1\n${record.name}\n${record.lat.toFixed(5)},${record.lng.toFixed(5)}`;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return 'r' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export function riverShareHtml({ name, shareUrl, targetUrl, imageUrl }) {
  const title = `${name} 전체 물줄기 | 카누맵`;
  const description = `${name} 물줄기를 지도에서 확인하세요.`;
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex,nofollow">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<meta http-equiv="refresh" content="0;url=${esc(targetUrl)}">
</head><body>
<p><a href="${esc(targetUrl)}">카누맵에서 ${esc(name)} 물줄기 열기</a></p>
<script>location.replace(${JSON.stringify(String(targetUrl))});<\/script>
</body></html>`;
}
