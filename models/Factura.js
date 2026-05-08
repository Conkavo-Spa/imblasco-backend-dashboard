import mongoose from 'mongoose';

const { Schema } = mongoose;

const facturaSchema = new Schema(
    {
        factura: { type: Number, required: true, unique: true, index: true },
        cotizacion: { type: Number, index: true },
        rutcli: { type: Number, index: true },
        fecha: { type: Date },
        fecha_local: { type: Date },
        totgen: { type: Number },
        updated_at: { type: Date },
    },
    {
        strict: false,
        collection: 'facturas_emitidas',
    }
);

const Factura = mongoose.models.Factura || mongoose.model('Factura', facturaSchema);

export default Factura;
