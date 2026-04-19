import AdminPedidosService from '../../services/admin/adminPedidos.service.js';

const service = new AdminPedidosService();

export default class AdminPedidosController {
    // POST /api/pedidos
    guardarPedido = async (req, res) => {
        try {
            const { productos, totalUnidades } = req.body;
            const result = await service.guardarPedido({ productos, totalUnidades });
            return res.status(201).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — guardarPedido:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // GET /api/pedidos
    getPedidos = async (req, res) => {
        try {
            const result = await service.getPedidos();
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — getPedidos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // PATCH /api/pedidos/:id/productos
    actualizarProductos = async (req, res) => {
        try {
            const { id } = req.params;
            const { productos } = req.body;
            const result = await service.actualizarProductos(id, { productos });
            if (!result.success) return res.status(404).json(result);
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — actualizarProductos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // GET /api/pedidos/:id
    getPedidoById = async (req, res) => {
        try {
            const { id } = req.params;
            const result = await service.getPedidoById(id);
            if (!result.success) return res.status(404).json(result);
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — getPedidoById:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // DELETE /api/pedidos/:id
    eliminarPedido = async (req, res) => {
        try {
            const { id } = req.params;
            const result = await service.eliminarPedido(id);
            if (!result.success) return res.status(404).json(result);
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — eliminarPedido:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // GET /api/pedidos/confirmados
    getConfirmados = async (req, res) => {
        try {
            const result = await service.getConfirmados();
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — getConfirmados:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    // GET /api/pedidos/embarcados
    getEmbarcados = async (req, res) => {
        try {
            const result = await service.getEmbarcados();
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminPedidosController — getEmbarcados:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
