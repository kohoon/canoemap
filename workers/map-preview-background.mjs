// ArcGIS Export Map uses the same Web Mercator extent as the overlaid geometry.
// https://developers.arcgis.com/rest/services-reference/enterprise/export-map/
export async function decodeMapPng(bytes, expectedWidth, expectedHeight) {
  if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80) throw Error('invalid-png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20), type = bytes[25];
  if (width !== expectedWidth || height !== expectedHeight || bytes[24] !== 8 || ![2,6].includes(type) || bytes[28] !== 0) throw Error('unsupported-png');
  const parts = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = view.getUint32(offset);
    if (offset + size + 12 > bytes.length) throw Error('truncated-png');
    if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const channels = type === 6 ? 4 : 3, stride = width * channels;
  const raw = new Uint8Array(await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  if (raw.length !== (stride + 1) * height) throw Error('invalid-png-size');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('invalid-png-filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= channels ? out[i - channels] : 0, b = y ? out[i - stride] : 0, c = y && x >= channels ? out[i - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      if (filter === 2) predictor = b;
      if (filter === 3) predictor = Math.floor((a + b) / 2);
      if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = raw[y * (stride + 1) + x + 1] + predictor;
    }
  }
  return {pixels: out, channels, width, height};
}
export async function mapBackground(extent, width, height) {
  const url = new URL('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export');
  url.search = new URLSearchParams({bbox:extent.join(','),bboxSR:'3857',imageSR:'3857',size:`${width},${height}`,format:'png32',f:'image'});
  const response = await fetch(url.href, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw Error('basemap-unavailable');
  return decodeMapPng(new Uint8Array(await response.arrayBuffer()), width, height);
}
