import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './', // Ensures assets are loaded correctly on GitHub Pages
    plugins: [
        tailwindcss(),
    ],
    server: {
        open: true, // Auto-open browser
    },
    build: {
        outDir: 'dist', // Standard output directory
        emptyOutDir: true, // Clean dist folder before build
    }
});
