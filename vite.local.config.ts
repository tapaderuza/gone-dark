// Plays the game in a plain browser against src/client/mock.ts (no Reddit, no Devvit server).
// npm run dev:local  →  http://localhost:5199/game.html  (?day=N, ?crowd=1)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  mode: 'mock',
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      'virtual:gd-regions': fileURLToPath(
        new URL('./src/server/data/regions.json', import.meta.url)
      ),
    },
  },
  server: { port: 5199, strictPort: true },
});
