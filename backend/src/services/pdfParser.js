import path from 'node:path';
import { amount } from './finance.js';
import fs from "fs";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";
import Receipt from "../models/Receipt.js";
import { getLLM } from "./llmFactory.js";
import { HumanMessage } from "@langchain/core/messages";

dotenv.config();

/**
 * Prompt para extraer datos estructurados del recibo
 */
const EXTRACTION_PROMPT = `Eres un experto en finanzas y contabilidad argentina.
Analiza el siguiente texto extraído de un documento PDF y extrae los datos en formato JSON.

TU OBJETIVO PRINCIPAL:
1. IDENTIFICAR el tipo de documento.
2. CLASIFICAR si es un INGRESO (plata que entra) o GASTO (plata que sale) para el dueño del comprobante.
   - **RECIBO_SUELDO**: Siempre es INGRESO.
   - **FACTURA (Emitida)**: Si el documento parece ser el ejemplar "ORIGINAL" emitido por una persona física (probablemente el usuario) a una empresa -> Es INGRESO.
   - **FACTURA (Recibida)**: Servicios (luz, gas, internet), compras, supermercado -> Es GASTO.

IMPORTANTE SOBRE NÚMEROS:
- TODOS los valores numéricos deben ser números puros (sin texto).
- Convertí números argentinos (1.234,56) a formato decimal estándar (1234.56).
- Si un campo no tiene valor numérico, usá null (no strings vacíos ni texto).
- El campo "unidad" SIEMPRE debe ser un número o null, NUNCA texto como "unidades".
- Ejemplos correctos: "unidad": 30, "unidad": 1.5, "unidad": null
- Ejemplos INCORRECTOS: "unidad": "30", "unidad": "unidades", "unidad": ""

IMPORTANTE:
- Usá nombres de conceptos ESTANDARIZADOS si coinciden con los ejemplos provistos.
- Extraé TODOS los conceptos detallados.

Devolvé ÚNICAMENTE un JSON válido con esta estructura:
{
  "tipoDocumento": "RECIBO_SUELDO" | "FACTURA_EMITIDA" | "FACTURA_RECIBIDA" | "OTRO",
  "categoria": "INGRESO" | "GASTO",
  "motivoCategoria": "Breve explicación",

  "numeroRecibo": "string o null",
  "fechaEmision": "YYYY-MM-DD o null",
  "fechaPago": "YYYY-MM-DD o null",

  "periodo": { "mes": número, "anio": número },

  "emisor": { "nombre": "string", "cuit": "string", "direccion": "string" },
  "receptor": { "nombre": "string", "cuit": "string", "condicionIVA": "string" },

  // Específico Recibos
  "empleado": { ...copia de receptor... },
  "empleador": { ...copia de emisor... },
  "diasTrabajo": número,
  "banco": { "nombre": "string", "cbu": "string" },
  "haberes": [ { "codigo": "string", "descripcion": "string", "unidad": número, "haberesConAporte": número, "haberesSinAporte": número } ],
  "retenciones": [ { "codigo": "string", "descripcion": "string", "porcentaje": número, "importe": número } ],

  // Específico Facturas
  "items": [ { "descripcion": "string", "cantidad": número, "precioUnitario": número, "importe": número } ],

  // Totales (TODOS LOS IMPORTES DEBEN SER NÚMEROS)
  "totales": {
    "subtotal": número,
    "iva": número,
    "totalHaberes": número,
    "totalRetenciones": número,
    "netoACobrar": número,
    "totalComprobante": número
  },
  "obraSocial": "string",
  "tipoMovimiento": "INGRESO" | "GASTO"
}
`;

/**
 * Busca ejemplos similares en la BD para usarlos como Few-Shot Learning (RAG)
 */
async function getFewShotExamples(text) {
  try {
    // Buscar documento similar por texto completo (usando índice de texto)
    // Tomamos una muestra representativa del texto para la búsqueda
    const searchSample = text.substring(0, 200).replace(/[^\w\s]/g, "");

    const similarDocs = await Receipt.find(
      { $text: { $search: searchSample } },
      { score: { $meta: "textScore" } },
    )
      .select(
        "textoCompleto emisor empleador haberes retenciones items categoria tipoMovimiento tipoRecibo",
      ) // Added tipoRecibo
      .sort({ score: { $meta: "textScore" } })
      .limit(1)
      .lean();

    if (similarDocs.length > 0 && similarDocs[0].textoCompleto) {
      const doc = similarDocs[0];

      // Construir el JSON de ejemplo (filtrado para no pasar basura)
      const exampleOutput = {
        tipoDocumento: doc.tipoRecibo?.includes("factura")
          ? "FACTURA_RECIBIDA"
          : doc.tipoRecibo?.includes("recibo")
            ? "RECIBO_SUELDO"
            : "OTRO", // More precise mapping
        categoria: doc.categoria,
        tipoMovimiento: doc.tipoMovimiento,
        emisor: doc.emisor || doc.empleador,
        haberes: doc.haberes,
        retenciones: doc.retenciones,
        items: doc.items,
      };

      return `
\n--------------------------------------------------------------
EJEMPLO DE REFERENCIA (CASO DE USO SIMILAR ENCONTRADO EN BASE DE DATOS):
Usá este ejemplo para entender cómo estandarizar los nombres de conceptos y la estructura.

TEXTO PARCIAL DEL EJEMPLO:
"...${doc.textoCompleto.substring(0, 300)}..."

SALIDA ESPERADA PARA EL EJEMPLO (JSON):
${JSON.stringify(exampleOutput, null, 2)}
--------------------------------------------------------------\n
`;
    }
  } catch (error) {
    console.warn("RAG: No se pudieron obtener ejemplos", error.name);
  }
  return "";
}

/**
 * Extrae datos del recibo usando LangChain (Provider configurable)
 * @param {Buffer|string} pdfBuffer - Buffer del PDF o ruta al archivo
 * @returns {Object} Datos extraídos del recibo
 */
export async function parseReceipt(pdfBuffer) {
  // Si es una ruta, leer el archivo
  if (typeof pdfBuffer === "string") {
    pdfBuffer = fs.readFileSync(pdfBuffer);
  }

  // Extraer texto del PDF
  const data = await pdfParse(Uint8Array.from(pdfBuffer));
  const text = data.text;

  if (!text || text.trim().length < 50) {
    throw new Error("No se pudo extraer texto del PDF");
  }

  try {
    // RAG: Obtener ejemplos similares
    const fewShotContext = await getFewShotExamples(text);

    // Inicializar LLM via Factory (usa variables de entorno)
    const llm = getLLM();

    const fullPrompt =
      EXTRACTION_PROMPT +
      fewShotContext +
      "\nTEXTO DEL DOCUMENTO A ANALIZAR:\n" +
      text;

    // Invocar LangChain
    const response = await llm.invoke([new HumanMessage(fullPrompt)], { signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 60000) });

    let responseText = response?.content;

    // Si la respuesta es un array (bloques de texto de LangChain / Gemini 2.5)
    if (Array.isArray(responseText)) {
      responseText = responseText
        .map((c) => (typeof c === "string" ? c : c.text || c.content || ""))
        .join("");
    } else if (typeof responseText !== "string") {
      responseText = responseText ? String(responseText) : "";
    }

    if (!responseText) {
      throw new Error("El modelo de IA devolvió una respuesta vacía");
    }

    // Limpiar respuesta (remover markdown de codigo JSON si existe)
    responseText = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Parsear JSON
    const extractedData = JSON.parse(responseText);

    // Mapear a formato compatible con MongoDB
    const isFactura = extractedData.tipoDocumento?.includes("FACTURA");
    const categoria = isFactura ? "factura" : "recibo";

    // Determinar monto principal
    const montoPrincipal =
      extractedData.totales?.totalComprobante ??
      extractedData.totales?.netoACobrar;

    return {
      numeroRecibo: extractedData.numeroRecibo || generateReceiptId(),
      periodo: extractedData.periodo || { mes: null, anio: null },
      diasTrabajo: extractedData.diasTrabajo || 30,

      // Unificar monto
      montoNeto: parseNumericValue(montoPrincipal),
      extractionMethod: "ai",

      // Totales desglosados
      totalHaberes: parseNumericValue(extractedData.totales?.totalHaberes),
      totalRetenciones: parseNumericValue(extractedData.totales?.totalRetenciones),
      subtotal: parseNumericValue(extractedData.totales?.subtotal),
      iva: parseNumericValue(extractedData.totales?.iva),

      // Metadatos de clasificación
      tipoMovimiento: (["INGRESO", "GASTO"].includes(extractedData.tipoMovimiento) ? extractedData.tipoMovimiento : ["INGRESO", "GASTO"].includes(extractedData.categoria) ? extractedData.categoria : extractedData.tipoDocumento === "FACTURA_RECIBIDA" ? "GASTO" : "INGRESO"), // INGRESO o GASTO
      motivoCategoria: extractedData.motivoCategoria || null,
      categoria: categoria, // 'recibo' o 'factura'

      // Datos de personas/empresas
      cuil:
        extractedData.empleado?.cuil || extractedData.receptor?.cuit || null,
      empleado: extractedData.empleado || extractedData.receptor || null,
      empleador: extractedData.empleador || extractedData.emisor || null,

      // Datos bancarios
      banco: extractedData.banco?.nombre || null,
      numeroCuenta:
        extractedData.banco?.cuenta || extractedData.banco?.cbu || null,

      // Fechas
      fechaAcreditacion: extractedData.fechaPago
        ? new Date(extractedData.fechaPago)
        : extractedData.fechaEmision
          ? new Date(extractedData.fechaEmision)
          : null,

      // Detalles (sanitizar datos numéricos)
      haberes: sanitizeHaberes(extractedData.haberes || []),
      retenciones: sanitizeRetenciones(extractedData.retenciones || []),
      items: extractedData.items || [], // Nuevo campo para facturas

      obraSocial: extractedData.obraSocial || null,
      tipoRecibo: detectReceiptType(text), // Mantiene detección legacy (unaj/andreani)
      textoCompleto: text,
    };
  } catch (error) {
    console.error("[Extracción IA] Falló el proveedor; se utiliza extracción básica.");
    // Fallback a parser básico si Gemini falla
    return parseReceiptFallback(text);
  }
}

/**
 * Sanitiza los datos de haberes para asegurar tipos correctos
 */
function sanitizeHaberes(haberes) {
  if (!Array.isArray(haberes)) return [];

  return haberes
    .map((haber) => ({
      codigo: haber.codigo || null,
      descripcion: haber.descripcion || null,
      unidad: parseNumericValue(haber.unidad),
      haberesConAporte: parseNumericValue(haber.haberesConAporte),
      haberesSinAporte: parseNumericValue(haber.haberesSinAporte),
    }))
    .filter((h) => h.descripcion); // Solo mantener haberes con descripción
}

/**
 * Sanitiza los datos de retenciones para asegurar tipos correctos
 */
function sanitizeRetenciones(retenciones) {
  if (!Array.isArray(retenciones)) return [];

  return retenciones
    .map((retencion) => ({
      codigo: retencion.codigo || null,
      descripcion: retencion.descripcion || null,
      porcentaje: parseNumericValue(retencion.porcentaje),
      importe: parseNumericValue(retencion.importe),
    }))
    .filter((r) => r.descripcion); // Solo mantener retenciones con descripción
}

/**
 * Parsea un valor a número, manejando strings, null, undefined, etc.
 */
export function parseNumericValue(value) {
  return amount(value, null);
}

/**
 * Genera un ID único para recibos sin número
 */
function generateReceiptId() {
  return `AUTO-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Detecta el tipo de recibo basado en el contenido
 */
function detectReceiptType(text) {
  if (text.includes("ANDREANI") || text.includes("DREANI")) return "andreani";
  if (text.includes("UNIVERSIDAD NACIONAL") || text.includes("UNAJ"))
    return "unaj";
  return "otro";
}

/**
 * Parser de fallback usando regex (cuando Gemini no está disponible)
 */
export function parseReceiptFallback(text) {
  // Convertir número argentino a decimal
  const parseArgNum = (str) => {
    if (!str) return null;
    return parseFloat(str.replace(/\./g, "").replace(",", "."));
  };

  // Buscar monto neto
  let montoNeto = null;
  const netoMatch = text.match(
    /(?:Neto\s*(?:a\s*)?Cobrar|Total\s*Neto)[:\s]*([\d.,]+)/i,
  );
  if (netoMatch) {
    montoNeto = parseArgNum(netoMatch[1]);
  }

  // Buscar período
  const meses = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };

  let periodo = { mes: null, anio: null };
  const periodoMatch = [...text.matchAll(/(\w+)\s+(\d{4})/gi)].find(match => meses[match[1].toLowerCase()]);
  if (periodoMatch && meses[periodoMatch[1].toLowerCase()]) {
    periodo.mes = meses[periodoMatch[1].toLowerCase()];
    periodo.anio = parseInt(periodoMatch[2]);
  }

  return {
    numeroRecibo: generateReceiptId(),
    periodo,
    diasTrabajo: 30,
    montoNeto,
    cuil: null,
    banco: null,
    tipoRecibo: detectReceiptType(text),
    textoCompleto: text,
    _fallback: true,
    extractionMethod: "fallback",
    extractionWarning: "La IA no estuvo disponible. Revisá los datos extraídos antes de guardar.",
  };
}

/**
 * Procesa múltiples PDFs de una carpeta
 */
export async function parseMultipleReceipts(folderPath) {
  folderPath = fs.realpathSync(folderPath);
  const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".pdf"));
  const receipts = [];

  for (const file of files) {
    try {
      console.log(`Procesando: ${file}`);
      const filePath = fs.realpathSync(path.join(folderPath, file));
      const relative = path.relative(folderPath, filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      const receipt = await parseReceipt(filePath);
      receipt.archivoOriginal = file;
      receipts.push(receipt);

      // Pequeña pausa para no saturar la API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error procesando ${file}:`, error.message);
    }
  }

  return receipts;
}

export default { parseReceipt, parseMultipleReceipts };
