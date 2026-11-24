import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { ensureDailyPost } from '../core/game';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const { postId } = await ensureDailyPost();
    return c.json<TriggerResponse>(
      { status: 'success', message: `Today's post: ${postId}` },
      200
    );
  } catch (error) {
    console.error(`Error creating post on install: ${error}`);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create post' },
      400
    );
  }
});

/** Scheduler: a new ship goes dark every day at 00:02 UTC. */
export const scheduler = new Hono();

scheduler.post('/daily-post', async (c) => {
  try {
    const { postId, created } = await ensureDailyPost();
    console.log(
      `Daily post ${created ? 'created' : 'already there'}: ${postId}`
    );
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error(`Daily post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
