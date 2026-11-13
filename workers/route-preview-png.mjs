// A dependency-free PNG renderer for public route cards in Workers.
// All paths share one Mercator projection; separate track parts stay separate.
const FONT = {
  0: '01110/10001/10011/10101/11001/10001/01110',
  1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00010/00100/01000/11111',
  3: '11110/00001/00001/01110/00001/00001/11110',
  4: '00010/00110/01010/10010/11111/00010/00010',
  5: '11111/10000/10000/11110/00001/00001/11110',
  6: '01110/10000/10000/11110/10001/10001/01110',
  7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110',
  9: '01110/10001/10001/01111/00001/00001/01110',
  A: '01110/10001/10001/11111/10001/10001/10001',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  I: '11111/00100/00100/00100/00100/00100/11111',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  W: '10001/10001/10001/10101/10101/10101/01010',
  V: '10001/10001/10001/10001/10001/01010/00100',
  B: '11110/10001/10001/11110/10001/10001/11110',
  '.': '00000/00000/00000/00000/00000/00110/00110',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000'
};
const WIDTH = 1200,
  HEIGHT = 630;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const out = new Uint8Array(data.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(name), 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc(out.subarray(4, data.length + 8)));
  return out;
}
function rgb(color, fallback) {
  return /^#[0-9a-f]{6}$/i.test(color || '')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : fallback;
}
export async function renderRoutePreview(records, context = []) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  function rect(x, y, w, h, color) {
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(HEIGHT, y + h); yy++)
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(WIDTH, x + w); xx++) {
        const i = (yy * WIDTH + xx) * 3;
        pixels[i] = color[0];
        pixels[i + 1] = color[1];
        pixels[i + 2] = color[2];
      }
  }
  function dot(x, y, r, color) {
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(HEIGHT - 1, y + r); yy++)
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(WIDTH - 1, x + r); xx++)
        if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) {
          const i = (yy * WIDTH + xx) * 3;
          pixels[i] = color[0];
          pixels[i + 1] = color[1];
          pixels[i + 2] = color[2];
        }
  }
  function text(value, x, y, scale, color) {
    for (const char of String(value)) {
      const rows = FONT[char]?.split('/');
      if (rows)
        rows.forEach((row, yy) =>
          [...row].forEach((bit, xx) => {
            if (bit === '1') rect(x + xx * scale, y + yy * scale, scale, scale, color);
          })
        );
      x += 6 * scale;
    }
  }
  const merc = (p) => [
    (p[0] * Math.PI) / 180,
    Math.log(Math.tan(Math.PI / 4 + (p[1] * Math.PI) / 360))
  ];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const record of records)
    for (const path of record.lines)
      for (const p of path) {
        const [x, y] = merc(p);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  const frame = { x: 40, y: 24, w: 1120, h: 562 },
    scale = Math.min(
      (frame.w - 76) / Math.max(1e-7, maxX - minX),
      (frame.h - 56) / Math.max(1e-7, maxY - minY)
    ),
    cx = (maxX + minX) / 2,
    cy = (maxY + minY) / 2;
  const project = (p) => {
    const [x, y] = merc(p);
    return [frame.x + frame.w / 2 + (x - cx) * scale, frame.y + frame.h / 2 - (y - cy) * scale];
  };
  function segment(a, b, width, color, dash, offset) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    let start = 0,
      end = 1;
    const edges = [
      [-dx, a[0] - frame.x],
      [dx, frame.x + frame.w - a[0]],
      [-dy, a[1] - frame.y],
      [dy, frame.y + frame.h - a[1]]
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return;
        continue;
      }
      const t = q / p;
      if (p < 0) start = Math.max(start, t);
      else end = Math.min(end, t);
      if (start > end) return;
    }
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const steps = Math.ceil(length * (end - start));
    for (let i = 0; i <= steps; i++) {
      const t = start + ((end - start) * i) / Math.max(1, steps);
      if (dash && Math.floor((offset + t * length) / 14) % 2) continue;
      dot(a[0] + dx * t, a[1] + dy * t, width / 2, color);
    }
  }
  function path(points, width, color, dash) {
    let offset = 0;
    for (let i = 1; i < points.length; i++) {
      const a = project(points[i - 1]),
        b = project(points[i]);
      segment(a, b, width, color, dash, offset);
      offset += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }

  rect(0, 0, WIDTH, HEIGHT, [238, 244, 235]);

  for (const feature of context) {
    const line = feature.geometry?.coordinates;
    if (
      feature.geometry?.type !== 'LineString' ||
      !line?.some((p) => {
        const [x, y] = project(p);
        return x >= frame.x && x <= frame.x + frame.w && y >= frame.y && y <= frame.y + frame.h;
      })
    )
      continue;
    path(line, feature.properties?.kind === 'river' ? 5 : 2, [185, 218, 227], false);
  }
  records.forEach((record, index) => {
    const color =
      record.kind === '육로'
        ? [141, 78, 40]
        : rgb(
            record.color,
            [
              [0, 142, 170],
              [124, 77, 255],
              [229, 98, 43]
            ][index % 3]
          );
    for (const line of record.lines) {
      path(line, 14, [255, 255, 255], false);
      path(line, 8, color, record.kind === '육로');
    }
    const longest = record.lines.reduce((a, b) => (a.length > b.length ? a : b)),
      anchor = project(longest[Math.floor(longest.length / 2)]);
    const label = String(index + 1),
      fontScale = label.length < 3 ? 3 : 2,
      radius = Math.max(18, Math.ceil(label.length * 3 * fontScale + 6));
    dot(anchor[0], anchor[1], radius + 4, [255, 255, 255]);
    dot(anchor[0], anchor[1], radius, color);
    text(
      label,
      anchor[0] - ((label.length * 6 - 1) * fontScale) / 2,
      anchor[1] - 3.5 * fontScale,
      fontScale,
      [255, 255, 255]
    );
  });
  rect(0, 602, WIDTH, 28, [255, 255, 255]);
  text('MAP DATA (C) OPENSTREETMAP', 1000, 615, 1, [85, 108, 95]);
  const rows = new Uint8Array((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++)
    rows.set(pixels.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), y * (WIDTH * 3 + 1) + 1);
  const compressed = new Uint8Array(
    await new Response(
      new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer()
  );
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, WIDTH);
  view.setUint32(4, HEIGHT);
  header[8] = 8;
  header[9] = 2;
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array())
  ];
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
