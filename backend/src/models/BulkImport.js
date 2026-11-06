import mongoose from 'mongoose';

/**
 * Schema para cada archivo dentro de una importación masiva
 */
const bulkFileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  relativePath: {
    type: String,
    default: ''
  },
  sanitizedName: String,
  fileHash: {
    type: String,
    index: true
  },
  fileSize: Number,
  mimeType: String,
  status: {
    type: String,
    enum: ['pending', 'uploading', 'extracting', 'validating', 'saved', 'duplicate', 'failed', 'needs_review'],
    default: 'pending'
  },
  detectedYear: Number,
  detectedMonth: Number,
  periodSource: {
    type: String,
    enum: ['pdf_content', 'file_path', 'file_name', 'manual', null],
    default: null
  },
  receiptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Receipt'
  },
  duplicateProcessedAt: Date,
  reviewReason: String,
  duplicateReceiptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Receipt'
  },
  error: String,
  errorCode: {
    type: String,
    enum: [
      null,
      'INVALID_PDF',
      'PASSWORD_PROTECTED',
      'EMPTY_PDF',
      'LLM_ERROR',
      'LLM_INVALID_RESPONSE',
      'TIMEOUT',
      'DUPLICATE',
      'DB_ERROR',
      'REDIS_ERROR',
      'FILE_TOO_LARGE',
      'BATCH_LIMIT_EXCEEDED',
      'PERIOD_NOT_DETECTED',
      'VALIDATION_ERROR',
      'UNKNOWN_ERROR'
    ],
    default: null
  },
  processingTime: Number,
  extractedData: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  },
  provider: String,
  model: String
});

/**
 * Schema principal de importación masiva
 */
const bulkImportSchema = new mongoose.Schema({
  originalFolderName: {
    type: String,
    default: 'Archivos sueltos'
  },
  totalFiles: {
    type: Number,
    required: true
  },
  processedFiles: {
    type: Number,
    default: 0
  },
  successfulFiles: {
    type: Number,
    default: 0
  },
  failedFiles: {
    type: Number,
    default: 0
  },
  duplicateFiles: {
    type: Number,
    default: 0
  },
  needsReviewFiles: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['created', 'processing', 'completed', 'completed_with_errors', 'failed'],
    default: 'created'
  },
  files: [bulkFileSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

// Índice para listar lotes recientes
bulkImportSchema.index({ createdAt: -1 });

// Índice para buscar por status
bulkImportSchema.index({ status: 1 });

// Virtual para progreso como porcentaje
bulkImportSchema.virtual('progress').get(function () {
  if (this.totalFiles === 0) return 0;
  return Math.round((this.processedFiles / this.totalFiles) * 100);
});

bulkImportSchema.set('toJSON', { virtuals: true });

export default mongoose.models.BulkImport || mongoose.model('BulkImport', bulkImportSchema);
