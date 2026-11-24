// Local stand-in for the Devvit server, used only by `npm run dev:local`.
// `?day=N` picks a day, `?crowd=1` adds simulated searchers so the end screen has data.
import regions from 'virtual:gd-regions';
import type { GameState, Status, Summary } from '../shared/api';
import {
  EPOCH_UTC,
  MAX_DROPS,
  bandFor,
  bandTable,
  dayDate,
  dayNumber,
  expertPick,
  isSea,
  makePuzzle,
  reachable,
  regionForDay,
  rng,
  type Drop,
} from '../shared/engine';

const params = new URLSearchParams(window.location.search);
const day = Number(params.get('day')) || Math.max(1, dayNumber(new Date()));
const region = regionForDay(regions, day);
const puzzle = makePuzzle(region, day);
const KEY = `gd-local:${day}`;

type Play = {
  drops: Drop[];
  status: Status;
  shared: boolean;
  joined?: boolean;
};

const read = (): Play => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Play;
  } catch {
    // storage blocked: play without saving
  }
  return { drops: [], status: 'playing', shared: false };
};

const write = (play: Play): void => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(play));
  } catch {
    // ignore
  }
};

const crowd = (() => {
  const wins = Array.from({ length: MAX_DROPS + 1 }, () => 0);
  const heat: Record<string, number> = {};
  let lost = 0;
  if (params.get('crowd') !== '1') return { players: 0, wins, heat, lost };
  const table = bandTable(region.mask);
  const rand = rng(day * 7919);
  const start = reachable(region.mask, puzzle.clue.cell, puzzle.clue.reach);
  const players = 140;
  for (let i = 0; i < players; i++) {
    let cands = start;
    let found = 0;
    for (let n = 1; n <= MAX_DROPS; n++) {
      // Simulated people: a mix of guesses and good moves.
      const p =
        rand() < 0.45
          ? cands[Math.floor(rand() * cands.length)]!
          : expertPick(region.mask, table, cands);
      heat[p] = (heat[p] ?? 0) + 1;
      if (p === puzzle.ship) {
        found = n;
        break;
      }
      const band = bandFor(region.mask, p, puzzle.ship);
      cands = cands.filter(
        (c) => c !== p && bandFor(region.mask, p, c) === band
      );
    }
    if (found) wins[found]!++;
    else lost++;
  }
  return { players, wins, heat, lost };
})();

const state = (play: Play): GameState => {
  const finished = play.status !== 'playing';
  const { center: _center, ...publicRegion } = region;
  const mine = finished ? 1 : 0;
  const wins = crowd.wins.slice();
  if (play.status === 'won') wins[play.drops.length]!++;
  return {
    type: 'state',
    day,
    date: dayDate(day),
    region: publicRegion,
    clue: puzzle.clue,
    seaState: puzzle.seaState,
    maxDrops: MAX_DROPS,
    loggedIn: true,
    username: 'local-tester',
    drops: play.drops,
    status: play.status,
    ship: finished ? puzzle.ship : null,
    par: finished ? puzzle.par : null,
    streak: {
      current: play.status === 'won' ? 1 : 0,
      best: play.status === 'won' ? 1 : 0,
    },
    community: {
      players: crowd.players + (play.drops.length ? 1 : 0),
      won: wins.reduce((a, b) => a + b, 0),
      lost: crowd.lost + (play.status === 'lost' ? mine : 0),
      wins,
      heat: finished ? crowd.heat : null,
    },
    shared: play.shared,
    subreddit: 'GoneDarkDaily',
    joined: play.joined ?? false,
    nextAt: new Date(EPOCH_UTC + (day + 1) * 86400000 + 120000).toISOString(),
  };
};

export const mockState = async (): Promise<GameState> => state(read());

export const mockSummary = async (): Promise<Summary> => {
  const play = read();
  return {
    type: 'summary',
    day,
    regionName: region.name,
    where: region.where,
    mask: region.mask,
    players: crowd.players + (play.drops.length ? 1 : 0),
    status: play.drops.length ? play.status : null,
    streak: play.status === 'won' ? 1 : 0,
  };
};

export const mockDrop = async (cell: number): Promise<GameState> => {
  const play = read();
  if (
    play.status === 'playing' &&
    isSea(region.mask, cell) &&
    !play.drops.some((d) => d.cell === cell)
  ) {
    const band = bandFor(region.mask, cell, puzzle.ship);
    play.drops.push({ cell, band });
    if (band === 0) play.status = 'won';
    else if (play.drops.length >= MAX_DROPS) play.status = 'lost';
    write(play);
  }
  await new Promise((r) => setTimeout(r, 250));
  return state(play);
};

export const mockJoin = async (): Promise<GameState> => {
  const play = read();
  play.joined = true;
  write(play);
  return state(play);
};

export const mockShare = async (): Promise<GameState> => {
  const play = read();
  play.shared = true;
  write(play);
  return state(play);
};
