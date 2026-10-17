/**
 * Data Service - Entry Point
 * Use this service to interact with data.
 * It automatically switches between Real and Mock implementation.
 */

import { dataService } from './dataService.provider.js';

// Re-export individually for better IDE support and compatibility
export const fetchTests = dataService.fetchTests;
export const fetchHistory = dataService.fetchHistory;
export const findTestProgress = dataService.findTestProgress;
export const saveProgress = dataService.saveProgress;
export const deleteProgress = dataService.deleteProgress;
export const completeTest = dataService.completeTest;
export const checkStatus = dataService.checkStatus;
export const isSupabaseAvailable = dataService.isSupabaseAvailable;
export const saveToLocalStorage = dataService.saveToLocalStorage;
export const fetchAllProgress = dataService.fetchAllProgress;

// Also export specific mock-only helpers if needed
export const getTestWithQuestions = dataService.getTestWithQuestions;

// SQLite controls are optional so existing providers retain their behavior.
export const getDeviceToken = () => dataService.getDeviceToken?.() ?? '';
export const setDeviceToken = token => dataService.setDeviceToken?.(token);
export const clearDeviceToken = () => dataService.clearDeviceToken?.();
export const getSyncState = () => dataService.getSyncState?.() ?? { provider: 'supabase', status: 'synced', pendingCount: 0, conflicts: [], authRequired: false };
export const subscribeSync = fn => dataService.subscribeSync?.(fn) ?? (() => {});
export const retryPending = () => dataService.retryPending?.();
export const exportLocalDrafts = () => dataService.exportLocalDrafts?.();
export const adoptServerProgress = id => dataService.adoptServerProgress?.(id);
export const resolveProgressReference = (id, revision) => dataService.resolveProgressReference?.(id, revision) ?? { id, revision };

// Default export
export default dataService;
