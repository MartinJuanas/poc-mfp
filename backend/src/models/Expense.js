import mongoose from 'mongoose';

import { CATEGORIAS, PAYMENT_METHODS } from '../services/expenseCategories.js';

const expenseSchema = new mongoose.Schema({
    monto: {
        type: Number,
        min: 0.01,
        required: true
    },
    categoria: {
        type: String,
        enum: CATEGORIAS,
        required: true
    },
    periodo: {
        mes: { type: Number, min: 1, max: 12, required: true },
        anio: { type: Number, min: 1900, max: 2100, required: true }
    },
    fecha: {
        type: Date  // Día exacto (opcional)
    },
    medioPago: { type: String, enum: PAYMENT_METHODS, default: null },
    descripcion: {
        type: String,
        default: ''
    },
    importKey: { type: String },
    expenseImportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseImport' },
    source: { type: String, enum: ['manual', 'assistant'], default: 'manual' },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Índice compuesto para búsqueda por período (misma lógica que Receipt)
expenseSchema.index({ 'periodo.anio': -1, 'periodo.mes': -1 });

expenseSchema.index({ importKey: 1 }, { unique: true, partialFilterExpression: { importKey: { $type: 'string' } } });

// Índice por categoría para queries de agrupación
expenseSchema.index({ categoria: 1 });

expenseSchema.set('toJSON', { virtuals: true });

export { CATEGORIAS };
export async function migrateLegacyExpenseCategories() {
    return mongoose.model('Expense').updateMany({ categoria: 'ocio' }, { $set: { categoria: 'entretenimiento' } });
}
export default mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
