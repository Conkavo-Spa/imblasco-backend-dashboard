import Pedido from '../../models/Pedido.js';

export default class AdminPedidosService {
    async guardarPedido({ productos, totalUnidades }) {
        const pedido = await Pedido.create({ productos, totalUnidades });
        return { success: true, data: pedido };
    }

    async getPedidos() {
        const pedidos = await Pedido.find().sort({ createdAt: -1 }).lean();
        return { success: true, data: pedidos };
    }

    async actualizarProductos(id, { productos }) {
        const pedido = await Pedido.findByIdAndUpdate(
            id,
            { productos },
            { new: true }
        ).lean();
        if (!pedido) return { success: false, message: 'Pedido no encontrado' };
        return { success: true, data: pedido };
    }

    async getPedidoById(id) {
        const pedido = await Pedido.findById(id).lean();
        if (!pedido) return { success: false, message: 'Pedido no encontrado' };
        return { success: true, data: pedido };
    }

    async eliminarPedido(id) {
        const pedido = await Pedido.findByIdAndDelete(id).lean();
        if (!pedido) return { success: false, message: 'Pedido no encontrado' };
        return { success: true };
    }

    // Agrega unidades confirmadas (X Embarcar) por código de producto.
    // El cliente lo marca cuando confirma el pedido — antes de recibir documentación del proveedor.
    async getConfirmados() {
        const pedidos = await Pedido.find().lean();
        const totales = {};
        pedidos.forEach(pedido => {
            pedido.productos.forEach(p => {
                if (p.estado === 'confirmado') {
                    totales[p.cod] = (totales[p.cod] || 0) + p.cantidad;
                }
            });
        });
        return { success: true, data: totales };
    }

    // Agrega unidades embarcadas por código de producto a través de todos los pedidos.
    // Solo incluye 'embarcado': el cliente lo marca manualmente cuando recibe la documentación del proveedor.
    async getEmbarcados() {
        const pedidos = await Pedido.find().lean();
        const totales = {};
        pedidos.forEach(pedido => {
            pedido.productos.forEach(p => {
                if (p.estado === 'embarcado') {
                    totales[p.cod] = (totales[p.cod] || 0) + p.cantidad;
                }
            });
        });
        return { success: true, data: totales };
    }
}
