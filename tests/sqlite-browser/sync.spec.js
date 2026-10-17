import { test, expect } from '@playwright/test';

async function openShared(page) {
    await page.goto('/');
    await expect(page.locator('.btn-start-test[data-id="1"]')).toBeVisible();
    await expect(page.locator('#sqlite-device-token')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Conectar', exact: true })).toHaveCount(0);
    await expect(page.locator('#sqlite-sync-panel')).toBeHidden();
}

async function answer(page, index, optionIndex) {
    const input = page.locator(`input[name="pregunta-${index}"]`).nth(optionIndex);
    await input.check({ force: true });
}

test('two browser devices preserve a conflict, explicitly reload, then share offline edits', async ({ browser }) => {
    const deviceA = await browser.newContext();
    const deviceB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
        const a = await deviceA.newPage();
        const b = await deviceB.newPage();
        const authorization = [];
        for (const page of [a, b]) page.on('request', request => {
            if (new URL(request.url()).pathname.startsWith('/api/')) authorization.push(request.headers().authorization);
        });
        await openShared(a);
        await openShared(b);
        await a.getByRole('button', { name: 'Continuar Test' }).click();
        await b.getByRole('button', { name: 'Continuar Test' }).click();
        await expect(a.locator('input[name="pregunta-0"]').first()).toBeAttached();
        await expect(b.locator('input[name="pregunta-0"]').first()).toBeAttached();
        await answer(a, 0, 0);
        await expect(a.locator('#save-indicator')).toHaveText('Sincronizado', { timeout: 10000 });
        await expect(a.locator('#sqlite-sync-panel')).toBeHidden();
        await answer(b, 0, 1);
        await expect(b.locator('#sqlite-sync-status')).toContainText('cambios de otro dispositivo', { timeout: 10000 });
        await expect(b.locator('input[name="pregunta-0"]').nth(1)).toBeChecked();
        await expect(b.locator('#save-indicator')).toContainText('otro dispositivo');
        const width = await b.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(width.content).toBeLessThanOrEqual(width.viewport);
        await b.evaluate(() => window.scrollTo(0, 0));
        await b.screenshot({ path: '.migration/sqlite-conflict-preview.png' });
        await b.getByRole('button', { name: 'Usar la versión compartida' }).click();
        await b.getByRole('button', { name: 'Confirmar', exact: true }).click();
        await expect(b.getByRole('button', { name: 'Continuar Test' })).toBeVisible();
        await b.getByRole('button', { name: 'Continuar Test' }).click();
        await expect(b.locator('input[name="pregunta-0"]').first()).toBeChecked();

        await deviceB.setOffline(true);
        await answer(b, 1, 1);
        await expect(b.locator('#save-indicator')).toContainText('este dispositivo', { timeout: 10000 });
        await expect(b.locator('#sqlite-sync-panel')).toBeVisible();
        await deviceB.setOffline(false);
        await expect(b.locator('#sqlite-sync-panel')).toBeHidden({ timeout: 10000 });
        await answer(b, 2, 2);
        await expect(b.locator('#save-indicator')).toHaveText('Sincronizado', { timeout: 10000 });
        await a.reload();
        await a.getByRole('button', { name: 'Continuar Test' }).click();
        await expect(a.locator('input[name="pregunta-1"]').nth(1)).toBeChecked();
        await expect(a.locator('input[name="pregunta-2"]').nth(2)).toBeChecked();

        const tokenKeys = await b.evaluate(() => Object.keys(localStorage).filter(key => key.endsWith(':token')));
        expect(tokenKeys).toEqual([]);
        expect(authorization.length).toBeGreaterThan(0);
        expect(authorization.every(value => value === undefined)).toBe(true);
    } finally {
        await deviceA.close();
        await deviceB.close();
    }
});

test('an offline creation remains editable after its own acknowledgement without reloading', async ({ browser }) => {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await openShared(page);
        await page.locator('.btn-start-test[data-id="2"]').click();
        await expect(page.locator('input[name="pregunta-0"]').first()).toBeAttached();
        await context.setOffline(true);
        await answer(page, 0, 0);
        await expect(page.locator('#save-indicator')).toContainText('este dispositivo', { timeout: 10000 });
        await expect(page.locator('#sqlite-sync-panel')).toBeVisible();
        await context.setOffline(false);
        await expect(page.locator('#sqlite-sync-panel')).toBeHidden({ timeout: 10000 });
        await answer(page, 1, 1);
        await expect(page.locator('#save-indicator')).toHaveText('Sincronizado', { timeout: 10000 });
        await page.reload();
        await page.locator('.btn-start-test[data-id="2"]').click();
        await expect(page.locator('input[name="pregunta-0"]').first()).toBeChecked();
        await expect(page.locator('input[name="pregunta-1"]').nth(1)).toBeChecked();
    } finally {
        await context.close();
    }
});
