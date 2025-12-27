/**
 * theme-init.js
 * 
 * Script de inicialización de tema ejecutado sincrónicamente en el head.
 * Propósito: Evitar el flash blanco en modo oscuro aplicando la clase .dark 
 * antes del primer pintado de la página.
 * 
 * Este archivo NO debe ser un módulo (no type="module") para ser bloqueante.
 */
(function () {
    try {
        var theme = localStorage.getItem('color-theme');
        var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

        if (theme === 'dark' || (!theme && darkQuery.matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    } catch (e) {
        // En caso de error (ej: acceso a localStorage bloqueado), evitamos detener la carga
        console.warn('Theme initialization failed:', e);
    }
})();
