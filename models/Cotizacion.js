import mongoose from 'mongoose';

const { Schema } = mongoose;

const cotizacionSchema = new Schema(
    {
        cotizacion: { type: Number, required: true, unique: true, index: true },
        rutcli: { type: Number, index: true },
        cliente: { type: Schema.Types.Mixed },
        detalle: { type: [Schema.Types.Mixed], default: [] },
        fecha: { type: Date },
        fecha_local: { type: Date },
        totales: { type: Schema.Types.Mixed },
        updated_at: { type: Date },
    },
    {
        strict: false,
        collection: 'cotizaciones_emitidas',
    }
);

const Cotizacion = mongoose.models.Cotizacion || mongoose.model('Cotizacion', cotizacionSchema);

export default Cotizacion;
