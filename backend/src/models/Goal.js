import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true
    },
    tipo: {
        type: String,
        enum: ['ahorro', 'inversion'],
        required: true
    },
    montoObjetivo: {
        type: Number,
        min: 0,
        default: 0
    },
    montoActual: {
        type: Number,
        min: 0,
        default: 0
    },
    // Campos para Inversiones
    subtipo: {
        type: String, // ej: 'FCI', 'Plazo Fijo'
        default: ''
    },
    rendimientoMensual: {
        type: Number, // Porcentaje mensual estimado (ej: 5.5)
        default: 0
    },
    moneda: {
        type: String,
        enum: ['ARS', 'USD'],
        default: 'ARS'
    },
    fechaInicio: {
        type: Date,
        default: Date.now
    },
    fechaObjetivo: Date,
    aportes: [{
        monto: Number,
        fecha: { type: Date, default: Date.now },
        descripcion: String
    }],
    completada: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Calcular progreso como porcentaje
goalSchema.virtual('progreso').get(function () {
    return this.montoObjetivo > 0
        ? Math.min(100, (this.montoActual / this.montoObjetivo) * 100)
        : 0;
});

goalSchema.set('toJSON', { virtuals: true });

export default mongoose.models.Goal || mongoose.model('Goal', goalSchema);
