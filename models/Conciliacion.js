import mongoose from 'mongoose';

const conciliacionSchema = new mongoose.Schema(
    {
        movement_id: { type: String, required: true, unique: true, index: true },
        cotizacion_id: { type: Number, required: false, default: null, index: true },
        factura_id: { type: Number, required: false, default: null, index: true },
        document_type: { type: String, enum: ['cotizacion', 'factura'], default: 'cotizacion' },
        monto: { type: Number, required: true },
        fecha_movimiento: { type: String }, // YYYY-MM-DD
        bank_name: { type: String, default: null },
        cliente: { type: String, default: null },
        rut: { type: String, default: null },
        movement: { type: mongoose.Schema.Types.Mixed },
        cotizacion: { type: mongoose.Schema.Types.Mixed },
        factura: { type: mongoose.Schema.Types.Mixed },
    },
    { collection: 'conciliaciones', timestamps: true }
);

export default mongoose.model('Conciliacion', conciliacionSchema);
