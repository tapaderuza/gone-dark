import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [react(), tailwind(), devvit()],
  resolve: {
    alias: {
      // Only the local mock imports this; production code gets regions from the server.
      'virtual:gd-regions': fileURLToPath(
        new URL('./src/server/data/regions.json', import.meta.url)
      ),
    },
  },
});
