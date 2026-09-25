const KOREA_BOUNDS = { minLat: 32, maxLat: 40, minLng: 123, maxLng: 132 };

export function validLandOwnershipPoint(lat, lng) {
  const y = Number(lat), x = Number(lng);
  return Number.isFinite(y) && Number.isFinite(x)
    && y >= KOREA_BOUNDS.minLat && y <= KOREA_BOUNDS.maxLat
    && x >= KOREA_BOUNDS.minLng && x <= KOREA_BOUNDS.maxLng;
}

export function classifyLandOwner(code, name) {
  const c = String(code || "").padStart(2, "0"), n = String(name || "").trim();
  if (c === "02" || n === "국유지") return { category: "national", label: "국유지" };
  if (c === "04" || c === "05" || /시[,. ]*도유지|군유지|공유지/.test(n)) {
    return { category: "public", label: "지자체 소유" };
  }
  if (["00", "01", "03", "06", "07", "08", "09"].includes(c)
      || /^(개인|법인|종중|종교단체|기타단체|외국인)/.test(n)) {
    return { category: "private", label: "사유지" };
  }
  return { category: "unknown", label: "확인 불가" };
}

function firstFeature(data) {
  const fc = data && data.response && data.response.result && data.response.result.featureCollection;
  const features = fc && Array.isArray(fc.features) ? fc.features : [];
  return features[0] || null;
}

function firstLedger(data) {
  const box = data && data.ladfrlVOList;
  const rows = box && box.ladfrlVOList;
  if (Array.isArray(rows)) return rows[0] || null;
  return rows && typeof rows === "object" ? rows : null;
}

function safeGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  try { return JSON.stringify(geometry).length <= 450000 ? geometry : null; }
  catch (e) { return null; }
}

export function normalizeLandOwnership(parcelData, ledgerData) {
  const feature = firstFeature(parcelData), ledger = firstLedger(ledgerData);
  const props = feature && feature.properties || {};
  const pnu = String((ledger && ledger.pnu) || props.pnu || "");
  if (!feature || !ledger || !/^[0-9]{19}$/.test(pnu)) return null;
  const owner = classifyLandOwner(ledger.posesnSeCode, ledger.posesnSeCodeNm);
  const area = Number(ledger.lndpclAr || ledger.ndpclAr);
  return {
    ok: true,
    category: owner.category,
    label: owner.label,
    ownerType: String(ledger.posesnSeCodeNm || "미분류").slice(0, 40),
    pnu,
    address: String(props.addr || ledger.ldCodeNm || "").slice(0, 160),
    jibun: String(props.jibun || ledger.mnnmSlno || "").slice(0, 40),
    landCategory: String(ledger.lndcgrCodeNm || "").slice(0, 40),
    area: Number.isFinite(area) && area >= 0 ? area : null,
    updatedAt: String(ledger.lastUpdtDt || "").slice(0, 20),
    geometry: safeGeometry(feature.geometry),
    source: "국토교통부·VWorld 토지임야정보",
  };
}

async function fetchJson(url, fetchImpl) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6500);
  try {
    const response = await fetchImpl(url, { signal: ctl.signal });
    if (!response.ok) throw new Error("upstream-" + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export async function lookupLandOwnership(env, lat, lng, fetchImpl = fetch) {
  if (!validLandOwnershipPoint(lat, lng)) throw new Error("bad-point");
  const key = String(env.VWORLD_KEY || "").trim();
  if (!key) throw new Error("missing-key");
  let domain = "https://canoe.crowdbase.kr";
  try { domain = new URL(env.SITE_URL || domain).origin; } catch (e) {}

  const parcelUrl = new URL("https://api.vworld.kr/req/data");
  const parcelParams = {
    service: "data", version: "2.0", request: "getfeature", format: "json",
    size: "1", page: "1", geometry: "true", attribute: "true", crs: "EPSG:4326",
    data: "LP_PA_CBND_BUBUN", geomfilter: `POINT(${Number(lng)} ${Number(lat)})`, key, domain,
  };
  Object.entries(parcelParams).forEach(([name, value]) => parcelUrl.searchParams.set(name, value));
  const parcelData = await fetchJson(parcelUrl.toString(), fetchImpl);
  const feature = firstFeature(parcelData), pnu = String(feature && feature.properties && feature.properties.pnu || "");
  if (!/^[0-9]{19}$/.test(pnu)) return null;

  const ledgerUrl = new URL("https://api.vworld.kr/ned/data/ladfrlList");
  Object.entries({ format: "json", numOfRows: "10", pageNo: "1", key, domain, pnu })
    .forEach(([name, value]) => ledgerUrl.searchParams.set(name, value));
  const ledgerData = await fetchJson(ledgerUrl.toString(), fetchImpl);
  return normalizeLandOwnership(parcelData, ledgerData);
}
