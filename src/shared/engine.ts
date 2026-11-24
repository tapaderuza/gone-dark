// Gone Dark — pure game rules shared by the server and the client.
// No imports, so Node can run it directly in tests.

export const COLS = 12;
export const ROWS = 16;
export const CELLS = COLS * ROWS;
export const MAX_DROPS = 6;

/** 0 contact · 1 loud · 2 clear · 3 faint · 4 silent */
export type Band = 0 | 1 | 2 | 3 | 4;
export const BAND_NAMES = [
  'Contact',
  'Loud',
  'Clear',
  'Faint',
  'Silent',
] as const;
/** Upper distance (in cells, centre to centre) for bands 1..3. Beyond the last one, or with land in between: silent. */
export const BAND_LIMITS = [1.5, 3.5, 6.5] as const;

export type SeaState = 0 | 1 | 2;
export const SEA_STATE_NAMES = ['Calm', 'Moderate', 'Rough'] as const;

export type RegionData = {
  id: string;
  name: string;
  where: string;
  cellKm: number;
  center: [number, number];
  /** CELLS characters, '1' = playable sea. Row-major from the north-west corner. */
  mask: string;
  /** SVG path of the land, in grid units (one cell = 1). */
  coast: string;
};

export type Clue = {
  /** Cell of the last transponder fix. */
  cell: number;
  hoursDark: number;
  knots: number;
  /** How far the ship can be, in cells, travelling by sea. */
  reach: number;
};

export type Drop = { cell: number; band: Band };

export type Puzzle = {
  regionId: string;
  clue: Clue;
  seaState: SeaState;
  ship: number;
  par: number;
};

export const isSea = (mask: string, cell: number): boolean =>
  cell >= 0 && cell < CELLS && mask.charCodeAt(cell) === 49;

export const cellCol = (cell: number): number => cell % COLS;
export const cellRow = (cell: number): number => Math.floor(cell / COLS);

export const gridDistance = (a: number, b: number): number =>
  Math.hypot(cellCol(a) - cellCol(b), cellRow(a) - cellRow(b));

/** Sound travels in a straight line and land blocks it. */
export const lineOfSight = (mask: string, a: number, b: number): boolean => {
  const ax = cellCol(a) + 0.5;
  const ay = cellRow(a) + 0.5;
  const bx = cellCol(b) + 0.5;
  const by = cellRow(b) + 0.5;
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(ax + (bx - ax) * t);
    const y = Math.floor(ay + (by - ay) * t);
    if (!isSea(mask, y * COLS + x)) return false;
  }
  return true;
};

export const bandFor = (mask: string, buoy: number, ship: number): Band => {
  if (buoy === ship) return 0;
  if (!lineOfSight(mask, buoy, ship)) return 4;
  const d = gridDistance(buoy, ship);
  if (d <= BAND_LIMITS[0]) return 1;
  if (d <= BAND_LIMITS[1]) return 2;
  if (d <= BAND_LIMITS[2]) return 3;
  return 4;
};

/** Distance range of a band in kilometres, for labels. */
export const bandRangeKm = (
  band: Band,
  cellKm: number
): [number, number] | null => {
  if (band === 0) return [0, 0];
  if (band === 4) return null;
  const lo = band === 1 ? 0 : BAND_LIMITS[band - 2]!;
  const hi = BAND_LIMITS[band - 1]!;
  return [Math.round(lo * cellKm), Math.round(hi * cellKm)];
};

export const seaCells = (mask: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (isSea(mask, i)) out.push(i);
  return out;
};

/** Cells the ship can reach from the last fix within `reach` cells, moving by sea (8 directions). */
export const reachable = (
  mask: string,
  from: number,
  reach: number
): number[] => {
  const dist = new Float64Array(CELLS).fill(Infinity);
  dist[from] = 0;
  const done = new Uint8Array(CELLS);
  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < CELLS; i++) {
      if (!done[i] && dist[i]! < best) {
        best = dist[i]!;
        cur = i;
      }
    }
    if (cur < 0 || best > reach) break;
    done[cur] = 1;
    const r = cellRow(cur);
    const c = cellCol(cur);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        const next = rr * COLS + cc;
        if (!isSea(mask, next)) continue;
        // No squeezing diagonally between two land cells.
        if (
          dr &&
          dc &&
          !isSea(mask, r * COLS + cc) &&
          !isSea(mask, rr * COLS + c)
        )
          continue;
        const step = dr && dc ? Math.SQRT2 : 1;
        if (best + step < dist[next]!) dist[next] = best + step;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (done[i]) out.push(i);
  return out;
};

/** Every cell still consistent with the clue and the readings so far. */
export const candidates = (
  mask: string,
  clue: Clue,
  drops: readonly Drop[]
): number[] =>
  reachable(mask, clue.cell, clue.reach).filter((c) =>
    drops.every((d) => bandFor(mask, d.cell, c) === d.band)
  );

/** Precomputed band of every (buoy, ship) pair, for fast solving. */
export type BandTable = Uint8Array;
export const bandTable = (mask: string): BandTable => {
  const t = new Uint8Array(CELLS * CELLS).fill(255);
  const sea = seaCells(mask);
  for (const a of sea)
    for (const b of sea) t[a * CELLS + b] = bandFor(mask, a, b);
  return t;
};

/** The expert's next buoy: the one that leaves the fewest cells on average (a hit counts as zero). */
export const expertPick = (
  mask: string,
  table: BandTable,
  cands: readonly number[]
): number => {
  if (cands.length <= 2) return cands[0]!;
  const sea = seaCells(mask);
  const inCands = new Uint8Array(CELLS);
  for (const c of cands) inCands[c] = 1;
  let bestCell = sea[0]!;
  let bestScore = Infinity;
  const buckets = [0, 0, 0, 0, 0];
  for (const p of sea) {
    buckets.fill(0);
    for (const c of cands) buckets[table[p * CELLS + c]!]!++;
    const score =
      buckets[1]! ** 2 +
      buckets[2]! ** 2 +
      buckets[3]! ** 2 +
      buckets[4]! ** 2 -
      inCands[p]! * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestCell = p;
    }
  }
  return bestCell;
};

/** How many buoys the expert needs to hit `ship`. */
export const expertSolve = (
  mask: string,
  table: BandTable,
  clue: Clue,
  ship: number,
  limit = 12
): number => {
  let cands = reachable(mask, clue.cell, clue.reach);
  for (let n = 1; n <= limit; n++) {
    const p = expertPick(mask, table, cands);
    if (p === ship) return n;
    const band = table[p * CELLS + ship]!;
    cands = cands.filter((c) => c !== p && table[p * CELLS + c] === band);
  }
  return limit + 1;
};

// --- Deterministic randomness -------------------------------------------------

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// --- Daily schedule ------------------------------------------------------------

/** Day 1 is 2026-11-18 (UTC). */
export const EPOCH_UTC = Date.UTC(2026, 10, 17);
export const dayNumber = (date: Date): number =>
  Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      EPOCH_UTC) /
      86400000
  );

export const dayDate = (day: number): string =>
  new Date(EPOCH_UTC + day * 86400000).toISOString().slice(0, 10);

/** Region order: a fresh shuffle for every full pass through the list. */
export const regionForDay = <T>(regions: readonly T[], day: number): T => {
  const pass = Math.floor((day - 1) / regions.length);
  const order = regions.map((_, i) => i);
  const rand = rng(hashString(`pass:${pass}`));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const idx =
    order[(((day - 1) % regions.length) + regions.length) % regions.length]!;
  return regions[idx]!;
};

/** Weekly rhythm: easy start of the week, rough weekend. */
export const seaStateForDay = (day: number): SeaState => {
  const weekday = new Date(EPOCH_UTC + day * 86400000).getUTCDay(); // 0 Sunday
  if (weekday === 1 || weekday === 2) return 0;
  if (weekday === 6 || weekday === 0) return 2;
  return 1;
};

const CANDIDATE_RANGE: Record<SeaState, [number, number]> = {
  0: [14, 30],
  1: [30, 55],
  2: [55, 95],
};
const KNOTS = [8, 10, 12, 14, 16, 18, 20];
const HOURS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6];

export const makePuzzle = (
  region: RegionData,
  day: number,
  table: BandTable = bandTable(region.mask)
): Puzzle => {
  const rand = rng(hashString(`${region.id}:${day}`));
  const sea = seaCells(region.mask);
  const wanted = seaStateForDay(day);
  for (let relax = 0; relax <= 2; relax++) {
    const seaState = Math.max(0, wanted - relax) as SeaState;
    const [lo, hi] = CANDIDATE_RANGE[seaState];
    for (let attempt = 0; attempt < 400; attempt++) {
      const cell = sea[Math.floor(rand() * sea.length)]!;
      const knots = KNOTS[Math.floor(rand() * KNOTS.length)]!;
      const hoursDark = HOURS[Math.floor(rand() * HOURS.length)]!;
      const reach = (hoursDark * knots * 1.852) / region.cellKm;
      const clue: Clue = { cell, hoursDark, knots, reach };
      const start = reachable(region.mask, cell, reach);
      if (start.length < lo || start.length > hi) continue;
      // Fair: the expert must find every possible hiding place within MAX_DROPS - 1.
      if (
        start.some(
          (s) =>
            expertSolve(region.mask, table, clue, s, MAX_DROPS) > MAX_DROPS - 1
        )
      )
        continue;
      const hiding = start.filter((c) => c !== cell);
      const ship = hiding[Math.floor(rand() * hiding.length)]!;
      return {
        regionId: region.id,
        clue,
        seaState,
        ship,
        par: expertSolve(region.mask, table, clue, ship),
      };
    }
  }
  throw new Error(`No fair puzzle for ${region.id} on day ${day}`);
};

// --- Sharing --------------------------------------------------------------------

const BAND_SYMBOLS = ['🎯', '🔊', '🔉', '🔈', '🔇'] as const;

export const shareText = (
  day: number,
  regionName: string,
  drops: readonly Drop[],
  won: boolean
): string => {
  const line = drops.map((d) => BAND_SYMBOLS[d.band]).join(' ');
  const result = won
    ? `found in ${drops.length}/${MAX_DROPS}`
    : `lost contact (${MAX_DROPS}/${MAX_DROPS})`;
  return `Gone Dark #${day} · ${regionName} — ${result}\n\n${line}`;
};
