import { sendError } from './middleware/errors.js';
import { validateRequest } from './middleware/validation.js';
import { recoverInterruptedBatches } from './services/bulkService.js';
import mongoose from 'mongoose';
import Receipt from './models/Receipt.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import receiptsRouter from './routes/receipts.js';
import bulkRouter from './routes/bulkRoutes.js';
import goalsRouter from './routes/goals.js';
import currencyRouter from './routes/currency.js';
import dashboardRouter from './routes/dashboard.js';
import expensesRouter from './routes/expenses.js';
import expenseAssistantRouter, { recoverExpenseImports } from './routes/expenseAssistant.js';
import Expense, { migrateLegacyExpenseCategories } from './models/Expense.js';
import ExpenseImport from './models/ExpenseImport.js';
import ExpenseBudget from './models/ExpenseBudget.js';
import simulatorRouter from './routes/simulator.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(v => v.trim()) }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', validateRequest);

// Rutas
app.use('/api/receipts/bulk', bulkRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/currency', currencyRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/expenses/assistant', expenseAssistantRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/simulator', simulatorRouter);

// Ruta de health check
app.get('/api/health', (req, res) => {
    res.json({
        status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.name === 'MulterError') return res.status(400).json({ success: false, error: 'La carga supera los límites permitidos. Revisá la cantidad y el tamaño de los PDFs.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, error: 'La solicitud no contiene datos válidos.' });
    sendError(res, err);
});
export { app };

// Iniciar servidor
const startServer = async () => {
    try {
        // Conectar a MongoDB
        await connectDB();

        await Receipt.init(); // Enforce the unique document hash before accepting uploads.
        await Expense.init();
        // The retired main category changes its name without deleting historical expenses.
        await migrateLegacyExpenseCategories();
        await ExpenseImport.init();
        await ExpenseBudget.init();
        await recoverExpenseImports();
        await recoverInterruptedBatches();
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════╗
║     💰 Gastos API Server                       ║
╠════════════════════════════════════════════════╣
║  🚀 Servidor corriendo en puerto ${PORT}            ║
║  📊 Endpoints disponibles:                     ║
║     - GET  /api/receipts                       ║
║     - POST /api/receipts/upload                ║
║     - GET  /api/goals                          ║
║     - GET  /api/currency                       ║
╚════════════════════════════════════════════════╝
      `);
        });
    } catch (error) {
        console.error('Error iniciando servidor:', error);
        process.exit(1);
    }
};

if (process.env.NODE_ENV !== 'test') startServer();
