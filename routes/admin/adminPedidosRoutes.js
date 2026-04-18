import express from 'express';
import AdminPedidosController from '../../controllers/admin/adminPedidosController.js';

const router = express.Router();
const controller = new AdminPedidosController();

router.post('/pedidos', controller.guardarPedido);
router.get('/pedidos/confirmados', controller.getConfirmados);
router.get('/pedidos/embarcados', controller.getEmbarcados);
router.get('/pedidos', controller.getPedidos);
router.get('/pedidos/:id', controller.getPedidoById);
router.patch('/pedidos/:id/productos', controller.actualizarProductos);
router.delete('/pedidos/:id', controller.eliminarPedido);

export default router;
