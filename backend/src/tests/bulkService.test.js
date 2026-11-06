import { describe, it, expect } from 'vitest';
import bulkService from '../services/bulkService.js';

describe('bulkService', () => {
  it('exports core functions', () => {
    expect(typeof bulkService.createBulkImport).toBe('function');
    expect(typeof bulkService.processBulkImport).toBe('function');
    expect(typeof bulkService.retryFailedFiles).toBe('function');
    expect(typeof bulkService.retryFile).toBe('function');
    expect(typeof bulkService.reviewFile).toBe('function');
    expect(typeof bulkService.getBulkImportStatus).toBe('function');
  });
});
