import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './', // Ensures assets are loaded correctly on GitHub Pages
    plugins: [
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': '/src',
            '@core': '/src/core',
            '@services': '/src/services',
            '@ui': '/src/ui',
            '@config': '/src/config'
        }
    },
    server: {
        host: true,
        open: true, // Auto-open browser
    },
    build: {
        outDir: 'dist', // Standard output directory
        emptyOutDir: true, // Clean dist folder before build
    }
});
