import { context, reddit, redis } from '@devvit/web/server';
import regionsJson from '../data/regions.json';
import type {
  ApiError,
  Community,
  GameState,
  Status,
  Summary,
} from '../../shared/api';
import { cellName, recapText } from '../../shared/recap';
import {
  COLS,
  EPOCH_UTC,
  MAX_DROPS,
  bandFor,
  dayDate,
  dayNumber,
  isSea,
  makePuzzle,
  regionForDay,
  shareText,
  type Drop,
  type Puzzle,
  type RegionData,
} from '../../shared/engine';

export const REGIONS = regionsJson as RegionData[];

const key = {
  puzzle: (day: number) => `gd:puzzle:${day}`,
  posts: 'gd:posts',
  postDay: (postId: string) => `gd:postday:${postId}`,
  play: (day: number, userId: string) => `gd:play:${day}:${userId}`,
  stats: (day: number) => `gd:stats:${day}`,
  heat: (day: number) => `gd:heat:${day}`,
  streak: (userId: string) => `gd:streak:${userId}`,
  joined: (userId: string) => `gd:joined:${userId}`,
  /** Weekly points per player: week 1 = days 1-7. */
  week: (week: number) => `gd:week:${week}`,
  names: 'gd:names',
};

export const weekOf = (day: number): number => Math.floor((day - 1) / 7) + 1;
/** A ship found with n buoys earns 7 - n points (6 for one buoy, 1 for six). */
export const pointsFor = (buoys: number): number => Math.max(1, MAX_DROPS + 1 - buoys);

const readLeaderboard = async (
  day: number,
  userId: string | undefined
): Promise<GameState['leaderboard']> => {
  const week = weekOf(day);
  const rows = await redis.zRange(key.week(week), 0, 4, { by: 'rank', reverse: true });
  const names = rows.length ? await redis.hMGet(key.names, rows.map((r) => r.member)) : [];
  const mine = userId ? Number((await redis.zScore(key.week(week), userId)) ?? 0) : 0;
  return {
    week,
    top: rows.map((r, i) => ({ name: names[i] ?? 'a searcher', points: r.score })),
    mine,
  };
};

type Play = { drops: Drop[]; status: Status; shared: boolean };
const NEW_PLAY: Play = { drops: [], status: 'playing', shared: false };

export const today = (): number => Math.max(1, dayNumber(new Date()));
export const regionFor = (day: number): RegionData =>
  regionForDay(REGIONS, day);

export const puzzleFor = async (day: number): Promise<Puzzle> => {
  const cached = await redis.get(key.puzzle(day));
  if (cached) return JSON.parse(cached) as Puzzle;
  const puzzle = makePuzzle(regionFor(day), day);
  await redis.set(key.puzzle(day), JSON.stringify(puzzle));
  return puzzle;
};

export const dayForPost = async (): Promise<number> => {
  const data = context.postData as { day?: unknown } | undefined;
  if (data && typeof data.day === 'number') return data.day;
  if (context.postId) {
    const stored = await redis.get(key.postDay(context.postId));
    if (stored) return Number(stored);
  }
  return today();
};

export const ensureDailyPost = async (
  day = today()
): Promise<{ postId: string; created: boolean }> => {
  const existing = await redis.hGet(key.posts, String(day));
  if (existing && existing !== 'pending')
    return { postId: existing, created: false };
  // Claim the day first so two triggers firing together do not both post.
  const claimed = await redis.hSetNX(key.posts, String(day), 'pending');
  if (!claimed) throw new Error(`Day ${day} is already being posted`);
  try {
    const region = regionFor(day);
    await puzzleFor(day);
    const post = await reddit.submitCustomPost({
      subredditName: context.subredditName,
      title: `Gone Dark #${day} · ${region.name}`,
      entry: 'default',
      postData: { day },
      textFallback: {
        text: `Gone Dark #${day}: a ship has switched off its transponder near ${region.name}. Drop sonar buoys to find it. Open this post on reddit.com or in the Reddit app to play.`,
      },
    });
    await redis.hSet(key.posts, { [String(day)]: post.id });
    await redis.set(key.postDay(post.id), String(day));
    return { postId: post.id, created: true };
  } catch (error) {
    await redis.hDel(key.posts, [String(day)]);
    throw error;
  }
};

const readPlay = async (
  day: number,
  userId: string | undefined
): Promise<Play> => {
  if (!userId) return { ...NEW_PLAY, drops: [] };
  const raw = await redis.get(key.play(day, userId));
  return raw ? (JSON.parse(raw) as Play) : { ...NEW_PLAY, drops: [] };
};

const readStreak = async (
  userId: string | undefined,
  day: number
): Promise<{ current: number; best: number }> => {
  if (!userId) return { current: 0, best: 0 };
  const s = await redis.hGetAll(key.streak(userId));
  const last = Number(s.last ?? 0);
  const current = last >= day - 1 ? Number(s.current ?? 0) : 0;
  return { current, best: Number(s.best ?? 0) };
};

const recordStreak = async (
  userId: string,
  day: number,
  won: boolean
): Promise<void> => {
  const s = await redis.hGetAll(key.streak(userId));
  const last = Number(s.last ?? 0);
  if (day < last) return; // an old puzzle does not change the streak
  let current = Number(s.current ?? 0);
  if (!won) current = 0;
  else if (last === day - 1) current += 1;
  else if (last !== day) current = 1;
  const best = Math.max(Number(s.best ?? 0), current);
  await redis.hSet(key.streak(userId), {
    last: String(day),
    current: String(current),
    best: String(best),
  });
  // The longest streak alive among today's players, for tomorrow's recap (a rare race only under-counts).
  const dayBest = Number((await redis.hGet(key.stats(day), 'beststreak')) ?? 0);
  if (current > dayBest)
    await redis.hSet(key.stats(day), { beststreak: String(current) });
};

/**
 * When a new ship goes dark, the app comments on yesterday's post with how the community did.
 * Posts once per day (gd:recaps), stays quiet if nobody played, never throws.
 */
export const postRecap = async (day: number): Promise<string> => {
  if (day < 1) return 'no previous day';
  const postId = await redis.hGet(key.posts, String(day));
  if (!postId || postId === 'pending') return 'no post for that day';
  const claimed = await redis.hSetNX('gd:recaps', String(day), 'pending');
  if (!claimed) return 'already posted';
  try {
    const [puzzle, stats] = await Promise.all([
      puzzleFor(day),
      redis.hGetAll(key.stats(day)),
    ]);
    const text = recapText(
      day,
      regionFor(day).name,
      cellName(puzzle.ship, COLS),
      puzzle.par,
      {
        players: Number(stats.players ?? 0),
        won: Number(stats.won ?? 0),
        lost: Number(stats.lost ?? 0),
        wins: Array.from({ length: MAX_DROPS + 1 }, (_, n) =>
          n === 0 ? 0 : Number(stats[`w${n}`] ?? 0)
        ),
        bestStreak: Number(stats.beststreak ?? 0),
      },
      MAX_DROPS
    );
    if (!text) {
      await redis.hSet('gd:recaps', { [String(day)]: 'quiet' });
      return 'nobody played';
    }
    const comment = await reddit.submitComment({
      id: postId as `t3_${string}`,
      text,
    });
    try {
      await comment.distinguish(true);
    } catch {
      /* distinguishing is a nicety */
    }
    await redis.hSet('gd:recaps', { [String(day)]: comment.id });
    return `recap ${comment.id}`;
  } catch (error) {
    await redis.hDel('gd:recaps', [String(day)]);
    throw error;
  }
};

const readCommunity = async (
  day: number,
  withHeat: boolean
): Promise<Community> => {
  const stats = await redis.hGetAll(key.stats(day));
  const wins = Array.from({ length: MAX_DROPS + 1 }, (_, n) =>
    n === 0 ? 0 : Number(stats[`w${n}`] ?? 0)
  );
  const heat = withHeat ? await redis.hGetAll(key.heat(day)) : null;
  return {
    players: Number(stats.players ?? 0),
    won: Number(stats.won ?? 0),
    lost: Number(stats.lost ?? 0),
    wins,
    heat: heat
      ? Object.fromEntries(
          Object.entries(heat).map(([cell, n]) => [cell, Number(n)])
        )
      : null,
  };
};

const nextShipAt = (day: number): string =>
  new Date(EPOCH_UTC + (day + 1) * 86400000 + 2 * 60000).toISOString();

export const getState = async (day: number): Promise<GameState> => {
  const userId = context.userId;
  const [puzzle, play, streak, username, joined] = await Promise.all([
    puzzleFor(day),
    readPlay(day, userId),
    readStreak(userId, day),
    userId ? reddit.getCurrentUsername() : Promise.resolve(undefined),
    userId ? redis.get(key.joined(userId)) : Promise.resolve(undefined),
  ]);
  const region = regionFor(day);
  const finished = play.status !== 'playing';
  const { center: _center, ...publicRegion } = region;
  return {
    type: 'state',
    day,
    date: dayDate(day),
    region: publicRegion,
    clue: puzzle.clue,
    seaState: puzzle.seaState,
    maxDrops: MAX_DROPS,
    loggedIn: Boolean(userId),
    username: username ?? null,
    drops: play.drops,
    status: play.status,
    ship: finished ? puzzle.ship : null,
    par: finished ? puzzle.par : null,
    streak,
    community: await readCommunity(day, finished),
    shared: play.shared,
    subreddit: context.subredditName ?? '',
    joined: Boolean(joined),
    leaderboard: finished ? await readLeaderboard(day, userId) : null,
    nextAt: nextShipAt(day),
  };
};

/** Flair text for a streak, e.g. "🔊 Sonar streak 4 · best 9". Reddit caps flair at 64 characters. */
export const streakFlair = (current: number, best: number): string =>
  `🔊 Sonar streak ${current} · best ${best}`;

/** Subscribes the player to this subreddit so tomorrow's ship shows up in their feed. */
export const joinSubreddit = async (
  day: number
): Promise<GameState | ApiError> => {
  const userId = context.userId;
  if (!userId)
    return { type: 'error', code: 'login', message: 'Log in to join.' };
  await reddit.subscribeToCurrentSubreddit();
  await redis.set(key.joined(userId), '1');
  return getState(day);
};

export const getSummary = async (day: number): Promise<Summary> => {
  const userId = context.userId;
  const region = regionFor(day);
  const [stats, play, streak] = await Promise.all([
    redis.hGet(key.stats(day), 'players'),
    userId ? readPlay(day, userId) : Promise.resolve(null),
    readStreak(userId, day),
  ]);
  return {
    type: 'summary',
    day,
    regionName: region.name,
    where: region.where,
    mask: region.mask,
    players: Number(stats ?? 0),
    status: play && play.drops.length ? play.status : null,
    streak: streak.current,
  };
};

export const dropBuoy = async (
  day: number,
  cell: unknown
): Promise<GameState | ApiError> => {
  const userId = context.userId;
  if (!userId)
    return { type: 'error', code: 'login', message: 'Log in to drop buoys.' };
  const region = regionFor(day);
  if (
    typeof cell !== 'number' ||
    !Number.isInteger(cell) ||
    !isSea(region.mask, cell)
  ) {
    return {
      type: 'error',
      code: 'invalid',
      message: 'Buoys only float on open water.',
    };
  }
  const [puzzle, play] = await Promise.all([
    puzzleFor(day),
    readPlay(day, userId),
  ]);
  if (play.status !== 'playing')
    return { type: 'error', code: 'finished', message: 'This search is over.' };
  if (play.drops.some((d) => d.cell === cell))
    return {
      type: 'error',
      code: 'invalid',
      message: 'A buoy is already there.',
    };

  const band = bandFor(region.mask, cell, puzzle.ship);
  play.drops.push({ cell, band });
  const writes: Promise<unknown>[] = [
    redis.hIncrBy(key.heat(day), String(cell), 1),
  ];
  if (play.drops.length === 1)
    writes.push(redis.hIncrBy(key.stats(day), 'players', 1));
  if (band === 0) {
    play.status = 'won';
    writes.push(
      redis.hIncrBy(key.stats(day), 'won', 1),
      redis.hIncrBy(key.stats(day), `w${play.drops.length}`, 1),
      recordStreak(userId, day, true),
      redis.zIncrBy(key.week(weekOf(day)), userId, pointsFor(play.drops.length)),
      reddit
        .getCurrentUsername()
        .then((name) => (name ? redis.hSet(key.names, { [userId]: name }) : 0))
    );
  } else if (play.drops.length >= MAX_DROPS) {
    play.status = 'lost';
    writes.push(
      redis.hIncrBy(key.stats(day), 'lost', 1),
      recordStreak(userId, day, false)
    );
  }
  writes.push(redis.set(key.play(day, userId), JSON.stringify(play)));
  await Promise.all(writes);
  return getState(day);
};

export const shareResult = async (
  day: number
): Promise<GameState | ApiError> => {
  const userId = context.userId;
  const postId = context.postId;
  if (!userId || !postId)
    return { type: 'error', code: 'login', message: 'Log in to share.' };
  const play = await readPlay(day, userId);
  if (play.status === 'playing')
    return {
      type: 'error',
      code: 'invalid',
      message: 'Finish the search first.',
    };
  if (play.shared) return getState(day);
  const text = shareText(
    day,
    regionFor(day).name,
    play.drops,
    play.status === 'won'
  );
  await reddit.submitComment({ id: postId, text, runAs: 'USER' });
  play.shared = true;
  await redis.set(key.play(day, userId), JSON.stringify(play));
  // The streak shows next to the player's name in this subreddit. Best effort:
  // a failure here must not undo the comment that was just posted.
  try {
    const [username, streak] = await Promise.all([
      reddit.getCurrentUsername(),
      readStreak(userId, day),
    ]);
    if (username && context.subredditName && streak.current > 0) {
      await reddit.setUserFlair({
        subredditName: context.subredditName,
        username,
        text: streakFlair(streak.current, streak.best),
        backgroundColor: '#ffb547',
        textColor: 'dark',
      });
    }
  } catch (error) {
    console.error('Gone Dark: could not set streak flair', error);
  }
  return getState(day);
};
