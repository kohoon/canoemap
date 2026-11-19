const esc = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function placeShareHtml({place, shareUrl, targetUrl, imageUrl}) {
  const title = `${place.name || '런칭·랜딩지'} | 카누맵`;
  const description = '카누를 타고 내릴 수 있는 장소의 위치를 지도에서 확인하세요.';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:url" content="${esc(shareUrl)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}"><meta property="og:image:secure_url" content="${esc(imageUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(imageUrl)}"></head>
<body><a href="${esc(targetUrl)}">${esc(place.name)} 지도에서 열기</a><script>location.replace(${JSON.stringify(targetUrl).replace(/</g,'\\u003c')})</script></body></html>`;
}
