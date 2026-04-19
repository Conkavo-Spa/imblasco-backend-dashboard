import express from 'express';
import AdminComprasController from '../../controllers/admin/adminComprasController.js';

const router = express.Router();
const controller = new AdminComprasController();

router.post('/compras/actualizar', controller.actualizarDatos);
router.get('/compras/buscar', controller.buscarProductos);
router.get('/compras/productos', controller.getProductos);

export default router;
