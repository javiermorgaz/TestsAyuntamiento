/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { createSQLiteDataService } from '../src/services/sqliteDataService.js';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const sample = (extra = {}) => ({ test_id: 1, answers_data: [null, 'A'], total_questions: 2, ...extra });
const saved = (extra = {}) => ({ ...sample(), id: 12, revision: 1, status: 'in_progress', ...extra });
const apiUrl = 'https://tests.example/api-root';
const managers = new WeakMap();
function locks(disk) {
    if (!managers.has(disk)) {
        let tail = Promise.resolve();
        managers.set(disk, { request(_name, fn) { const call = tail.then(fn); tail = call.catch(() => {}); return call; } });
    }
    return managers.get(disk);
}
let counter;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const storage = () => {
    const map = new Map();
    return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
function setup(fetchImpl = jest.fn(), disk = storage(), token = true, options = {}) {
    const service = createSQLiteDataService({ apiUrl, fetchImpl, storage: disk, uuid, lockManager: locks(disk), ...options });
    if (token) service.setDeviceToken('private-device-token');
    return { service, fetchImpl, disk };
}

beforeEach(() => { counter = 0; });

test('persists offline create across reload and retries its exact operation', async () => {
    const first = setup(jest.fn().mockRejectedValue(new Error('offline')));
    const draft = await first.service.saveProgress(sample());
    expect(draft.id).toMatch(/^local:/);
    expect(draft.syncStatus).toBe('pending');
    const original = JSON.parse(first.fetchImpl.mock.calls[0][1].body);
    const second = setup(jest.fn().mockResolvedValue(response(saved())), first.disk, false);
    await second.service.retryPending();
    expect(JSON.parse(second.fetchImpl.mock.calls[0][1].body)).toEqual(original);
    expect(second.service.getSyncState().pendingCount).toBe(0);
    expect(second.service.exportLocalDrafts().attempts[draft.id].draft.id).toBe(12);
});

test('lost response replays the same UUID and body instead of creating another result', async () => {
    let firstBody;
    const fetchImpl = jest.fn()
        .mockImplementationOnce(async (_url, options) => { firstBody = options.body; throw new Error('response lost'); })
        .mockImplementationOnce(async (_url, options) => { expect(options.body).toBe(firstBody); return response(saved()); });
    const { service } = setup(fetchImpl);
    await service.saveProgress(sample());
    await service.retryPending();
    expect(service.getSyncState().pendingCount).toBe(0);
});

test('concurrent autosaves chain one create and an update using its own acknowledgement', async () => {
    let release;
    let start;
    const started = new Promise(resolve => { start = resolve; });
    const fetchImpl = jest.fn()
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; start(); }))
        .mockResolvedValueOnce(response(saved({ revision: 2, answers_data: ['B', 'C'] })));
    const { service } = setup(fetchImpl);
    const first = service.saveProgress(sample());
    await started;
    const second = service.saveProgress(sample({ answers_data: ['B', 'C'] }));
    release(response(saved()));
    const results = await Promise.all([first, second]);
    expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PUT']);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${apiUrl}/api/progress/12`);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).revision).toBe(1);
    expect(results[1]).toMatchObject({ id: 12, revision: 2, syncStatus: 'synced' });
});

test('preserves the caller revision even after reading a newer remote revision', async () => {
    const fetchImpl = jest.fn()
        .mockResolvedValueOnce(response([saved({ revision: 9 })]))
        .mockResolvedValueOnce(response({ error: 'revision_conflict', current: saved({ revision: 9 }) }, 409));
    const { service } = setup(fetchImpl);
    await service.fetchAllProgress();
    const result = await service.saveProgress(sample({ id: 12, revision: 2 }));
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).revision).toBe(2);
    expect(result.syncStatus).toBe('conflict');
    expect(service.getSyncState().conflicts[0].draft.answers_data).toEqual([null, 'A']);
});

test('conflicts stop their entire chain and adopting re-reads the current server version', async () => {
    const fetchImpl = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(response({ error: 'revision_conflict', current: saved({ revision: 4 }) }, 409))
        .mockResolvedValueOnce(response(saved({ revision: 5, answers_data: ['D', null] })));
    const { service } = setup(fetchImpl);
    await service.saveProgress(sample({ id: 12, revision: 1 }));
    const result = await service.saveProgress(sample({ id: 12, revision: 1, answers_data: ['B', null] }));
    expect(result.syncStatus).toBe('conflict');
    expect(service.getSyncState().pendingCount).toBe(2);
    await service.retryPending();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const current = await service.adoptServerProgress(12);
    expect(current.revision).toBe(5);
    expect(service.getSyncState().pendingCount).toBe(0);
    expect(fetchImpl.mock.calls[2][0]).toBe(`${apiUrl}/api/progress/12`);
});

test('server tombstone never resurrects a local draft', async () => {
    const { service, fetchImpl } = setup(jest.fn().mockResolvedValue(response({ error: 'progress_deleted' }, 410)));
    const result = await service.saveProgress(sample({ id: 12, revision: 1 }));
    expect(result.syncStatus).toBe('conflict');
    expect(service.exportLocalDrafts().attempts['12'].draft.answers_data).toEqual([null, 'A']);
    await service.retryPending();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await service.adoptServerProgress(12)).toBeNull();
    expect(service.getSyncState().pendingCount).toBe(0);
});

test('token rejection retains queued data and resumes only with a new token', async () => {
    const fetchImpl = jest.fn()
        .mockResolvedValueOnce(response({ error: 'unauthorized' }, 401))
        .mockResolvedValueOnce(response(saved()));
    const { service } = setup(fetchImpl);
    const result = await service.saveProgress(sample());
    expect(result.syncStatus).toBe('pending');
    expect(service.getSyncState()).toMatchObject({ authRequired: true, pendingCount: 1 });
    expect(JSON.stringify(service.exportLocalDrafts())).not.toContain('private-device-token');
    service.setDeviceToken('replacement-token');
    await service.retryPending();
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer replacement-token');
    expect(service.getSyncState().pendingCount).toBe(0);
});

test('delete queued behind offline creation resolves its ID and revision, blocking further autosaves', async () => {
    const fetchImpl = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(response(saved()))
        .mockResolvedValueOnce(response({ id: 12, deleted: true }));
    const { service } = setup(fetchImpl);
    const draft = await service.saveProgress(sample());
    const deletion = await service.deleteProgress(draft.id, draft.revision);
    expect(deletion).toEqual({ id: 12, deleted: true, syncStatus: 'synced' });
    expect(fetchImpl.mock.calls[2][0]).toBe(`${apiUrl}/api/progress/12`);
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).revision).toBe(1);
    expect(service.getSyncState().pendingCount).toBe(0);
});

test('pending delete hides cached row but blocks new saves and keeps exportable data', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([saved()])).mockRejectedValue(new Error('offline'));
    const { service } = setup(fetchImpl);
    await service.fetchAllProgress();
    expect(await service.deleteProgress(12, 1)).toMatchObject({ syncStatus: 'pending' });
    expect(await service.fetchAllProgress()).toEqual([]);
    await expect(service.saveProgress(sample({ id: 12, revision: 1 }))).rejects.toMatchObject({ code: 'pending_delete' });
    expect(service.exportLocalDrafts().attempts['12'].draft.answers_data).toEqual([null, 'A']);
});

test('cached progress is overlaid with local edits, not overwritten by a successful remote read', async () => {
    const fetchImpl = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(response([saved({ answers_data: ['remote', null] })]));
    const { service } = setup(fetchImpl);
    await service.saveProgress(sample({ id: 12, revision: 1, answers_data: ['local', null] }));
    const rows = await service.fetchAllProgress();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ answers_data: ['local', null], syncStatus: 'pending' });
});

test('completion preserves in_progress and score fields through queued autosaves', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(saved({ revision: 2, total_correct: 1, score_percentage: 50 })));
    const { service } = setup(fetchImpl);
    const result = await service.completeTest(sample({ id: 12, revision: 1, total_correct: 1, score_percentage: 50 }));
    expect(result.status).toBe('in_progress');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ total_correct: 1, score_percentage: 50 });
});

test('storage quota failure fails explicitly before any remote request', async () => {
    const disk = storage();
    const { service, fetchImpl } = setup(jest.fn(), disk);
    disk.setItem = () => { throw new Error('quota'); };
    await expect(service.saveProgress(sample())).rejects.toMatchObject({ code: 'storage_unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.getSyncState().status).toBe('error');
});

test('after remote success and local persistence failure, restart retries the original operation', async () => {
    const disk = storage();
    const normalSet = disk.setItem;
    const fetchImpl = jest.fn().mockImplementationOnce(async () => {
        disk.setItem = () => { throw new Error('quota'); };
        return response(saved());
    });
    const { service } = setup(fetchImpl, disk);
    await expect(service.saveProgress(sample())).rejects.toMatchObject({ code: 'storage_unavailable' });
    disk.setItem = normalSet;
    const restarted = setup(jest.fn().mockResolvedValue(response(saved())), disk, false);
    await restarted.service.retryPending();
    expect(restarted.fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[0][1].body);
});

test('rejects missing revisions, unknown local IDs and invalid IDs without rebasing or requests', async () => {
    const { service, fetchImpl } = setup();
    await expect(service.saveProgress(sample({ id: 12 }))).rejects.toMatchObject({ code: 'missing_revision' });
    await expect(service.saveProgress(sample({ id: 'local:unknown', revision: 1 }))).rejects.toMatchObject({ code: 'unknown_local_id' });
    await expect(service.saveProgress(sample({ id: 'wrong', revision: 1 }))).rejects.toMatchObject({ code: 'invalid_id' });
    expect(fetchImpl).not.toHaveBeenCalled();
});

test('a fetch timeout becomes a durable pending operation', async () => {
    const { service } = setup(jest.fn().mockImplementation(() => new Promise(() => {})), storage(), true, { timeoutMs: 5 });
    expect(await service.saveProgress(sample())).toMatchObject({ syncStatus: 'pending' });
    expect(service.getSyncState().pendingCount).toBe(1);
});

test('API namespaces prevent drafts and tokens leaking between deployments', async () => {
    const disk = storage();
    const first = setup(jest.fn().mockRejectedValue(new Error('offline')), disk);
    await first.service.saveProgress(sample());
    const second = setup(jest.fn(), disk, false, { apiUrl: 'https://different.example' });
    expect(second.service.getDeviceToken()).toBe('');
    expect(second.service.getSyncState().pendingCount).toBe(0);
});

test('two tabs serialize storage access while a stale caller revision still conflicts', async () => {
    const disk = storage();
    const first = setup(jest.fn().mockResolvedValue(response(saved({ revision: 2, answers_data: ['first', null] }))), disk);
    const second = setup(jest.fn().mockResolvedValue(response({ error: 'revision_conflict', current: saved({ revision: 2 }) }, 409)), disk);
    await first.service.saveProgress(sample({ id: 12, revision: 1, answers_data: ['first', null] }));
    const result = await second.service.saveProgress(sample({ id: 12, revision: 1, answers_data: ['second', null] }));
    expect(result.syncStatus).toBe('conflict');
    expect(JSON.parse(second.fetchImpl.mock.calls[0][1].body).revision).toBe(1);
    expect(second.service.getSyncState().pendingCount).toBe(1);
    expect(second.service.exportLocalDrafts().attempts['12'].draft.answers_data).toEqual(['second', null]);
});

test('two offline tabs retain both operations rather than overwrite the shared queue', async () => {
    const disk = storage();
    const first = setup(jest.fn().mockRejectedValue(new Error('offline')), disk);
    const second = setup(jest.fn().mockRejectedValue(new Error('offline')), disk);
    await first.service.saveProgress(sample({ id: 12, revision: 1 }));
    await second.service.saveProgress(sample({ id: 15, revision: 3, test_id: 2 }));
    expect(second.service.getSyncState().pendingCount).toBe(2);
    const restarted = setup(jest.fn().mockRejectedValue(new Error('offline')), disk, false);
    expect(restarted.service.exportLocalDrafts().queue.map(q => q.path)).toEqual(['/api/progress/12', '/api/progress/15']);
});

test('without Web Locks, saving fails before touching drafts or making requests', async () => {
    const { service, fetchImpl } = setup(jest.fn(), storage(), true, { lockManager: null });
    await expect(service.saveProgress(sample())).rejects.toMatchObject({ code: 'unsupported_browser' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.getSyncState().pendingCount).toBe(0);
});

test('an unrelated revision in an existing own queue is never replaced with its previous acknowledgement', async () => {
    const { service, fetchImpl } = setup(jest.fn().mockRejectedValue(new Error('offline')));
    await service.saveProgress(sample({ id: 12, revision: 1 }));
    await service.saveProgress(sample({ id: 12, revision: 99 }));
    const operations = service.exportLocalDrafts().queue;
    expect(operations[1].body.revision).toBe(99);
    expect(operations[1].parentId).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('local pending drafts are preferred over other remote attempts when resuming a theme', async () => {
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([saved()]));
    const { service } = setup(fetchImpl);
    const draft = await service.saveProgress(sample({ answers_data: ['local', null] }));
    const resumed = await service.findTestProgress(1);
    expect(resumed.id).toBe(draft.id);
    expect(resumed.answers_data).toEqual(['local', null]);
});

test('a stale read cannot replace a newer acknowledged revision or resurrect a confirmed deletion', async () => {
    const fetchImpl = jest.fn()
        .mockResolvedValueOnce(response(saved({ revision: 2, answers_data: ['newer', null] })))
        .mockResolvedValueOnce(response([saved({ revision: 1 })]))
        .mockResolvedValueOnce(response({ id: 12, deleted: true }))
        .mockResolvedValueOnce(response([saved({ revision: 1 })]));
    const { service } = setup(fetchImpl);
    await service.saveProgress(sample({ id: 12, revision: 1, answers_data: ['newer', null] }));
    expect((await service.fetchAllProgress())[0]).toMatchObject({ revision: 2, answers_data: ['newer', null] });
    await service.deleteProgress(12, 2);
    expect(await service.fetchAllProgress()).toEqual([]);
});

test('offline creation followed by an external retry resolves the old local alias for the next save', async () => {
    const fetchImpl = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(response(saved()))
        .mockResolvedValueOnce(response(saved({ revision: 2, answers_data: ['next', null] })));
    const { service } = setup(fetchImpl);
    const local = await service.saveProgress(sample());
    await service.retryPending();
    expect(service.resolveProgressReference(local.id, null)).toEqual({ id: 12, revision: 1 });
    const result = await service.saveProgress(sample({ id: local.id, revision: null, answers_data: ['next', null] }));
    expect(result).toMatchObject({ id: 12, revision: 2, syncStatus: 'synced' });
    expect(fetchImpl.mock.calls[2][0]).toBe(`${apiUrl}/api/progress/12`);
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).revision).toBe(1);
});

test('offline updates acknowledge their own revision chain before a later autosave with the original reference', async () => {
    const fetchImpl = jest.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(response(saved({ revision: 2 })))
        .mockResolvedValueOnce(response(saved({ revision: 3 })));
    const { service } = setup(fetchImpl);
    await service.saveProgress(sample({ id: 12, revision: 1 }));
    await service.retryPending();
    expect(service.resolveProgressReference(12, 1)).toEqual({ id: 12, revision: 2 });
    expect(await service.saveProgress(sample({ id: 12, revision: 1 }))).toMatchObject({ revision: 3, syncStatus: 'synced' });
    expect(JSON.parse(fetchImpl.mock.calls[2][1].body).revision).toBe(2);
    expect(service.resolveProgressReference(12, 1)).toEqual({ id: 12, revision: 3 });
    expect(service.resolveProgressReference(12, 2)).toEqual({ id: 12, revision: 3 });
});

test('another tab acknowledgement is never used to resolve this editor original revision', async () => {
    const disk = storage();
    const first = setup(jest.fn().mockResolvedValue(response(saved({ revision: 2 }))), disk);
    const second = setup(jest.fn().mockResolvedValue(response({ error: 'revision_conflict', current: saved({ revision: 2 }) }, 409)), disk);
    await first.service.saveProgress(sample({ id: 12, revision: 1 }));
    await second.service.saveProgress(sample({ id: 12, revision: 1 }));
    expect(second.service.resolveProgressReference(12, 1)).toEqual({ id: 12, revision: 1 });
    expect(JSON.parse(second.fetchImpl.mock.calls[0][1].body).revision).toBe(1);
});

test('an older GET and a new POST are serialized so a delayed old list cannot erase acknowledged progress', async () => {
    let release, started;
    const reading = new Promise(resolve => { started = resolve; });
    const fetchImpl = jest.fn()
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; started(); }))
        .mockResolvedValueOnce(response(saved()))
        .mockRejectedValueOnce(new Error('offline'));
    const { service } = setup(fetchImpl);
    const oldRead = service.fetchAllProgress();
    await reading;
    const newSave = service.saveProgress(sample());
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release(response([]));
    await oldRead;
    const acknowledged = await newSave;
    expect(acknowledged.syncStatus).toBe('synced');
    expect((await service.fetchAllProgress())[0]).toMatchObject({ id: 12, revision: 1 });
});

test.each([
    'http://public.example', 'https://user:secret@tests.example', 'https://tests.example?key=secret',
    'https://tests.example#secret', 'https://tests.example?', 'file:///database', 'javascript:alert(1)'
])('rejects unsafe API URL %s before saving a draft or emitting the token', async configuredUrl => {
    const { service, fetchImpl } = setup(jest.fn(), storage(), true, { apiUrl: configuredUrl });
    await expect(service.saveProgress(sample())).rejects.toMatchObject({ code: 'configuration' });
    expect(service.getSyncState()).toMatchObject({ pendingCount: 0, status: 'error' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(service.exportLocalDrafts().queue).toEqual([]);
});

test.each(['https://tests.example', 'http://localhost:8765', 'http://127.0.0.1:8765', 'http://[::1]:8765'])('accepts safe API URL %s and refuses API redirects', async configuredUrl => {
    const { service, fetchImpl } = setup(jest.fn().mockResolvedValue(response(saved())), storage(), true, { apiUrl: configuredUrl });
    expect(await service.saveProgress(sample())).toMatchObject({ syncStatus: 'synced' });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer private-device-token' } });
});

test('pendingDeletes identifies a theme until its deletion is confirmed', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([saved()])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response({ id: 12, deleted: true }));
    const { service } = setup(fetchImpl);
    await service.fetchAllProgress();
    await service.deleteProgress(12, 1);
    expect(service.getSyncState().pendingDeletes).toEqual([1]);
    await service.retryPending();
    expect(service.getSyncState().pendingDeletes).toEqual([]);
});

test('public access loads and saves without enrolling a device or sending Authorization', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(response([saved()])).mockResolvedValueOnce(response(saved({ revision: 2 })));
    const { service } = setup(fetchImpl, storage(), false, { accessMode: 'public' });
    expect(service.getSyncState()).toMatchObject({ accessMode: 'public', authRequired: false });
    await service.fetchAllProgress();
    expect(await service.saveProgress(sample({ id: 12, revision: 1 }))).toMatchObject({ syncStatus: 'synced' });
    for (const [, options] of fetchImpl.mock.calls) expect(options.headers).not.toHaveProperty('Authorization');
});

test('switching to public mode preserves existing drafts and ignores stored device credentials', async () => {
    const disk = storage();
    const legacy = setup(jest.fn().mockRejectedValue(new Error('offline')), disk);
    await legacy.service.saveProgress(sample());
    const original = legacy.service.exportLocalDrafts().queue[0];
    const { service, fetchImpl } = setup(jest.fn().mockResolvedValue(response(saved())), disk, false, { accessMode: 'public' });
    expect(service.getDeviceToken()).toBe('');
    expect(service.getSyncState()).toMatchObject({ pendingCount: 1, authRequired: false });
    await service.retryPending();
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).operation_id).toBe(original.operationId);
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    service.clearDeviceToken();
    expect(disk.getItem(`tests-ayuntamiento:sqlite:${apiUrl}:token`)).toBe('private-device-token');
});

test('public access never reads the legacy token key', async () => {
    const disk = storage(), read = disk.getItem;
    disk.getItem = key => { if (key.endsWith(':token')) throw new Error('Token must not be read'); return read(key); };
    const { service } = setup(jest.fn().mockResolvedValue(response(saved())), disk, false, { accessMode: 'public' });
    expect(service.getDeviceToken()).toBe('');
    expect(await service.saveProgress(sample())).toMatchObject({ syncStatus: 'synced' });
});

test('a public backend error retains queued answers and shows recovery without requesting a code', async () => {
    const { service } = setup(jest.fn().mockResolvedValue(response({ error: 'unauthorized' }, 401)), storage(), false, { accessMode: 'public' });
    expect(await service.saveProgress(sample())).toMatchObject({ syncStatus: 'pending' });
    expect(service.getSyncState()).toMatchObject({ authRequired: false, pendingCount: 1, status: 'error' });
    expect(service.getSyncState().error).toBeTruthy();
});
