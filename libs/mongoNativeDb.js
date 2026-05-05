import mongoose from 'mongoose';

/**
 * DB nativa (driver) respetando MONGO_DB si está definida; si no, la DB del URI.
 */
export function getNativeMongoDb() {
    const name = process.env.MONGO_DB?.trim();
    if (name) return mongoose.connection.useDb(name, { useCache: true }).db;
    return mongoose.connection.db;
}
