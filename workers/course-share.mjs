export function normalizeCourseShareId(value) {
  const id = String(value || "").trim();
  return /^(?:k[0-9]{8,24}|[0-9]{1,12})$/.test(id) ? id : "";
}

export function coursePreviewKey(id) {
  const safe = normalizeCourseShareId(id);
  return safe ? "course_preview:" + safe : "";
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function courseShareHtml({ id, name, km, shareUrl, targetUrl, imageUrl }) {
  const safeId = normalizeCourseShareId(id);
  if (!safeId) return "";
  const titleName = String(name || "카누맵 코스").trim().slice(0, 100) || "카누맵 코스";
  const distance = Number(km);
  const distanceText = Number.isFinite(distance) && distance > 0
    ? "약 " + (Math.round(distance * 100) / 100) + "km"
    : "전체 코스 지도";
  const title = titleName + " · " + distanceText + " | 카누맵";
  const description = "출발점부터 도착점까지 전체 코스를 지도에서 확인하세요.";
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
<p><a href="${esc(targetUrl)}">카누맵에서 ${esc(titleName)} 열기</a></p>
<script>location.replace(${JSON.stringify(String(targetUrl))});<\/script>
</body></html>`;
}
