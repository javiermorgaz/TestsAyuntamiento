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

// Default export
export default dataService;
