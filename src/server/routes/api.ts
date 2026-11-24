import { Hono } from 'hono';
import type { ApiError, DropRequest } from '../../shared/api';
import {
  dayForPost,
  dropBuoy,
  getState,
  getSummary,
  shareResult,
} from '../core/game';

export const api = new Hono();

const fail = (error: unknown): ApiError => {
  console.error('Gone Dark API error', error);
  return {
    type: 'error',
    message: error instanceof Error ? error.message : 'Something went wrong.',
  };
};

const statusFor = (body: { type: string; code?: string }): 200 | 400 | 401 =>
  body.type !== 'error' ? 200 : body.code === 'login' ? 401 : 400;

api.get('/state', async (c) => {
  try {
    return c.json(await getState(await dayForPost()));
  } catch (error) {
    return c.json(fail(error), 500);
  }
});

api.get('/summary', async (c) => {
  try {
    return c.json(await getSummary(await dayForPost()));
  } catch (error) {
    return c.json(fail(error), 500);
  }
});

api.post('/drop', async (c) => {
  try {
    const body = await c.req.json<DropRequest>();
    const result = await dropBuoy(await dayForPost(), body.cell);
    return c.json(result, statusFor(result));
  } catch (error) {
    return c.json(fail(error), 500);
  }
});

api.post('/share', async (c) => {
  try {
    const result = await shareResult(await dayForPost());
    return c.json(result, statusFor(result));
  } catch (error) {
    return c.json(fail(error), 500);
  }
});
