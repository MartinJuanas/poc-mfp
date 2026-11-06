import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gastos');
        console.log(`MongoDB conectado: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error('No se pudo conectar a MongoDB. Revisá MONGODB_URI y la disponibilidad del servicio.', error.name);
        process.exit(1);
    }
};

export default connectDB;
