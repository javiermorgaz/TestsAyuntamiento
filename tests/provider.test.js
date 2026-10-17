/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// The provider resolves its implementation at import time
// To test both branches, we need to reset the module cache or use dynamic imports

describe('Data Service Provider', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('should return mockDataService when __TEST_MODE__ is true', async () => {
        global.__TEST_MODE__ = true;
        const { dataService } = await import('../src/services/dataService.provider.js');
        const { mockDataService } = await import('./fixtures/mockDataService.js');

        // We check if it has the prefix log from the mock service or specific properties
        expect(dataService.fetchTests.name).toBe(mockDataService.fetchTests.name);

        const result = await dataService.fetchTests();
        expect(result[0].titulo).toContain('Mock');
    });

    test('should return realDataService when __TEST_MODE__ is false', async () => {
        global.__TEST_MODE__ = false;
        const { dataService } = await import('../src/services/dataService.provider.js');
        const { realDataService } = await import('../src/services/realDataService.js');

        // In the real one, fetchTests is a defined function in realDataService.js
        expect(dataService.fetchTests.name).toBe(realDataService.fetchTests.name);
    });
});
