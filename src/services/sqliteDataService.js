/** Shared SQLite lives behind the API. Browser storage holds durable, private drafts. */
export class SQLiteServiceError extends Error {
    constructor(code, message, status = 0, current = null) {
        super(message);
        this.name = 'SQLiteServiceError';
        Object.assign(this, { code, status, current });
    }
}

const copy = value => JSON.parse(JSON.stringify(value));
const emptyState = () => ({ version: 1, tests: [], progress: [], progressKnown: false, history: {}, attempts: {}, queue: [], receipts: {}, tombstones: {}, acknowledgements: {} });
const isLocal = id => typeof id === 'string' && id.startsWith('local:');
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const bodyFields = ['test_id', 'answers_data', 'total_questions', 'total_correct', 'score_percentage'];

export function createSQLiteDataService({
    apiUrl = '', fetchImpl = (...args) => globalThis.fetch(...args),
    storage = undefined, uuid = () => globalThis.crypto.randomUUID(), timeoutMs = 12000,
    lockManager = globalThis.navigator?.locks, accessMode = 'token'
} = {}) {
    let base = '', configurationError = 'Falta la dirección de la API SQLite.';
    if (typeof apiUrl === 'string' && apiUrl.trim()) {
        try {
            const parsed = new URL(apiUrl.trim());
            const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
            if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) ||
                parsed.username || parsed.password || apiUrl.includes('?') || apiUrl.includes('#')) throw new Error('Invalid API URL');
            base = parsed.href.replace(/\/+$/, '');
            configurationError = null;
        } catch { configurationError = 'La API debe usar HTTPS (HTTP solo en localhost), sin credenciales, parámetros ni fragmentos.'; }
    }
    if (!['token', 'public'].includes(accessMode)) configurationError = 'El modo de acceso a la API no es válido.';
    const namespace = `tests-ayuntamiento:sqlite:${base || 'unconfigured'}`;
    const stateKey = `${namespace}:state`, tokenKey = `${namespace}:token`;
    let state = emptyState(), storageError = null, requestError = null, authRequired = false, connection = 'unknown';
    let flushing = null;
    let storedValue = null;
    const sessionId = uuid();
    const ownReferences = new Map(), observedAcknowledgements = new Set();
    const listeners = new Set(), receipts = new Map();
    try {
        storage ??= globalThis.localStorage;
        if (!storage) throw new Error('Storage unavailable');
        const stored = storage.getItem(stateKey);
        storedValue = stored;
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.version !== 1 || !Array.isArray(parsed.queue) || !parsed.attempts ||
                !Array.isArray(parsed.progress) || !Array.isArray(parsed.tests) || !parsed.history) {
                throw new Error('Invalid draft format');
            }
            state = { ...parsed, receipts: parsed.receipts ?? {}, tombstones: parsed.tombstones ?? {}, acknowledgements: parsed.acknowledgements ?? {} };
        }
    } catch {
        storageError = 'No se pueden leer los borradores locales. Conserva el almacenamiento para recuperarlos.';
    }

    function getSyncState() {
        const conflicts = Object.values(state.attempts).filter(a => a.blocked).map(a => ({
            id: a.draft.id, test_id: a.draft.test_id, ...a.blocked, draft: copy(a.draft)
        }));
        return {
            provider: 'sqlite', accessMode, connection, pendingCount: state.queue.length, conflicts, authRequired: accessMode === 'token' && authRequired, progressKnown: state.progressKnown === true,
            pendingDeletes: [...new Set(Object.values(state.attempts).filter(a => a.draft.deleted && validId(a.draft.test_id)).map(a => Number(a.draft.test_id)))],
            status: storageError || configurationError || requestError ? 'error' : conflicts.length ? 'conflict' : authRequired ? 'auth' :
                state.queue.length ? 'pending' : connection === 'offline' ? 'offline' : 'synced',
            error: storageError || configurationError || requestError
        };
    }
    function assertConfiguration() {
        if (configurationError) throw new SQLiteServiceError('configuration', configurationError);
    }
    function notify() { for (const fn of listeners) { try { fn(getSyncState()); } catch { /* UI callbacks cannot undo a save. */ } } }
    function commit(next) {
        if (storageError) throw new SQLiteServiceError('storage_unavailable', storageError);
        try {
            if (storage.getItem(stateKey) !== storedValue) {
                throw new SQLiteServiceError('storage_changed', 'Otra pestaña ha modificado los borradores. Recarga esta pestaña antes de continuar.');
            }
            const serialized = JSON.stringify(next);
            storage.setItem(stateKey, serialized);
            storedValue = serialized;
        }
        catch (error) {
            storageError = error.code === 'storage_changed' ? error.message : 'No hay espacio o permiso para guardar el borrador. Exporta tus respuestas antes de cerrar.';
            notify();
            throw new SQLiteServiceError('storage_unavailable', storageError);
        }
        state = next;
        notify();
    }
    function update(fn) { const next = copy(state); fn(next); commit(next); }
    function withStorageLock(fn) {
        if (!lockManager?.request) return Promise.reject(new SQLiteServiceError('unsupported_browser', 'Este navegador no permite proteger los borradores entre pestañas. Usa un navegador actualizado.'));
        return lockManager.request(namespace, async () => {
            const latest = storage.getItem(stateKey);
            if (latest !== storedValue) {
                try {
                    const parsed = latest ? JSON.parse(latest) : emptyState();
                    if (parsed.version !== 1 || !Array.isArray(parsed.queue) || !parsed.attempts) throw new Error('Invalid state');
                    state = { ...parsed, receipts: parsed.receipts ?? {}, tombstones: parsed.tombstones ?? {}, acknowledgements: parsed.acknowledgements ?? {} };
                    storedValue = latest;
                } catch { throw new SQLiteServiceError('storage_unavailable', 'Los borradores han cambiado y no se pueden leer.'); }
            }
            return fn();
        });
    }
    function getDeviceToken() {
        if (accessMode === 'public') return '';
        try { return storage?.getItem(tokenKey) || ''; }
        catch { throw new SQLiteServiceError('storage_unavailable', 'No se puede leer la clave del dispositivo.'); }
    }
    function setDeviceToken(token) {
        if (accessMode === 'public') return;
        if (typeof token !== 'string' || !token.trim()) throw new SQLiteServiceError('invalid_token', 'Introduce la clave del dispositivo.');
        try { storage.setItem(tokenKey, token.trim()); }
        catch { throw new SQLiteServiceError('storage_unavailable', 'No se puede guardar la clave del dispositivo.'); }
        authRequired = false;
        notify();
    }
    function clearDeviceToken() {
        if (accessMode === 'public') return;
        try { storage?.removeItem(tokenKey); }
        catch { throw new SQLiteServiceError('storage_unavailable', 'No se puede eliminar la clave del dispositivo.'); }
        authRequired = true;
        notify();
    }
    async function request(path, method = 'GET', body) {
        assertConfiguration();
        const token = accessMode === 'token' ? getDeviceToken() : '';
        if (accessMode === 'token' && !token) {
            authRequired = true; notify();
            throw new SQLiteServiceError('unauthorized', 'Introduce la clave del dispositivo.', 401);
        }
        const controller = new AbortController();
        let timer;
        try {
            const response = await Promise.race([
                fetchImpl(`${base}${path}`, {
                    method, signal: controller.signal, cache: 'no-store', redirect: 'error',
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
                    ...(body ? { body: JSON.stringify(body) } : {})
                }),
                new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs); })
            ]);
            let data;
            try { data = await response.json(); }
            catch { throw new SQLiteServiceError('invalid_response', 'La API devolvió una respuesta inválida.', 503); }
            if (!response.ok) {
                if (response.status === 401 && accessMode === 'token') { authRequired = true; notify(); }
                else if (response.status === 401 || response.status === 403 || response.status >= 500) {
                    requestError = 'No se pudo acceder a la base de datos. Tus respuestas pendientes se conservan.';
                    notify();
                }
                throw new SQLiteServiceError(data.error || 'request_failed', data.message || 'No se pudo guardar en el servidor.', response.status, data.current ?? null);
            }
            authRequired = false; requestError = null; connection = 'online';
            return data;
        } catch (error) {
            if (error instanceof SQLiteServiceError) throw error;
            connection = 'offline'; notify();
            throw new SQLiteServiceError('offline', 'Pendiente de conexión. Tus respuestas están guardadas en este dispositivo.');
        } finally { clearTimeout(timer); }
    }
    function keyFor(id, testId, create = false) {
        if (id !== undefined && id !== null) {
            const match = Object.entries(state.attempts).find(([key, a]) => key === String(id) || String(a.draft.id) === String(id));
            if (match) return match[0];
            if (isLocal(id)) throw new SQLiteServiceError('unknown_local_id', 'Este borrador local no existe.');
            if (!validId(id)) throw new SQLiteServiceError('invalid_id', 'Identificador de intento inválido.');
            return String(Number(id));
        }
        const local = Object.entries(state.attempts).find(([key, a]) => isLocal(key) && a.draft.test_id === testId && !a.draft.deleted);
        return local ? local[0] : create ? `local:${uuid()}` : null;
    }
    function resultFor(key) {
        const a = state.attempts[key];
        return a ? { ...copy(a.draft), syncStatus: a.blocked ? 'conflict' : state.queue.some(q => q.attemptKey === key) ? 'pending' : 'synced' } : null;
    }
    function referenceKey(id, revision) { return `${id}:${revision ?? 'new'}`; }
    function resolveProgressReference(id, revision) {
        // Only acknowledgements of operations originating in this editor can advance its reference.
        // Revisions observed through GET or another tab's writes never participate.
        for (const [operationId, ack] of Object.entries(state.acknowledgements)) {
            if (ack.sessionId !== sessionId || observedAcknowledgements.has(operationId)) continue;
            for (const [key, target] of ownReferences) {
                if (String(target.id) === String(ack.base.id) && target.revision === ack.base.revision) ownReferences.set(key, copy(ack.target));
            }
            ownReferences.set(referenceKey(ack.original.id, ack.original.revision), copy(ack.target));
            ownReferences.set(referenceKey(ack.base.id, ack.base.revision), copy(ack.target));
            observedAcknowledgements.add(operationId);
        }
        return copy(ownReferences.get(referenceKey(id, revision)) ?? { id: id ?? null, revision: revision ?? null });
    }
    function visibleProgress() {
        const map = new Map(state.progress.map(p => [String(p.id), { ...copy(p), syncStatus: 'synced' }]));
        for (const [key, a] of Object.entries(state.attempts)) {
            if (a.server) map.delete(String(a.server.id));
            if (a.draft.deleted && !a.blocked) { map.delete(String(a.draft.id)); continue; }
            map.set(String(a.draft.id ?? key), resultFor(key));
        }
        return [...map.values()].sort((a, b) => {
            const pending = p => p.syncStatus !== 'synced' ? 1 : 0;
            return pending(b) - pending(a) || (validId(b.id) ? Number(b.id) : 0) - (validId(a.id) ? Number(a.id) : 0);
        });
    }

    async function flushQueue() {
        const blocked = new Set();
        for (;;) {
            const operation = state.queue.find(q => !state.attempts[q.attemptKey]?.blocked && !blocked.has(q.attemptKey) && !q.parentId);
            if (!operation) break;
            try {
                const response = await request(operation.path, operation.method, operation.body);
                if (operation.method !== 'DELETE' && (!validId(response.id) || !Number.isSafeInteger(response.revision) || response.revision < 1)) {
                    throw new SQLiteServiceError('invalid_response', 'Falta la revisión de la respuesta del servidor.', 503);
                }
                if (operation.method === 'DELETE' && (response.deleted !== true || !validId(response.id) || !operation.path.endsWith(`/${response.id}`))) {
                    throw new SQLiteServiceError('invalid_response', 'La API no confirmó el borrado del intento.', 503);
                }
                update(next => {
                    const a = next.attempts[operation.attemptKey];
                    next.queue = next.queue.filter(q => q.operationId !== operation.operationId);
                    next.receipts[operation.operationId] = { ...copy(response), syncStatus: 'synced' };
                    if (operation.method !== 'DELETE') {
                        next.acknowledgements[operation.operationId] = {
                            sessionId: operation.sessionId,
                            original: operation.reference ?? { id: operation.attemptKey, revision: operation.body.revision ?? null },
                            base: { id: operation.method === 'POST' ? operation.attemptKey : response.id, revision: operation.body.revision ?? null },
                            target: { id: response.id, revision: response.revision }
                        };
                    }
                    const receiptIds = Object.keys(next.receipts);
                    for (const id of receiptIds.slice(0, Math.max(0, receiptIds.length - 20))) { delete next.receipts[id]; delete next.acknowledgements[id]; }
                    next.progress = next.progress.filter(p => String(p.id) !== String(response.id));
                    if (operation.method === 'DELETE') {
                        next.tombstones[String(response.id)] = operation.body.revision + 1;
                        delete next.attempts[operation.attemptKey];
                    } else {
                        a.server = copy(response);
                        next.progress.push(copy(response));
                        const children = next.queue.filter(q => q.attemptKey === operation.attemptKey);
                        a.draft.id = response.id;
                        a.draft.revision = response.revision;
                        if (!children.length) a.draft = copy(response);
                        for (const child of children.filter(q => q.parentId === operation.operationId)) {
                            child.parentId = null;
                            child.path = `/api/progress/${response.id}`;
                            child.body.revision = response.revision;
                        }
                    }
                });
                receipts.set(operation.operationId, { ...copy(response), syncStatus: 'synced' });
                resolveProgressReference(null, null);
            } catch (error) {
                if (error.code === 'storage_unavailable' || error.code === 'configuration' || error.code === 'unsupported_browser') throw error;
                if (error.status === 401 || !error.status || error.status >= 500) break;
                update(next => {
                    next.attempts[operation.attemptKey].blocked = { code: error.code, message: error.message, current: error.current, status: error.status };
                });
                blocked.add(operation.attemptKey);
            }
        }
        notify();
        return getSyncState();
    }
    function retryPending() {
        if (configurationError) return Promise.reject(new SQLiteServiceError('configuration', configurationError));
        if (flushing) return flushing;
        // Assign before starting I/O, so overlapping autosaves share a single drain.
        flushing = withStorageLock(flushQueue).finally(() => { flushing = null; });
        return flushing;
    }
    async function enqueue(data, deletion = false) {
        assertConfiguration();
        if (!deletion && (!validId(data.test_id) || !Array.isArray(data.answers_data) || !Number.isSafeInteger(data.total_questions) || data.total_questions < 1)) {
            throw new SQLiteServiceError('invalid_progress', 'El borrador del test no es válido.');
        }
        let key, operationId, actualId, existing;
        await withStorageLock(() => {
        const originalReference = { id: data.id ?? null, revision: data.revision ?? null };
        if (data.id != null) data = { ...data, ...resolveProgressReference(data.id, data.revision) };
        key = keyFor(data.id, Number(data.test_id), !deletion);
        existing = state.attempts[key];
        const prior = state.queue.filter(q => q.attemptKey === key).at(-1);
        const previous = prior && (prior.sessionId === sessionId || isLocal(data.id)) && (data.revision ?? null) === (existing?.draft.revision ?? null) ? prior : null;
        if (existing?.draft.deleted) throw new SQLiteServiceError('pending_delete', 'Este intento tiene un borrado pendiente.');
        const creating = isLocal(key) && !existing;
        const revision = data.id == null && isLocal(key) ? existing?.draft.revision : data.revision;
        if (!creating && !previous && (!Number.isSafeInteger(revision) || revision < 1)) {
            throw new SQLiteServiceError('missing_revision', 'Recarga el intento para obtener su revisión antes de modificarlo.');
        }
        operationId = uuid();
        const body = { operation_id: operationId };
        if (!deletion) for (const field of bodyFields) if (data[field] !== undefined && (creating || field !== 'test_id')) body[field] = copy(data[field]);
        if (!creating && !previous) body.revision = revision;
        const method = deletion ? 'DELETE' : creating ? 'POST' : 'PUT';
        actualId = existing?.draft.id ?? data.id;
        const operation = { operationId, attemptKey: key, method, path: creating ? '/api/progress' : `/api/progress/${actualId}`, body, parentId: previous?.operationId ?? null, sessionId,
            reference: { id: originalReference.id ?? key, revision: originalReference.revision } };
        update(next => {
            const cached = next.progress.find(p => String(p.id) === String(data.id));
            const attempt = next.attempts[key] ?? { server: cached ? copy(cached) : null, blocked: null, draft: {} };
            attempt.draft = deletion ? { ...attempt.draft, ...cached, id: actualId, deleted: true } : {
                ...cached, ...attempt.draft, ...copy(data), id: creating ? key : actualId, status: 'in_progress'
            };
            next.attempts[key] = attempt;
            next.queue.push(operation);
        });
        });
        await retryPending();
        const receipt = receipts.get(operationId) ?? state.receipts[operationId];
        receipts.delete(operationId);
        return receipt ?? (deletion ? { id: state.attempts[key]?.draft.id ?? actualId, deleted: true, syncStatus: existing?.blocked || state.attempts[key]?.blocked ? 'conflict' : 'pending' } : resultFor(key));
    }
    async function fetchAllProgress() {
        try {
            await withStorageLock(async () => {
            const rows = await request('/api/progress');
            if (!Array.isArray(rows)) throw new SQLiteServiceError('invalid_response', 'Lista de intentos inválida.', 503);
            update(next => {
                next.progress = rows.filter(p => !next.tombstones[String(p.id)]).map(p => {
                    const cached = next.progress.find(previous => previous.id === p.id);
                    return copy(cached && cached.revision > p.revision ? cached : p);
                });
                next.progressKnown = true;
                for (const [key, a] of Object.entries(next.attempts)) {
                    if (!a.blocked && !next.queue.some(q => q.attemptKey === key)) delete next.attempts[key];
                }
            });
            });
        } catch (error) {
            if (error.code === 'storage_unavailable' || error.code === 'configuration' || error.code === 'unsupported_browser' || (error.status && error.status !== 401 && error.status < 500)) throw error;
        }
        notify();
        return visibleProgress();
    }
    async function findTestProgress(testId) {
        const rows = await fetchAllProgress();
        return rows.find(p => p.test_id === Number(testId)) ?? null;
    }
    async function fetchTests() {
        try {
            const rows = await request('/api/tests');
            if (!Array.isArray(rows)) throw new SQLiteServiceError('invalid_response', 'Catálogo inválido.', 503);
            await withStorageLock(() => update(next => { next.tests = copy(rows); }));
            return rows;
        } catch (error) {
            if (error.code === 'storage_unavailable' || error.code === 'configuration' || error.code === 'unsupported_browser') throw error;
            if (state.tests.length) return copy(state.tests);
            const response = await fetchImpl('./data/tests_index.json');
            if (response.ok === false) throw new SQLiteServiceError('catalog_unavailable', 'No se pudo cargar el catálogo.');
            return response.json();
        }
    }
    async function fetchHistory(testId, limit = 3) {
        const key = `${testId}:${limit}`;
        try {
            const rows = await request(`/api/history?test_id=${encodeURIComponent(testId)}&limit=${encodeURIComponent(limit)}`);
            if (!Array.isArray(rows)) throw new SQLiteServiceError('invalid_response', 'Historial inválido.', 503);
            await withStorageLock(() => update(next => { next.history[key] = copy(rows); }));
            return rows;
        } catch (error) {
            if (error.code === 'storage_unavailable' || error.code === 'configuration' || error.code === 'unsupported_browser') throw error;
            return copy(state.history[key] ?? []);
        }
    }
    async function adoptServerProgress(id) {
        const key = keyFor(id);
        const a = state.attempts[key];
        if (!a?.blocked) throw new SQLiteServiceError('no_conflict', 'No hay un conflicto pendiente para este intento.');
        let current = null;
        // Re-read the authoritative record; the version returned with a conflict can already be stale.
        if (a.blocked.status !== 410) {
            const remoteId = a.blocked.current?.id ?? a.server?.id ?? a.draft.id;
            if (!validId(remoteId)) throw new SQLiteServiceError('invalid_id', 'No se puede identificar el intento del servidor.');
            try { current = await request(`/api/progress/${remoteId}`); }
            catch (error) { if (error.status !== 410 && error.status !== 404) throw error; }
        }
        await withStorageLock(() => update(next => {
            next.queue = next.queue.filter(q => q.attemptKey !== key);
            delete next.attempts[key];
            next.progress = next.progress.filter(p => String(p.id) !== String(a.server?.id ?? a.draft.id));
            if (current) {
                next.progress = next.progress.filter(p => String(p.id) !== String(current.id));
                next.progress.push(copy(current));
            }
        }));
        return current ? { ...current, syncStatus: 'synced' } : null;
    }
    if (accessMode === 'token') {
        try { if (!getDeviceToken()) authRequired = true; }
        catch (error) { storageError = error.message; authRequired = true; }
    }
    if (typeof globalThis.addEventListener === 'function') {
        globalThis.addEventListener('storage', event => {
            if (event.key === stateKey) {
                withStorageLock(() => notify()).catch(error => { storageError = error.message; notify(); });
            } else if (event.key === tokenKey && accessMode === 'token') {
                authRequired = !getDeviceToken(); notify();
            }
        });
    }
    return {
        provider: 'sqlite', accessMode, getDeviceToken, setDeviceToken, clearDeviceToken, getSyncState, resolveProgressReference,
        subscribeSync(fn) { listeners.add(fn); fn(getSyncState()); return () => listeners.delete(fn); },
        retryPending, exportLocalDrafts() {
            return { version: 1, exported_at: new Date().toISOString(), attempts: copy(state.attempts), queue: copy(state.queue) };
        }, adoptServerProgress, fetchTests, fetchHistory, findTestProgress, fetchAllProgress,
        saveProgress: data => enqueue(data), completeTest: data => enqueue(data),
        deleteProgress: (id, revision) => enqueue({ id, revision }, true),
        async getTestWithQuestions(testId, fileName) {
            const response = await fetchImpl(`./data/${fileName}`);
            if (response.ok === false) throw new SQLiteServiceError('questions_unavailable', `No se pudo cargar el test ${testId}.`);
            return response.json();
        },
        async checkStatus() { return { provider: 'sqlite', supabase: false, localStorage: !storageError, modo: connection === 'online' ? 'online' : 'offline', ...getSyncState() }; },
        async isSupabaseAvailable() { return false; },
        saveToLocalStorage() { throw new SQLiteServiceError('unsupported', 'Usa saveProgress para conservar un borrador y su operación.'); }
    };
}

export const sqliteDataService = createSQLiteDataService({
    apiUrl: import.meta.env?.VITE_SQLITE_API_URL ?? '',
    accessMode: import.meta.env?.VITE_SQLITE_ACCESS_MODE || 'public'
});
