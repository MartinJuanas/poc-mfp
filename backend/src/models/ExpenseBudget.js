import mongoose from 'mongoose';
import { CATEGORIAS } from '../services/expenseCategories.js';

const schema = new mongoose.Schema({
  categoria: { type: String, enum: CATEGORIAS, required: true },
  periodo: {
    mes: { type: Number, min: 1, max: 12, required: true },
    anio: { type: Number, min: 1900, max: 2100, required: true }
  },
  limite: { type: Number, min: .01, required: true }
}, { timestamps: true });
schema.index({ 'periodo.anio': 1, 'periodo.mes': 1, categoria: 1 }, { unique: true });
export default mongoose.models.ExpenseBudget || mongoose.model('ExpenseBudget', schema);
