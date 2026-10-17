import { showConfirm } from './modal.js';

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}

export function downloadLocalDrafts(service, currentDraft = null) {
    const url = URL.createObjectURL(new Blob([
        JSON.stringify({ ...service.exportLocalDrafts(), current_test: currentDraft }, null, 2)
    ], { type: 'application/json' }));
    const link = element('a');
    link.href = url;
    link.download = 'mis-respuestas-pendientes.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Public SQLite keeps the usual interface. Recovery controls appear only
// when a connection, storage error or conflict needs attention.
export function initSQLiteSync(service, {
    beforeResolve = async () => {},
    currentDraft = () => null,
    onResolved = () => window.location.reload(),
    onConnected = async () => {},
    confirm = showConfirm
} = {}) {
    if (service.provider !== 'sqlite') return () => {};
    const publicAccess = service.accessMode === 'public' || service.getSyncState().accessMode === 'public';
    const panel = element('section', null, 'sqlite-sync glass-card');
    panel.id = 'sqlite-sync-panel';
    const title = element('h2', publicAccess ? 'No se pudo guardar' : 'Datos compartidos');
    panel.setAttribute('aria-label', title.textContent);
    const status = element('p');
    status.id = 'sqlite-sync-status';
    status.setAttribute('role', 'status');
    const error = element('p');
    error.setAttribute('role', 'alert');
    let form, input, connect, forget;
    if (!publicAccess) {
        form = element('form');
        const label = element('label', 'Código de acceso de este dispositivo');
        input = element('input');
        input.type = 'password';
        input.id = 'sqlite-device-token';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.required = true;
        label.htmlFor = input.id;
        connect = element('button', 'Conectar');
        connect.type = 'submit';
        form.append(label, input, connect);
        forget = element('button', 'Olvidar acceso');
        forget.type = 'button';
    }
    const actions = element('div', null, 'sqlite-sync-actions');
    const retry = element('button', 'Sincronizar ahora');
    const download = element('button', 'Descargar mis respuestas pendientes');
    for (const button of [retry, download]) button.type = 'button';
    actions.append(retry, download);
    if (forget) actions.append(forget);
    const conflicts = element('div');
    panel.append(title, status);
    if (form) panel.append(form);
    panel.append(actions, error, conflicts);
    const parent = document.querySelector('main') || document.body;
    parent.prepend(panel);

    let actionError = '';
    function hasAccess() {
        if (publicAccess) return true;
        try { return Boolean(service.getDeviceToken()); }
        catch { return false; }
    }

    function render(state) {
        const conflictCount = state.conflicts?.length || 0;
        const access = hasAccess();
        if (form) form.hidden = access && !state.authRequired;
        if (forget) forget.hidden = !access;
        retry.hidden = !access || state.authRequired;
        download.hidden = !state.pendingCount && !conflictCount && !state.error && !actionError;
        error.textContent = state.error || actionError;
        const recoveryNeeded = conflictCount || state.status === 'offline' || state.connection === 'offline' || state.status === 'error' || error.textContent;
        panel.hidden = publicAccess && !recoveryNeeded;
        panel.style.display = panel.hidden ? 'none' : '';
        if (publicAccess) {
            title.textContent = conflictCount ? 'Cambios en otro dispositivo' : 'No se pudo guardar';
            panel.setAttribute('aria-label', title.textContent);
        }
        if (!publicAccess && (state.authRequired || !access)) {
            status.textContent = 'Introduce tu código de acceso. Las respuestas pendientes se conservan en este dispositivo.';
        } else if (conflictCount) {
            status.textContent = 'Hay cambios de otro dispositivo. Tus respuestas locales se conservan hasta que decidas.';
        } else if (state.pendingCount) {
            status.textContent = `Guardado en este dispositivo · ${state.pendingCount} cambios pendientes de sincronizar.`;
        } else if (state.status === 'syncing') {
            status.textContent = 'Sincronizando…';
        } else if (state.status === 'offline' || state.error) {
            status.textContent = 'No se pudo conectar. Los cambios locales no están confirmados en la base compartida.';
        } else if (state.progressKnown === false) {
            status.textContent = 'Pendiente de comprobar el progreso compartido.';
        } else {
            status.textContent = 'Cambios guardados confirmados en la base compartida.';
        }
        conflicts.replaceChildren();
        for (const conflict of state.conflicts || []) {
            const card = element('div', null, 'sqlite-sync-conflict');
            card.append(element('p', `El test ${conflict.test_id} cambió o se borró en otro dispositivo.`));
            const useShared = element('button', 'Usar la versión compartida');
            useShared.type = 'button';
            useShared.addEventListener('click', async () => {
                if (!await confirm('Se descartarán las respuestas pendientes de este intento en este dispositivo. Puedes descargarlas antes. ¿Quieres continuar?', 'Elegir versión compartida')) return;
                useShared.disabled = true;
                try {
                    await beforeResolve();
                    await service.adoptServerProgress(conflict.id);
                    onResolved();
                } catch {
                    actionError = 'No se pudo recuperar la versión compartida. Tus respuestas pendientes se conservan.';
                    render(service.getSyncState());
                    useShared.disabled = false;
                }
            });
            card.append(useShared);
            conflicts.append(card);
        }
    }

    const unsubscribe = service.subscribeSync(render);
    render(service.getSyncState());
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        connect.disabled = true;
        actionError = '';
        try {
            service.setDeviceToken(input.value.trim());
            input.value = '';
            await service.retryPending();
            const state = service.getSyncState();
            render(state);
            if (!state.authRequired) await onConnected();
        } catch {
            actionError = 'No se pudo conectar. Revisa el código y la conexión.';
            render(service.getSyncState());
        } finally {
            connect.disabled = false;
        }
    });
    retry.addEventListener('click', async () => {
        retry.disabled = true;
        actionError = '';
        try {
            await service.retryPending();
            await onConnected();
            render(service.getSyncState());
        } catch {
            actionError = 'No se pudo sincronizar. Tus respuestas pendientes se conservan.';
            render(service.getSyncState());
        } finally {
            retry.disabled = false;
        }
    });
    forget?.addEventListener('click', () => {
        try {
            service.clearDeviceToken();
            render(service.getSyncState());
        } catch {
            actionError = 'No se pudo eliminar el acceso guardado en este dispositivo.';
            render(service.getSyncState());
        }
    });
    download.addEventListener('click', () => downloadLocalDrafts(service, currentDraft()));

    const refresh = async () => {
        if (!hasAccess()) return;
        try {
            await service.retryPending();
            await onConnected();
            actionError = '';
            render(service.getSyncState());
        } catch {
            actionError = 'No se pudo sincronizar. Tus respuestas pendientes se conservan.';
            render(service.getSyncState());
        }
    };
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
        unsubscribe();
        window.removeEventListener('online', refresh);
        window.removeEventListener('focus', refresh);
        panel.remove();
    };
}
