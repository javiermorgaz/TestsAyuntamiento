import { test, expect } from '@playwright/test';

test.describe('List View Visuals', () => {

    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.__TEST_MODE__ = true;
        });

        // Desactivar animaciones para snapshots deterministas
        await page.addInitScript(() => {
            const style = document.createElement('style');
            style.innerHTML = `
                *, *::before, *::after {
                    transition: none !important;
                    animation: none !important;
                    scroll-behavior: auto !important;
                }
            `;
            document.head.appendChild(style);
        });

        await page.goto('/');
        await page.waitForSelector('#tests-container .glass-card:not(.skeleton-card)', { state: 'visible', timeout: 20000 });
    });

    const themes = ['light', 'dark'];

    for (const theme of themes) {
        test(`${theme} mode - Main List`, async ({ page }) => {
            const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
            if (theme === 'dark' && !isDark) {
                await page.click('#theme-toggle');
            } else if (theme === 'light' && isDark) {
                await page.click('#theme-toggle');
            }

            // Should show Test 2 with progress (from mockDataService)
            await expect(page).toHaveScreenshot(`list-main-${theme}.png`);
        });
    }
});
