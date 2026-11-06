import { describe, it, expect } from 'vitest';
import {
  detectPeriod,
  detectFromPath,
  detectFromFileName,
  detectFromPdfContent
} from '../services/periodDetector.js';

describe('periodDetector', () => {
  describe('detectFromFileName', () => {
    it('detects month in Spanish and year from filename: "recibo enero 2026.pdf"', () => {
      const res = detectFromFileName('recibo enero 2026.pdf');
      expect(res).toEqual({ year: 2026, month: 1 });
    });

    it('detects numeric month and year: "recibo_02_2026.pdf"', () => {
      const res = detectFromFileName('recibo_02_2026.pdf');
      expect(res).toEqual({ year: 2026, month: 2 });
    });

    it('detects month in Spanish without year: "sueldo-febrero.pdf"', () => {
      const res = detectFromFileName('sueldo-febrero.pdf');
      expect(res).toEqual({ year: null, month: 2 });
    });

    it('detects ISO year and numeric month: "liquidacion-2026-03.pdf"', () => {
      const res = detectFromFileName('liquidacion-2026-03.pdf');
      expect(res).toEqual({ year: 2026, month: 3 });
    });

    it('detects numeric prefix and Spanish month: "03-marzo-recibo.pdf"', () => {
      const res = detectFromFileName('03-marzo-recibo.pdf');
      expect(res.month).toBe(3);
    });

    it('detects "haberes abril.pdf"', () => {
      const res = detectFromFileName('haberes abril.pdf');
      expect(res.month).toBe(4);
    });
  });

  describe('detectFromPath', () => {
    it('detects year and month from folder structure "2026/Enero/recibo.pdf"', () => {
      const res = detectFromPath('2026/Enero/recibo.pdf');
      expect(res).toEqual({ year: 2026, month: 1 });
    });

    it('detects year and numeric month from folder structure "2026/01/recibo.pdf"', () => {
      const res = detectFromPath('2026/01/recibo.pdf');
      expect(res).toEqual({ year: 2026, month: 1 });
    });

    it('handles Windows style backslashes "2026\\Marzo\\recibo.pdf"', () => {
      const res = detectFromPath('2026\\Marzo\\recibo.pdf');
      expect(res).toEqual({ year: 2026, month: 3 });
    });
  });

  describe('detectFromPdfContent', () => {
    it('extracts valid period from PDF content JSON', () => {
      const extractedData = { periodo: { mes: 5, anio: 2026 } };
      const res = detectFromPdfContent(extractedData);
      expect(res).toEqual({ year: 2026, month: 5 });
    });

    it('returns nulls for missing or invalid period', () => {
      const res = detectFromPdfContent({ periodo: { mes: null, anio: null } });
      expect(res).toEqual({ year: null, month: null });
    });
  });

  describe('detectPeriod priority hierarchy', () => {
    it('prioritizes PDF content over path and filename', () => {
      const res = detectPeriod({
        extractedData: { periodo: { mes: 5, anio: 2026 } },
        relativePath: '2025/Enero/recibo.pdf',
        fileName: 'recibo_feb_2024.pdf'
      });
      expect(res).toEqual({ year: 2026, month: 5, source: 'pdf_content' });
    });

    it('falls back to relativePath when PDF content is missing', () => {
      const res = detectPeriod({
        extractedData: { periodo: { mes: null, anio: null } },
        relativePath: '2026/Febrero/recibo.pdf',
        fileName: 'recibo_marzo_2025.pdf'
      });
      expect(res).toEqual({ year: 2026, month: 2, source: 'file_path' });
    });

    it('falls back to fileName when PDF content and path are missing', () => {
      const res = detectPeriod({
        extractedData: null,
        relativePath: 'recibo.pdf',
        fileName: 'recibo_04_2026.pdf'
      });
      expect(res).toEqual({ year: 2026, month: 4, source: 'file_name' });
    });

    it('combines partial period info (year from path, month from filename)', () => {
      const res = detectPeriod({
        extractedData: null,
        relativePath: '2026/recibo.pdf',
        fileName: 'sueldo-mayo.pdf'
      });
      expect(res.year).toBe(2026);
      expect(res.month).toBe(5);
    });
  });
});
