import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// The remote dev container ships a pre-installed Chromium; fall back to Playwright's own browser elsewhere.
const preinstalled = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(preinstalled) ? { executablePath: preinstalled, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
