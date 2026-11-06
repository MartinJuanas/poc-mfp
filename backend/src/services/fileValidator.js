import { uploadConfig } from './uploadConfig.js';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';

/**
 * Servicio de validación y seguridad para archivos subidos.
 *
 * Validaciones:
 * - MIME type real (magic bytes del PDF)
 * - Extensión del archivo
 * - Tamaño máximo
 * - Cantidad máxima de archivos
 * - Path traversal
 * - Sanitización de nombres
 * - PDFs vacíos o corruptos
 * - PDFs protegidos con contraseña
 */

// PDF magic bytes: %PDF-
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);

// Configuración por defecto (overrideable via env)
const getConfig = () => ({ maxFileSize: uploadConfig().maxFileSizeMB * 1024 * 1024, maxBulkFiles: uploadConfig().maxBulkFiles });

/**
 * Calcula el hash SHA-256 de un buffer
 * @param {Buffer} buffer
 * @returns {string} Hash hexadecimal
 */
export function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verifica que un buffer comience con los magic bytes de un PDF
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isPdfByMagicBytes(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES);
}

/**
 * Sanitiza un nombre de archivo
 * - Remueve caracteres peligrosos
 * - Previene path traversal
 * - Limita longitud
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeFileName(filename) {
  if (!filename) return 'unknown.pdf';

  // Extraer solo el nombre base (quitar paths)
  let name = filename.replace(/^.*[\\\/]/, '');

  // Remover caracteres peligrosos (mantener letras, números, guiones, puntos, underscores, espacios)
  name = name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\s._\-()]/g, '');

  // Prevenir nombres vacíos
  if (!name || name.trim().length === 0) {
    name = 'archivo.pdf';
  }

  // Limitar longitud
  if (name.length > 200) {
    const ext = name.match(/\.[^.]+$/)?.[0] || '.pdf';
    name = name.substring(0, 200 - ext.length) + ext;
  }

  return name;
}

/**
 * Valida que una ruta relativa no contenga path traversal
 * @param {string} relativePath
 * @returns {{ safe: boolean, sanitized: string }}
 */
export function validateRelativePath(relativePath) {
  if (!relativePath) return { safe: true, sanitized: '' };

  // Detectar path traversal
  const dangerous = /(\.\.[/\\])|([/\\]\.\.)|(^\.\.)|(%2e%2e)|(%252e)/i;
  if (dangerous.test(relativePath)) {
    return { safe: false, sanitized: '' };
  }

  // Detectar rutas absolutas
  if (/^[A-Za-z]:/.test(relativePath) || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    return { safe: false, sanitized: '' };
  }

  // Sanitizar: normalizar separadores y quitar caracteres peligrosos
  const sanitized = relativePath
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\s._\-()\/]/g, '')
    .replace(/\/+/g, '/');

  return { safe: true, sanitized };
}

/**
 * Valida un archivo PDF individual
 * @param {Object} file - Archivo de multer { buffer, originalname, mimetype, size }
 * @param {string} relativePath - Ruta relativa opcional
 * @returns {{ valid: boolean, errors: string[], errorCode: string|null, hash: string|null }}
 */
export async function validateFile(file, relativePath = '') {
  const errors = [];
  const config = getConfig();

  // 1. Verificar que el archivo existe
  if (!file || !file.buffer) {
    return { valid: false, errors: ['Archivo vacío o no proporcionado'], errorCode: 'INVALID_PDF', hash: null };
  }

  // 2. Verificar extensión
  const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') {
    return { valid: false, errors: [`Extensión no válida: .${ext}`], errorCode: 'INVALID_PDF', hash: null };
  }

  // 3. Verificar MIME type
  if (file.mimetype && file.mimetype !== 'application/pdf') {
    errors.push(`MIME type no válido: ${file.mimetype}`);
  }

  // 4. Verificar magic bytes
  if (!isPdfByMagicBytes(file.buffer)) {
    return { valid: false, errors: ['El archivo no es un PDF válido (magic bytes incorrectos)'], errorCode: 'INVALID_PDF', hash: null };
  }

  // 5. Verificar tamaño
  const fileSize = file.buffer.length;
  if (fileSize === 0) {
    return { valid: false, errors: ['Archivo vacío'], errorCode: 'EMPTY_PDF', hash: null };
  }
  if (fileSize > config.maxFileSize) {
    const sizeMB = Math.round(fileSize / 1024 / 1024 * 100) / 100;
    const maxMB = config.maxFileSize / 1024 / 1024;
    return { valid: false, errors: [`Archivo demasiado grande (${sizeMB}MB, máximo: ${maxMB}MB)`], errorCode: 'FILE_TOO_LARGE', hash: null };
  }

  // 6. Verificar path traversal
  if (relativePath) {
    const { safe } = validateRelativePath(relativePath);
    if (!safe) {
      return { valid: false, errors: ['Ruta relativa contiene caracteres peligrosos'], errorCode: 'VALIDATION_ERROR', hash: null };
    }
  }

  // 7. Verificar que el PDF se puede leer (no corrupto, no protegido)
  try {
    const pdfData = await pdfParse(Uint8Array.from(file.buffer));
    if (!pdfData.text || pdfData.text.trim().length < 10) {
      return { valid: false, errors: ['El PDF no contiene texto extraíble (puede ser imagen o estar vacío)'], errorCode: 'EMPTY_PDF', hash: null };
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('password') || msg.includes('encrypted')) {
      return { valid: false, errors: ['El PDF está protegido con contraseña'], errorCode: 'PASSWORD_PROTECTED', hash: null };
    }
    return { valid: false, errors: ['El PDF está dañado o no se puede leer. Probá con otra copia del documento.'], errorCode: 'INVALID_PDF', hash: null };
  }

  // 8. Calcular hash
  const hash = calculateFileHash(file.buffer);

  return {
    valid: errors.length === 0,
    errors,
    errorCode: errors.length > 0 ? 'VALIDATION_ERROR' : null,
    hash
  };
}

/**
 * Valida un lote completo de archivos (pre-validación rápida)
 * @param {Array} files - Array de archivos de multer
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateBatch(files) {
  const config = getConfig();
  const errors = [];

  if (!files || files.length === 0) {
    errors.push('No se proporcionaron archivos');
    return { valid: false, errors };
  }

  if (files.length > config.maxBulkFiles) {
    errors.push(`Se excedió el límite de archivos: ${files.length}/${config.maxBulkFiles}`);
    return { valid: false, errors };
  }

  return { valid: errors.length === 0, errors };
}

export default {
  calculateFileHash,
  isPdfByMagicBytes,
  sanitizeFileName,
  validateRelativePath,
  validateFile,
  validateBatch
};
