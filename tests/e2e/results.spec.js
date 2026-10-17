import { test, expect } from '@playwright/test';

test.describe('Results View Visuals', () => {

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
        await page.locator('.btn-start-test').first().click();
        await page.waitForSelector('#questions-container', { state: 'visible' });
    });

    const themes = ['light', 'dark'];

    for (const theme of themes) {
        test.describe(`${theme} mode`, () => {
            test.beforeEach(async ({ page }) => {
                const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
                if (theme === 'dark' && !isDark) {
                    await page.click('#theme-toggle');
                } else if (theme === 'light' && isDark) {
                    await page.click('#theme-toggle');
                }
            });

            test('Summary - Correct Answer Feedback', async ({ page }) => {
                await page.locator('input[name="pregunta-0"][value="3"]').check();
                await page.click('#btn-finish');
                await page.waitForSelector('#result-view', { state: 'visible' });
                await page.waitForSelector('#result-container .border-l-4', { state: 'visible' });

                const firstResult = page.locator('#result-container .border-l-4').first();
                await firstResult.scrollIntoViewIfNeeded();

                await expect(firstResult).toHaveScreenshot(`result-correct-${theme}.png`);
            });

            test('Summary - Incorrect Answer Feedback', async ({ page }) => {
                await page.locator('input[name="pregunta-0"][value="1"]').check();
                await page.click('#btn-finish');
                await page.waitForSelector('#result-view', { state: 'visible' });
                await page.waitForSelector('#result-container .border-l-4', { state: 'visible' });

                const firstResult = page.locator('#result-container .border-l-4').first();
                await firstResult.scrollIntoViewIfNeeded();

                await expect(firstResult).toHaveScreenshot(`result-incorrect-${theme}.png`);
            });

            test('Summary - Full Score View', async ({ page }) => {
                await page.locator('input[name="pregunta-0"][value="3"]').check();
                await page.click('#btn-finish');
                await page.waitForSelector('#result-view', { state: 'visible' });

                const summaryHeader = page.locator('.glass-card.p-8').first();
                await expect(summaryHeader).toHaveScreenshot(`result-summary-${theme}.png`);
            });
        });
    }
});
