import { jest } from '@jest/globals';
import { initSQLiteSync } from '../src/ui/sqliteSync.js';

function fakeService(state, token = '') {
    let listener;
    return {
        provider: 'sqlite',
        getDeviceToken: jest.fn(() => token),
        getSyncState: jest.fn(() => state),
        subscribeSync: jest.fn(callback => { listener = callback; return jest.fn(); }),
        emit: next => listener(next),
        setDeviceToken: jest.fn(value => { token = value; }),
        clearDeviceToken: jest.fn(() => { token = ''; }),
        retryPending: jest.fn(async () => state),
        adoptServerProgress: jest.fn(async () => ({ id: 91, revision: 4 })),
        exportLocalDrafts: jest.fn(() => ({ drafts: [] }))
    };
}

describe('Shared storage controls', () => {
    let dispose;
    beforeEach(() => { document.body.innerHTML = '<main></main>'; });
    afterEach(() => { dispose?.(); dispose = null; });

    test('Supabase does not mount migration controls', () => {
        dispose = initSQLiteSync({ provider: 'supabase' });
        expect(document.getElementById('sqlite-sync-panel')).toBeNull();
    });

    test('does not claim synchronization without access or a successful read', () => {
        const service = fakeService({ pendingCount: 0, conflicts: [], status: 'synced', progressKnown: false });
        dispose = initSQLiteSync(service);
        expect(document.getElementById('sqlite-sync-status').textContent).toContain('Introduce tu código');
        service.setDeviceToken('private-token');
        service.emit(service.getSyncState());
        expect(document.getElementById('sqlite-sync-status').textContent).toContain('Pendiente de comprobar');
        expect(document.body.innerHTML).not.toContain('private-token');
    });

    test('shows pending writes as local even with a saved token', () => {
        const state = { pendingCount: 2, conflicts: [], status: 'pending', progressKnown: true };
        dispose = initSQLiteSync(fakeService(state, 'private-token'));
        expect(document.getElementById('sqlite-sync-status').textContent).toContain('2 cambios pendientes');
        expect(document.querySelector('input').type).toBe('password');
        expect(document.querySelector('input').value).toBe('');
        expect(document.body.innerHTML).not.toContain('private-token');
    });

    test('rejecting conflict confirmation preserves local answers', async () => {
        const state = { pendingCount: 1, conflicts: [{ id: 91, test_id: 1 }] };
        const service = fakeService(state, 'private-token');
        dispose = initSQLiteSync(service, { confirm: async () => false });
        [...document.querySelectorAll('button')].find(b => b.textContent === 'Usar la versión compartida').click();
        await Promise.resolve();
        expect(service.adoptServerProgress).not.toHaveBeenCalled();
    });

    test('confirmed conflict pauses saves before adopting and reloading', async () => {
        const state = { pendingCount: 1, conflicts: [{ id: 91, test_id: 1 }] };
        const service = fakeService(state, 'private-token');
        const order = [];
        service.adoptServerProgress.mockImplementation(async id => { order.push(`adopt:${id}`); });
        dispose = initSQLiteSync(service, {
            confirm: async () => true,
            beforeResolve: async () => { order.push('pause'); },
            onResolved: () => { order.push('reload'); }
        });
        [...document.querySelectorAll('button')].find(b => b.textContent === 'Usar la versión compartida').click();
        for (let i = 0; i < 8; i++) await Promise.resolve();
        expect(order).toEqual(['pause', 'adopt:91', 'reload']);
    });

    test('public mode has no code controls and keeps normal or online pending states hidden', () => {
        const state = { accessMode: 'public', status: 'synced', connection: 'online', pendingCount: 0, conflicts: [] };
        const service = fakeService(state);
        dispose = initSQLiteSync(service);
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(true);
        expect(document.querySelector('#sqlite-device-token')).toBeNull();
        expect(document.querySelector('form')).toBeNull();
        expect(document.body.textContent).not.toContain('Datos compartidos');
        expect(document.body.textContent).not.toContain('Olvidar acceso');
        expect(service.getDeviceToken).not.toHaveBeenCalled();
        service.emit({ ...state, status: 'pending', pendingCount: 2 });
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(true);
        service.emit({ ...state, status: 'syncing' });
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(true);
    });

    test('public mode exposes offline recovery and hides it after synchronization', () => {
        const state = { accessMode: 'public', status: 'pending', connection: 'offline', pendingCount: 1, conflicts: [] };
        const service = fakeService(state);
        dispose = initSQLiteSync(service);
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(false);
        expect(document.querySelector('h2').textContent).toBe('No se pudo guardar');
        expect(document.querySelector('#sqlite-device-token')).toBeNull();
        service.emit({ ...state, pendingCount: 0, status: 'synced', connection: 'online' });
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(true);
    });

    test('public mode retries on reconnect without requiring access credentials', async () => {
        const state = { accessMode: 'public', status: 'synced', connection: 'online', pendingCount: 0, conflicts: [] };
        const service = fakeService(state), onConnected = jest.fn();
        dispose = initSQLiteSync(service, { onConnected });
        window.dispatchEvent(new Event('online'));
        for (let i = 0; i < 5; i++) await Promise.resolve();
        expect(service.retryPending).toHaveBeenCalledTimes(1);
        expect(onConnected).toHaveBeenCalledTimes(1);
        expect(service.getDeviceToken).not.toHaveBeenCalled();
    });

    test('public conflicts require explicit recovery while preserving the anonymous interface', () => {
        const service = fakeService({ accessMode: 'public', pendingCount: 1, conflicts: [{ id: 91, test_id: 1 }], connection: 'online' });
        dispose = initSQLiteSync(service);
        expect(document.querySelector('#sqlite-sync-panel').hidden).toBe(false);
        expect(document.querySelector('h2').textContent).toBe('Cambios en otro dispositivo');
        expect(document.querySelector('form')).toBeNull();
        expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Usar la versión compartida')).toBe(true);
    });
});
