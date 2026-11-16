import { defineConfig } from '@playwright/test';

const browserName = process.env.MSL_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    browserName,
    baseURL: 'http://127.0.0.1:5173/MSL/',
    viewport: { width: 1440, height: 1100 },
    launchOptions: browserName === 'chromium' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/MSL/',
    reuseExistingServer: !process.env.CI,
  },
});
