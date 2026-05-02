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
        const totalUnidades = productos.reduce((sum, p) => sum + (p.cantidad ?? 0), 0);
        const pedido = await Pedido.findByIdAndUpdate(
            id,
            { productos, totalUnidades },
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

    // Recibe items [{ cod, cantidadRecibida }] del Excel conciliado.
    // Distribuye oldest-first: llena pedidos más viejos primero.
    // Si cantidadRecibida >= cantidad pedida → recibido
    // Si cantidadRecibida < cantidad pedida  → incompleto + guarda cantidadRecibida
    async confirmarRecibidos(items) {
        const codMap = {};
        items.forEach(i => { codMap[i.cod] = i.cantidadRecibida; });

        const pedidos = await Pedido.find({
            productos: {
                $elemMatch: {
                    cod:    { $in: Object.keys(codMap) },
                    estado: { $in: ['pendiente', 'confirmado', 'embarcado', 'incompleto'] },
                },
            },
        }).sort({ createdAt: 1 });

        const restante = { ...codMap };

        for (const pedido of pedidos) {
            let modified = false;
            for (const prod of pedido.productos) {
                if (!Object.prototype.hasOwnProperty.call(restante, prod.cod)) continue;
                if (!['pendiente', 'confirmado', 'embarcado', 'incompleto'].includes(prod.estado)) continue;

                const disponible = restante[prod.cod];
                if (disponible >= prod.cantidad) {
                    prod.cantidadRecibida = prod.cantidad;
                    prod.estado = 'recibido';
                    restante[prod.cod] -= prod.cantidad;
                } else if (disponible > 0) {
                    prod.cantidadRecibida = disponible;
                    prod.estado = 'incompleto';
                    restante[prod.cod] = 0;
                }
                modified = true;
            }
            if (modified) await pedido.save();
        }

        return { success: true };
    }
}
