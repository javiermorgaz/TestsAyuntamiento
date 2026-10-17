import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    testDir: './sqlite-browser',
    testMatch: '**/*.spec.js',
    workers: 1,
    timeout: 45000,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:5175',
        ...devices['Desktop Chrome'],
        trace: 'retain-on-failure'
    },
    webServer: [
        {
            command: 'python3 tests/sqlite-browser/serve-api.py',
            cwd: workspace,
            url: 'http://127.0.0.1:8766/health',
            reuseExistingServer: false
        },
        {
            command: 'pnpm exec vite --host 127.0.0.1 --port 5175 --strictPort',
            cwd: workspace,
            url: 'http://127.0.0.1:5175',
            env: {
                VITE_DATA_PROVIDER: 'sqlite',
                VITE_SQLITE_ACCESS_MODE: 'public',
                VITE_SQLITE_API_URL: 'http://127.0.0.1:8766',
                __TEST_MODE__: 'false'
            },
            reuseExistingServer: false
        }
    ]
});
