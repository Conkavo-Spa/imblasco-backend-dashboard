import mongoose from 'mongoose';

const imblascoProductoSchema = new mongoose.Schema({
    cod:         { type: String, required: true, unique: true },
    nombre:      { type: String, default: '' },
    stock:       { type: Number, default: 0 },
    porEmbarcar: { type: Number, default: 0 },
    y2023:       { type: Number, default: 0 },
    y2024:       { type: Number, default: 0 },
    y2025:       { type: Number, default: 0 },
    y2026:       { type: Number, default: 0 },
    syncedAt:    { type: Date },
}, {
    collection: 'imp_productos_stock_ventas',
    timestamps: false,
});

export default mongoose.model('ImblascoProducto', imblascoProductoSchema);
