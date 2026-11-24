import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { ensureDailyPost } from '../core/game';

export const menu = new Hono();

menu.post('/post-today', async (c) => {
  try {
    const { postId, created } = await ensureDailyPost();
    return c.json<UiResponse>(
      {
        showToast: created
          ? "Today's search is up"
          : "Today's search was already up",
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating today's post: ${error}`);
    return c.json<UiResponse>(
      { showToast: "Could not create today's post" },
      400
    );
  }
});
