/**
 * Data Service Provider
 * Resolves which implementation to use: Real or Mock
 * 
 * SECURITY: The mock implementation is physically removed from the production build
 * using Vite's tree-shaking (Dead Code Elimination) and dynamic imports.
 */

import { realDataService } from './realDataService.js';

let implementation = realDataService;

/**
 * We check if we are in production.
 * Vite replaces 'import.meta.env.MODE' with a literal string during build.
 * In Jest, import.meta.env is undefined, so we fallback to 'development'.
 */
const isProduction = (typeof import.meta.env !== 'undefined')
    ? import.meta.env.MODE === 'production'
    : (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');

if (!isProduction) {
    const isTestMode =
        globalThis.__TEST_MODE__ === true ||
        (typeof process !== 'undefined' && process.env && process.env.__TEST_MODE__ === 'true');

    if (isTestMode) {
        // Dynamic import ensures the mock code and its large JSON fixtures 
        // are not even part of the main production bundle route.
        const { mockDataService } = await import('../../tests/fixtures/mockDataService.js');
        implementation = mockDataService;
    }
}

export const dataService = implementation;

console.log(`🔌 [PROVIDER] Using ${dataService === realDataService ? 'REAL' : 'MOCK'} Data Service`);
