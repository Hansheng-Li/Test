import { defineConfig } from 'vite';

export default defineConfig({
  // strictPort: saves live in localStorage, which is keyed by origin. If 5173 were busy and Vite
  // silently moved to 5174, the game would open with empty save slots. Fail loudly instead.
  server: { port: 5173, host: true, strictPort: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
