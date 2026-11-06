/**
 * Servicio de detección automática de período (año/mes) para recibos de sueldo.
 *
 * Orden de prioridad:
 * 1. Contenido extraído del PDF (periodo del LLM)
 * 2. Ruta relativa del archivo (estructura de carpetas)
 * 3. Nombre del archivo
 * 4. Fallback: needs_review
 */

// Mapa de meses en español → número
const MESES_ES = {
  'enero': 1, 'ene': 1,
  'febrero': 2, 'feb': 2,
  'marzo': 3, 'mar': 3,
  'abril': 4, 'abr': 4,
  'mayo': 5, 'may': 5,
  'junio': 6, 'jun': 6,
  'julio': 7, 'jul': 7,
  'agosto': 8, 'ago': 8,
  'septiembre': 9, 'sept': 9, 'sep': 9,
  'octubre': 10, 'oct': 10,
  'noviembre': 11, 'nov': 11,
  'diciembre': 12, 'dic': 12
};

/**
 * Normaliza una cadena: quita acentos, pasa a minúsculas
 */
function normalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Intenta extraer un número de mes (1-12) de un string
 * Soporta nombre en español o número
 */
function extractMonth(token) {
  if (!token) return null;
  const normalized = normalize(token.trim());

  // Buscar en mapa de meses español
  if (MESES_ES[normalized] !== undefined) {
    return MESES_ES[normalized];
  }

  // Intentar como número
  const num = parseInt(normalized, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) {
    return num;
  }

  return null;
}

/**
 * Intenta extraer un año válido de un string
 * Acepta años entre 2000 y 2099
 */
function extractYear(token) {
  if (!token) return null;
  const num = parseInt(token.trim(), 10);
  if (!isNaN(num) && num >= 2000 && num <= 2099) {
    return num;
  }
  return null;
}

/**
 * Extrae año y mes de un texto genérico (nombre de archivo, segmento de ruta)
 * Intenta múltiples patrones comunes
 */
function extractPeriodFromText(text) {
  if (!text) return { year: null, month: null };

  const normalized = normalize(text);
  let year = null;
  let month = null;

  // Patrón 1: YYYY-MM o YYYY_MM o YYYY/MM
  const isoPattern = normalized.match(/(\d{4})[\s_\-./](0[1-9]|1[0-2]|[1-9])(?!\d)/);
  if (isoPattern) {
    year = extractYear(isoPattern[1]);
    month = extractMonth(isoPattern[2]);
    if (year && month) return { year, month };
  }

  // Patrón 2: MM-YYYY o MM_YYYY
  const reversePattern = normalized.match(/(?<!\d)(0[1-9]|1[0-2]|[1-9])[\s_\-./](\d{4})/);
  if (reversePattern) {
    month = extractMonth(reversePattern[1]);
    year = extractYear(reversePattern[2]);
    if (year && month) return { year, month };
  }

  // Patrón 3: nombre_mes + año (e.g., "recibo enero 2026", "sueldo-febrero")
  const monthNames = Object.keys(MESES_ES);
  for (const mesName of monthNames) {
    if (normalized.includes(mesName)) {
      month = MESES_ES[mesName];
      // Buscar año cercano al nombre del mes
      const yearMatch = normalized.match(/(\d{4})/);
      if (yearMatch) {
        year = extractYear(yearMatch[1]);
      }
      break;
    }
  }

  // Patrón 4: Si no encontramos mes pero hay un año de 4 dígitos
  if (!year) {
    const yearOnlyMatch = normalized.match(/(\d{4})/);
    if (yearOnlyMatch) {
      year = extractYear(yearOnlyMatch[1]);
    }
  }

  // Patrón 5: MM-mesNombre-algo (e.g., "03-marzo-recibo")
  if (!month) {
    const numMonthMatch = normalized.match(/(?<!\d)(0[1-9]|1[0-2])(?!\d)/);
    if (numMonthMatch) {
      month = extractMonth(numMonthMatch[1]);
    }
  }

  return { year, month };
}

/**
 * Detecta período desde la ruta relativa del archivo
 * Ejemplo: "2026/Enero/recibo.pdf" → { year: 2026, month: 1 }
 * Ejemplo: "2026/01/recibo.pdf" → { year: 2026, month: 1 }
 */
export function detectFromPath(relativePath) {
  if (!relativePath) return { year: null, month: null };

  // Separar por / o \
  const segments = relativePath.split(/[/\\]/).filter(Boolean);

  let year = null;
  let month = null;

  for (const segment of segments) {
    const segYear = extractYear(segment);
    if (segYear) {
      year = segYear;
      continue;
    }

    const segMonth = extractMonth(segment);
    if (segMonth) {
      month = segMonth;
      continue;
    }

    // Intentar extracción combinada del segmento
    const extracted = extractPeriodFromText(segment);
    if (extracted.year && !year) year = extracted.year;
    if (extracted.month && !month) month = extracted.month;
  }

  return { year, month };
}

/**
 * Detecta período desde el nombre de archivo
 * Ejemplos soportados:
 *   "recibo enero 2026.pdf" → { year: 2026, month: 1 }
 *   "recibo_02_2026.pdf" → { year: 2026, month: 2 }
 *   "sueldo-febrero.pdf" → { year: null, month: 2 }
 *   "liquidacion-2026-03.pdf" → { year: 2026, month: 3 }
 *   "03-marzo-recibo.pdf" → { year: null, month: 3 }
 *   "haberes abril.pdf" → { year: null, month: 4 }
 */
export function detectFromFileName(fileName) {
  if (!fileName) return { year: null, month: null };

  // Quitar extensión
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');
  return extractPeriodFromText(nameWithoutExt);
}

/**
 * Detecta período desde los datos extraídos del PDF
 */
export function detectFromPdfContent(extractedData) {
  if (!extractedData) return { year: null, month: null };

  const periodo = extractedData.periodo;
  if (periodo && periodo.mes && periodo.anio) {
    const month = parseInt(periodo.mes, 10);
    const year = parseInt(periodo.anio, 10);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      return { year, month };
    }
  }

  return { year: null, month: null };
}

/**
 * Función principal: detecta período combinando todas las fuentes
 * con orden de prioridad definido.
 *
 * @param {Object} options
 * @param {Object} options.extractedData - Datos extraídos por parseReceipt
 * @param {string} options.relativePath - Ruta relativa del archivo
 * @param {string} options.fileName - Nombre del archivo
 * @returns {{ year: number|null, month: number|null, source: string }}
 */
export function detectPeriod({ extractedData, relativePath, fileName }) {
  // 1. Prioridad máxima: contenido del PDF
  const fromPdf = detectFromPdfContent(extractedData);
  if (fromPdf.year && fromPdf.month) {
    return { ...fromPdf, source: 'pdf_content' };
  }

  // 2. Ruta relativa
  const fromPath = detectFromPath(relativePath);
  if (fromPath.year && fromPath.month) {
    return { ...fromPath, source: 'file_path' };
  }

  // 3. Nombre del archivo
  const fromName = detectFromFileName(fileName);
  if (fromName.year && fromName.month) {
    return { ...fromName, source: 'file_name' };
  }

  // 4. Combinar fuentes parciales (e.g., año de path + mes de nombre)
  const combinedYear = fromPdf.year || fromPath.year || fromName.year;
  const combinedMonth = fromPdf.month || fromPath.month || fromName.month;

  if (combinedYear && combinedMonth) {
    return { year: combinedYear, month: combinedMonth, source: 'file_path' };
  }

  // 5. Datos parciales
  return {
    year: combinedYear,
    month: combinedMonth,
    source: combinedYear || combinedMonth ? 'file_name' : null
  };
}

export default {
  detectPeriod,
  detectFromPdfContent,
  detectFromPath,
  detectFromFileName
};
