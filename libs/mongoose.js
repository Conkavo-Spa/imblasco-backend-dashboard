import mongoose from 'mongoose';

/**
 * IMPORTANTE (seguridad):
 * - NO dejar credenciales hardcodeadas en el repo.
 * - La conexión debe venir desde variables de entorno (process.env.MONGO_URI).
 */

const connectMongoDB = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI;
        if (!MONGO_URI) {
            throw new Error('Falta MONGO_URI en variables de entorno');
        }

        await mongoose.connect(MONGO_URI);
        console.log(`✅ Conectado a MongoDB (DB: ${mongoose.connection.name})`);
    } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error.message);
        throw error;
    }
};

export default connectMongoDB;

