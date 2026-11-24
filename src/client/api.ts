import {
  requestExpandedMode,
  showLoginPrompt,
  showToast,
} from '@devvit/web/client';
import type { ApiError, GameState, Summary } from '../shared/api';

/** `npm run dev:local` plays against an in-browser copy of the server, for development only. */
export const LOCAL = import.meta.env.MODE === 'mock';

export const isError = (x: { type: string }): x is ApiError =>
  x.type === 'error';

const send = async <T>(
  path: string,
  init?: RequestInit
): Promise<T | ApiError> => {
  try {
    const res = await fetch(path, init);
    return (await res.json()) as T | ApiError;
  } catch {
    return { type: 'error', message: 'No connection. Try again.' };
  }
};

const post = (cell?: number): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cell === undefined ? {} : { cell }),
});

export const loadState = async (): Promise<GameState | ApiError> =>
  LOCAL ? (await import('./mock')).mockState() : send<GameState>('/api/state');

export const loadSummary = async (): Promise<Summary | ApiError> =>
  LOCAL
    ? (await import('./mock')).mockSummary()
    : send<Summary>('/api/summary');

export const dropAt = async (cell: number): Promise<GameState | ApiError> =>
  LOCAL
    ? (await import('./mock')).mockDrop(cell)
    : send<GameState>('/api/drop', post(cell));

export const shareResult = async (): Promise<GameState | ApiError> =>
  LOCAL
    ? (await import('./mock')).mockShare()
    : send<GameState>('/api/share', post());

export const openGame = (event: MouseEvent): void => {
  if (LOCAL) window.location.href = `game.html${window.location.search}`;
  else requestExpandedMode(event, 'game');
};

export const askLogin = (): void => {
  if (!LOCAL) showLoginPrompt();
};

export const toast = (text: string): void => {
  if (!LOCAL) showToast(text);
};
