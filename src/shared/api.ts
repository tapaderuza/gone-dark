import type { Clue, Drop, RegionData, SeaState } from './engine';

export type PublicRegion = Omit<RegionData, 'center'>;

export type Status = 'playing' | 'won' | 'lost';

export type Community = {
  /** People who dropped at least one buoy today. */
  players: number;
  won: number;
  lost: number;
  /** wins[n] = players who found the ship with n buoys (index 0 unused). */
  wins: number[];
  /** Buoys dropped per cell by everyone. Only sent once the player has finished. */
  heat: Record<string, number> | null;
};

export type GameState = {
  type: 'state';
  day: number;
  date: string;
  region: PublicRegion;
  clue: Clue;
  seaState: SeaState;
  maxDrops: number;
  loggedIn: boolean;
  username: string | null;
  drops: Drop[];
  status: Status;
  /** Revealed once the player has finished. */
  ship: number | null;
  /** Buoys the expert needed. Revealed once the player has finished. */
  par: number | null;
  streak: { current: number; best: number };
  community: Community;
  shared: boolean;
  /** The subreddit this post lives in, without "r/". */
  subreddit: string;
  /** The player pressed "Join" here (we cannot read real membership). */
  joined: boolean;
  /** This week's top searchers in this subreddit (points = 7 - buoys used, per ship found). Sent once finished. */
  leaderboard: { week: number; top: { name: string; points: number }[]; mine: number } | null;
  /** ISO time when the next ship goes dark. */
  nextAt: string;
};

export type DropRequest = { cell: number };

export type ApiError = {
  type: 'error';
  message: string;
  code?: 'login' | 'invalid' | 'finished';
};

/** What the feed card needs, kept small. */
export type Summary = {
  type: 'summary';
  day: number;
  regionName: string;
  where: string;
  mask: string;
  players: number;
  status: Status | null;
  streak: number;
};
