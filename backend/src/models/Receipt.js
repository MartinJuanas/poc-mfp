import mongoose from 'mongoose';

// Schema para conceptos de haberes
const haberSchema = new mongoose.Schema({
  codigo: String,
  descripcion: String,
  unidad: Number,
  haberesConAporte: Number,
  haberesSinAporte: Number
}, { _id: false });

// Schema para retenciones
const retencionSchema = new mongoose.Schema({
  codigo: String,
  descripcion: String,
  porcentaje: Number,
  importe: Number
}, { _id: false });

// Schema para datos del empleado
const empleadoSchema = new mongoose.Schema({
  nombre: String,
  cuil: String,
  legajo: String,
  fechaIngreso: Date,
  antiguedad: String,
  categoria: String,
  puesto: String
}, { _id: false });

// Schema para datos del empleador
const empleadorSchema = new mongoose.Schema({
  nombre: String,
  cuit: String,
  direccion: String
}, { _id: false });

// Schema principal del recibo
const receiptSchema = new mongoose.Schema({
  numeroRecibo: {
    type: String,
    required: true,
    unique: true
  },
  periodo: {
    mes: { type: Number, min: 1, max: 12 },
    anio: { type: Number, min: 1900, max: 2100 }
  },
  diasTrabajo: Number,

  // Montos principales
  montoNeto: { type: Number, min: 0 },
  totalHaberes: { type: Number, min: 0 },
  totalRetenciones: { type: Number, min: 0 },

  // Datos de personas/empresas
  cuil: String,
  empleado: empleadoSchema,
  empleador: empleadorSchema,

  // Datos bancarios
  banco: String,
  numeroCuenta: String,

  // Fechas
  fechaAcreditacion: Date,

  // Detalles de conceptos
  haberes: [haberSchema],
  retenciones: [retencionSchema],

  // Otros
  obraSocial: String,
  tipoRecibo: {
    type: String,
    enum: ['unaj', 'andreani', 'otro'],
    default: 'otro'
  },
  categoria: {
    type: String,
    enum: ['recibo', 'factura'],
    default: 'recibo'
  },
  tipoMovimiento: {
    type: String,
    enum: ['INGRESO', 'GASTO'],
    default: 'INGRESO'
  },

  // Conversión a dólar (al momento de carga)
  cotizacionDolar: {
    oficial: Number,
    blue: Number,
    mayorista: Number,
    cripto: Number
  },
  montoEnDolares: {
    oficial: Number,
    blue: Number,
    mayorista: Number,
    cripto: Number
  },

  moneda: { type: String, enum: ['ARS'], default: 'ARS' },
  items: [{ descripcion: String, cantidad: Number, precioUnitario: Number, importe: Number }],
  subtotal: Number,
  iva: Number,
  motivoCategoria: String,
  extractionMethod: { type: String, enum: ['ai', 'fallback', 'manual'] },
  extractionWarning: String,
  // Metadatos
  archivoOriginal: String,
  fileHash: { type: String },
  bulkImportId: { type: mongoose.Schema.Types.ObjectId, ref: 'BulkImport' },
  periodSource: { type: String, enum: ['pdf_content', 'file_path', 'file_name', 'manual', null], default: null },
  textoCompleto: { type: String, select: false }, // Exclude by default to save bandwidth
  createdAt: {
    type: Date,
    default: Date.now
  }
});

receiptSchema.index({ fileHash: 1 }, { unique: true, name: 'receipt_hash_unique', partialFilterExpression: { fileHash: { $type: 'string' } } });

// Índice compuesto para búsqueda por período
receiptSchema.index({ 'periodo.anio': -1, 'periodo.mes': -1 });

// Índice por tipo de recibo
receiptSchema.index({ tipoRecibo: 1 });

// Índice de texto para búsqueda RAG
receiptSchema.index({ textoCompleto: 'text' });

// Virtual para obtener total de haberes con y sin aporte
receiptSchema.virtual('totalHaberesConAporte').get(function () {
  if (!this.haberes) return 0;
  return this.haberes.reduce((sum, h) => sum + (h.haberesConAporte || 0), 0);
});

receiptSchema.virtual('totalHaberesSinAporte').get(function () {
  if (!this.haberes) return 0;
  return this.haberes.reduce((sum, h) => sum + (h.haberesSinAporte || 0), 0);
});

receiptSchema.set('toJSON', { virtuals: true });

export default mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
