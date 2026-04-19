import mongoose from 'mongoose';

const { Schema } = mongoose;

const lineaSchema = new Schema({
    cod:        { type: String, required: true },
    nombre:     { type: String, required: true },
    cantidad:   { type: Number, required: true, min: 0 },
    estado:     { type: String, enum: ['pendiente', 'enDisputa', 'confirmado', 'embarcado', 'recibido'], default: 'pendiente' },
}, { _id: false });

const pedidoSchema = new Schema({
    fecha:          { type: Date, default: Date.now },
    productos:      { type: [lineaSchema], required: true },
    totalUnidades:  { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model('Pedido', pedidoSchema);
