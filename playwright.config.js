import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const hasEdge =
  process.platform === 'win32' &&
  existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3041',
    channel: hasEdge ? 'msedge' : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node backend/src/server.js --production',
    url: 'http://127.0.0.1:3041/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3041',
      INVESTOGRAM_DATABASE: path.resolve('.local/browser-tests-platform.sqlite'),
      AUTO_RUN: 'false',
      AUTH_RATE_LIMIT: '200',
      APP_ORIGIN: 'http://127.0.0.1:3041',
    },
  },
});
