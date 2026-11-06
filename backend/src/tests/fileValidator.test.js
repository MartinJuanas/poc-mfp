import { describe, it, expect } from 'vitest';
import {
  calculateFileHash,
  isPdfByMagicBytes,
  sanitizeFileName,
  validateRelativePath,
  validateBatch
} from '../services/fileValidator.js';

describe('fileValidator', () => {
  describe('calculateFileHash', () => {
    it('calculates consistent SHA-256 hash for a buffer', () => {
      const buf1 = Buffer.from('hello world');
      const buf2 = Buffer.from('hello world');
      const hash1 = calculateFileHash(buf1);
      const hash2 = calculateFileHash(buf2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length
    });
  });

  describe('isPdfByMagicBytes', () => {
    it('returns true for buffer starting with %PDF-', () => {
      const pdfBuf = Buffer.from('%PDF-1.4 header contents...');
      expect(isPdfByMagicBytes(pdfBuf)).toBe(true);
    });

    it('returns false for non-PDF buffers', () => {
      const textBuf = Buffer.from('Hello world this is not a pdf');
      expect(isPdfByMagicBytes(textBuf)).toBe(false);
    });
  });

  describe('sanitizeFileName', () => {
    it('removes directory paths from filename', () => {
      expect(sanitizeFileName('C:\\Windows\\system32\\test.pdf')).toBe('test.pdf');
      expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    });

    it('retains valid spanish accents and clean characters', () => {
      expect(sanitizeFileName('recibo_enero_año_2026.pdf')).toBe('recibo_enero_año_2026.pdf');
    });
  });

  describe('validateRelativePath', () => {
    it('detects and rejects path traversal attempts', () => {
      expect(validateRelativePath('../../../secret.pdf').safe).toBe(false);
      expect(validateRelativePath('2026/../secret.pdf').safe).toBe(false);
      expect(validateRelativePath('%2e%2e/file.pdf').safe).toBe(false);
    });

    it('allows safe relative paths', () => {
      const res = validateRelativePath('2026/Enero/recibo.pdf');
      expect(res.safe).toBe(true);
      expect(res.sanitized).toBe('2026/Enero/recibo.pdf');
    });
  });

  describe('validateBatch', () => {
    it('rejects empty file lists', () => {
      const res = validateBatch([]);
      expect(res.valid).toBe(false);
    });

    it('validates batch size within limits', () => {
      const files = Array.from({ length: 5 }, (_, i) => ({ originalname: `file${i}.pdf` }));
      const res = validateBatch(files);
      expect(res.valid).toBe(true);
    });
  });
});
