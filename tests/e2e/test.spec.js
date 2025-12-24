import { test, expect } from '@playwright/test';

test.describe('Test View Visuals', () => {

    test.beforeEach(async ({ page }) => {
        // Capturar logs de la aplicación para diagnóstico
        page.on('console', msg => console.log('APP:', msg.text()));

        await page.addInitScript(() => {
            window.__TEST_MODE__ = true;
        });

        // DESACTIVAR ANIMACIONES: Crucial para estabilidad total y snapshots deterministas.
        await page.addInitScript(() => {
            const style = document.createElement('style');
            style.innerHTML = `
                *, *::before, *::after {
                    transition: none !important;
                    animation: none !important;
                    scroll-behavior: auto !important;
                    scroll-snap-type: none !important;
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

            test('List Mode - End View', async ({ page }) => {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await expect(page).toHaveScreenshot(`test-list-end-${theme}.png`);
            });

            test('Slider Mode - Middle Navigation', async ({ page }) => {
                await page.click('#view-mode-toggle');
                await page.waitForSelector('#questions-container.slider-mode', { state: 'visible' });

                // Navegamos a la segunda pregunta
                await page.click('#slider-next');

                // Con la nueva arquitectura INDEX-DRIVEN, el botón aparece AL INSTANTE
                await expect(page.locator('#slider-prev')).toBeVisible();

                await expect(page).toHaveScreenshot(`test-slider-middle-${theme}.png`);
            });

            test('Slider Mode - End Controls', async ({ page }) => {
                await page.click('#view-mode-toggle');
                await page.waitForSelector('#questions-container.slider-mode', { state: 'visible' });

                // Navegamos hasta el final (Test 1 tiene 3 preguntas)
                // Q1 -> Q2
                await page.click('#slider-next');
                // Q2 -> Q3 (Aquí aparece el botón de finalizar INSTANTÁNEAMENTE)
                await page.click('#slider-next');

                // Verificamos que el botón de finalizar aparezca SIN ESPERAS NI HACKS
                await expect(page.locator('#slider-finish')).toBeVisible();

                await expect(page).toHaveScreenshot(`test-slider-end-${theme}.png`);
            });
        });
    }
});
