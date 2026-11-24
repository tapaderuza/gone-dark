// Builds the playable grids from Natural Earth 1:10m land (public domain).
// Usage: node scripts/build-regions.ts   (reads .geodata/, writes src/server/data/regions.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { REGION_SOURCES } from './regions.source.ts';

const COLS = 12;
const ROWS = 16;
const SAMPLES = 6;
const SEA_SHARE = 0.6;
const MIN_SEA = 50;
const MAX_SEA = 175;

type Pt = [number, number];
type Ring = Pt[];
type Poly = { rings: Ring[]; bbox: [number, number, number, number] };
type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };

const loadPolys = (path: string): Poly[] => {
  const fc = JSON.parse(readFileSync(path, 'utf8')) as {
    features: { geometry: Geometry | null }[];
  };
  const out: Poly[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) {
      let w = 180,
        s = 90,
        e = -180,
        n = -90;
      for (const [x, y] of rings[0] ?? []) {
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
      out.push({ rings, bbox: [w, s, e, n] });
    }
  }
  return out;
};

// Sutherland–Hodgman clip of one ring against an axis-aligned rectangle.
const clipRing = (
  ring: Ring,
  w: number,
  s: number,
  e: number,
  n: number
): Ring => {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [
      (p) => p[0] >= w,
      (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])],
    ],
    [
      (p) => p[0] <= e,
      (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])],
    ],
    [
      (p) => p[1] >= s,
      (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s],
    ],
    [
      (p) => p[1] <= n,
      (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n],
    ],
  ];
  let pts = ring;
  for (const [inside, cut] of edges) {
    if (pts.length === 0) break;
    const next: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]!;
      const prev = pts[(i + pts.length - 1) % pts.length]!;
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) next.push(cut(prev, cur));
        next.push(cur);
      } else if (pi) {
        next.push(cut(prev, cur));
      }
    }
    pts = next;
  }
  return pts;
};

const inRing = (x: number, y: number, ring: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
};

// Douglas–Peucker on an open polyline.
const simplify = (pts: Ring, tol: number): Ring => {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      // A closed ring starts and ends on the same point: measure from that point instead.
      const d =
        len < 1e-9
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
};

const ringArea = (r: Ring): number => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j]![0] + r[i]![0]) * (r[j]![1] - r[i]![1]);
  return Math.abs(a / 2);
};

const largestSeaComponent = (sea: boolean[]): Set<number> => {
  const seen = new Set<number>();
  let best = new Set<number>();
  for (let start = 0; start < sea.length; start++) {
    if (!sea[start] || seen.has(start)) continue;
    const comp = new Set<number>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.pop()!;
      const r = Math.floor(cur / COLS);
      const c = cur % COLS;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
          const k = rr * COLS + cc;
          if (sea[k] && !seen.has(k)) {
            seen.add(k);
            comp.add(k);
            queue.push(k);
          }
        }
      }
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
};

const polys = [
  ...loadPolys('.geodata/ne_10m_land.geojson'),
  ...loadPolys('.geodata/ne_10m_minor_islands.geojson'),
];
const regions: unknown[] = [];
const report: string[] = [];

for (const src of REGION_SOURCES) {
  const [lon0, lat0] = src.center;
  const cellKm = src.widthKm / COLS;
  const dLat = cellKm / 110.574;
  const dLon = cellKm / (111.32 * Math.cos((lat0 * Math.PI) / 180));
  const w = lon0 - (COLS / 2) * dLon;
  const e = lon0 + (COLS / 2) * dLon;
  const n = lat0 + (ROWS / 2) * dLat;
  const s = lat0 - (ROWS / 2) * dLat;
  const [cw, cs, ce, cn] = [w - dLon, s - dLat, e + dLon, n + dLat];

  const clipped: Ring[][] = [];
  for (const p of polys) {
    const [pw, ps, pe, pn] = p.bbox;
    if (pe < cw || pw > ce || pn < cs || ps > cn) continue;
    const rings = p.rings
      .map((r) => clipRing(r, cw, cs, ce, cn))
      .filter((r) => r.length >= 3);
    if (rings.length) clipped.push(rings);
  }

  const isLand = (x: number, y: number): boolean => {
    for (const rings of clipped) {
      let inside = false;
      for (const r of rings) if (inRing(x, y, r)) inside = !inside;
      if (inside) return true;
    }
    return false;
  };

  const sea: boolean[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let wet = 0;
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const x = w + (c + (i + 0.5) / SAMPLES) * dLon;
          const y = n - (r + (j + 0.5) / SAMPLES) * dLat;
          if (!isLand(x, y)) wet++;
        }
      }
      sea.push(wet / (SAMPLES * SAMPLES) >= SEA_SHARE);
    }
  }
  const playable = largestSeaComponent(sea);
  const mask = sea.map((_, k) => (playable.has(k) ? '1' : '0')).join('');

  const toGrid = ([x, y]: Pt): Pt => [(x - w) / dLon, (n - y) / dLat];
  const parts: string[] = [];
  for (const rings of clipped) {
    for (const r of rings) {
      const g = simplify(r.map(toGrid), 0.05);
      if (g.length < 3 || ringArea(g) < 0.02) continue;
      parts.push(
        'M' +
          g.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') +
          'Z'
      );
    }
  }
  const coast = parts.join('').replace(/\.00(?=[,LZ])/g, '');

  const seaCount = playable.size;
  const ok = seaCount >= MIN_SEA && seaCount <= MAX_SEA;
  report.push(
    `${ok ? 'ok  ' : 'SKIP'} ${src.id.padEnd(12)} sea=${String(seaCount).padStart(3)} cell=${cellKm.toFixed(1)}km coast=${(coast.length / 1024).toFixed(1)}KB`
  );
  if (!ok) continue;
  regions.push({
    id: src.id,
    name: src.name,
    where: src.where,
    cellKm: Math.round(cellKm * 10) / 10,
    center: src.center,
    mask,
    coast,
  });
}

mkdirSync('src/server/data', { recursive: true });
writeFileSync('src/server/data/regions.json', JSON.stringify(regions));
console.log(report.join('\n'));
console.log(
  `\n${regions.length} regions written, ${(JSON.stringify(regions).length / 1024).toFixed(0)} KB`
);
