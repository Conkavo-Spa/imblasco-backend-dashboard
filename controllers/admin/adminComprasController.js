import AdminComprasService from '../../services/admin/adminCompras.service.js';

const adminComprasService = new AdminComprasService();

export default class AdminComprasController {
    /**
     * GET /api/compras/buscar?q=termino
     * Busca en el catálogo completo por nombre o código.
     */
    buscarProductos = async (req, res) => {
        try {
            const { q } = req.query;
            const result = await adminComprasService.buscarProductos(q);
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminComprasController — buscarProductos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    /**
     * POST /api/compras/actualizar
     * Marca todos los productos en estado 'embarcado' como 'recibido'.
     */
    actualizarDatos = async (req, res) => {
        try {
            const result = await adminComprasService.actualizarDatos();
            return res.status(200).json({ success: true, message: 'Datos actualizados correctamente.' });
        } catch (error) {
            console.error('❌ AdminComprasController — actualizarDatos:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    /**
     * GET /api/compras/productos
     * Retorna todos los productos activos con sugerencia calculada en tiempo real,
     * descontando unidades ya gestionadas en el dashboard (confirmado + embarcado).
     */
    getProductos = async (req, res) => {
        try {
            const result = await adminComprasService.getProductos();

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.message || 'Error al obtener productos',
                });
            }

            return res.status(200).json({
                success: true,
                data: result.data,
            });
        } catch (error) {
            console.error('❌ AdminComprasController — getProductos:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };
}
