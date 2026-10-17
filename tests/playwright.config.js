import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Playwright configuration for Visual Regression Testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.js',
    testIgnore: '**/*.test.js',
    /* Maximum time one test can run for. */
    timeout: 30 * 1000,
    expect: {
        /**
         * Maximum time expect() should wait for the condition to be met.
         */
        timeout: 5000,
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.01,
        },
    },
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Global Test Mode for our custom mocking system */
        launchOptions: {
            env: {
                ...process.env,
                __TEST_MODE__: 'true'
            }
        },

        /* Fixed Viewport for Stable Screenshots (iPhone 13/14 style) */
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: `pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        url: baseURL,
        reuseExistingServer: false,
    },
});
