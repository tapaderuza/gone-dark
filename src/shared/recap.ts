// No imports on purpose: node:test loads this file directly (type stripping, no bundler),
// so the caller passes the ship's cell label and the buoy limit.

/** Yesterday's numbers, as kept in Redis (gd:stats:{day}). */
export type DayStats = {
  players: number;
  won: number;
  lost: number;
  /** wins[n] = players who found the ship with n buoys (index 0 unused). */
  wins: number[];
  /** Longest current streak among yesterday's players. */
  bestStreak: number;
};

/** Chart label of a cell on a grid `cols` wide, e.g. A1, B2 (same as the game's chart). */
export const cellName = (cell: number, cols = 12): string =>
  `${String.fromCharCode(65 + (cell % cols))}${Math.floor(cell / cols) + 1}`;

const bar = (n: number, max: number, width = 14): string =>
  n === 0 ? '' : '█'.repeat(Math.max(1, Math.round((width * n) / Math.max(1, max))));

/**
 * The comment the app leaves on yesterday's post when today's ship goes dark:
 * how the community did, where the ship was (no longer a spoiler), and a nudge to today's post.
 * Returns null when nobody played, so the app stays quiet.
 */
export const recapText = (
  day: number,
  regionName: string,
  shipLabel: string,
  par: number,
  s: DayStats,
  maxDrops = 6
): string | null => {
  if (s.players <= 0) return null;
  const rows = [
    ...Array.from({ length: maxDrops },(_, i) => [String(i + 1), s.wins[i + 1] ?? 0] as const),
    ['✕', s.lost] as const,
  ];
  const max = Math.max(...rows.map(([, n]) => n));
  const chart = rows.map(([label, n]) => `${label} ${bar(n, max)}${n ? ` ${n}` : ''}`.trimEnd());
  const found = `${s.won} found the ship`;
  const lines = [
    `**Search over: Gone Dark #${day} · ${regionName}**`,
    '',
    `${s.players} searched · ${found} · it was hiding at **${shipLabel}** · the expert needed ${par} buoy${par === 1 ? '' : 's'}.`,
    '',
    'Buoys used by the people who found it:',
    '',
    ...chart.map((l) => `    ${l}`),
  ];
  if (s.bestStreak > 1) lines.push('', `Longest streak still alive: ${s.bestStreak} days.`);
  lines.push('', "A new ship has gone dark. Today's post is up: good hunting.");
  return lines.join('\n');
};
