import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    root: 'src',
    envDir: '..', // Point to root for .env file
    publicDir: '../public',
    base: './', // Ensures assets are loaded correctly on GitHub Pages
    plugins: [
        tailwindcss(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@core': path.resolve(__dirname, './src/core'),
            '@services': path.resolve(__dirname, './src/services'),
            '@ui': path.resolve(__dirname, './src/ui'),
            '@config': path.resolve(__dirname, './src/config')
        }
    },
    server: {
        host: true,
        open: true, // Auto-open browser
    },
    build: {
        outDir: '../dist', // Output to root dist folder
        emptyOutDir: true, // Clean dist folder before build
    }
});
