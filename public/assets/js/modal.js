// assets/js/modal.js

/**
 * Sistema de diálogos modales personalizados
 * Reemplaza alert() y confirm() del navegador con diálogos HTML estilizados
 */

/**
 * Muestra un diálogo modal informativo (reemplazo de alert)
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título del diálogo (opcional)
 * @returns {Promise<void>}
 */
function showModal(message, title = 'Información') {
    return new Promise((resolve) => {
        // Crear elementos del modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const modalContent = `
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
            </div>
            <div class="modal-body">
                <p class="modal-message">${message}</p>
            </div>
            <div class="modal-footer">
                <button class="modal-btn modal-btn-primary" id="modal-ok">Aceptar</button>
            </div>
        `;

        modal.innerHTML = modalContent;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Añadir animación de entrada
        setTimeout(() => overlay.classList.add('active'), 10);

        // Manejar click en botón OK
        const okBtn = document.getElementById('modal-ok');
        okBtn.addEventListener('click', () => {
            closeModal(overlay, resolve);
        });

        // Cerrar con ESC
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal(overlay, resolve);
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // Focus en el botón
        okBtn.focus();
    });
}

/**
 * Muestra un diálogo modal de confirmación (reemplazo de confirm)
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título del diálogo (opcional)
 * @returns {Promise<boolean>} - true si confirma, false si cancela
 */
function showConfirm(message, title = 'Confirmación') {
    return new Promise((resolve) => {
        // Crear elementos del modal
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const modalContent = `
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
            </div>
            <div class="modal-body">
                <p class="modal-message">${message}</p>
            </div>
            <div class="modal-footer">
                <button class="modal-btn modal-btn-secondary" id="modal-cancel">Cancelar</button>
                <button class="modal-btn modal-btn-primary" id="modal-confirm">Confirmar</button>
            </div>
        `;

        modal.innerHTML = modalContent;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Añadir animación de entrada
        setTimeout(() => overlay.classList.add('active'), 10);

        // Manejar click en botones
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        confirmBtn.addEventListener('click', () => {
            closeModal(overlay, () => resolve(true));
        });

        cancelBtn.addEventListener('click', () => {
            closeModal(overlay, () => resolve(false));
        });

        // Cerrar con ESC (equivale a cancelar)
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal(overlay, () => resolve(false));
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);

        // Click fuera del modal (equivale a cancelar)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay, () => resolve(false));
            }
        });

        // Focus en el botón de confirmar
        confirmBtn.focus();
    });
}

/**
 * Cierra el modal con animación
 * @param {HTMLElement} overlay - Elemento overlay del modal
 * @param {Function} callback - Función a ejecutar después de cerrar
 */
function closeModal(overlay, callback) {
    overlay.classList.remove('active');

    // Esperar a que termine la animación antes de eliminar
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        if (callback) callback();
    }, 300); // Duración de la animación
}

// Hacer las funciones disponibles globalmente
window.showModal = showModal;
window.showConfirm = showConfirm;
