/**
 * Data Service Provider
 * Resolves which implementation to use: Real or Mock
 */

import { realDataService } from './realDataService.js';

// We check test mode synchronously to avoid Top-Level Await delays if possible,
// but for security we still want dynamic import for the mock data in production.
const IS_TEST_MODE =
    globalThis.__TEST_MODE__ === true ||
    (typeof process !== 'undefined' && process.env && process.env.__TEST_MODE__ === 'true');

const IS_PROD = typeof import.meta.env !== 'undefined' ? import.meta.env.PROD : false;

let implementation = realDataService;

// If we are in test mode and NOT in production, we'll try to use the mock.
// Note: In Vite, top-level await is supported, so this is safe and will block 
// modules importing this until the mock is loaded.
if (IS_TEST_MODE && !IS_PROD) {
    const { mockDataService } = await import('../../tests/fixtures/mockDataService.js');
    implementation = mockDataService;
}

export const dataService = implementation;
