import express from 'express';
import AdminConciliationController from '../../controllers/admin/adminConciliationController.js';

const router = express.Router();
const controller = new AdminConciliationController();

// Guarda una conciliación (movimiento + cotización) en MongoDB
router.post('/conciliations/conciliar', controller.saveConciliacion);

// Lista todas las conciliaciones guardadas
router.get('/conciliations/historial', controller.listConciliaciones);

// Lista cotizaciones desde MongoDB (cotizaciones_emitidas)
router.get('/conciliations/cotizaciones', controller.listCotizaciones);

// Retorna cotización completa con detalle (productos)
router.get('/conciliations/cotizaciones/:cotizacionId/detalle', controller.getCotizacionDetalle);

// Cruza una cotización de MongoDB contra transferencias Fintoc
router.get('/conciliations/cotizaciones/:cotizacionId/payment-status', controller.getQuotePaymentStatus);

// Lista transferencias entrantes desde Fintoc
router.get('/conciliations/movements', controller.listMovements);

// Lista movimientos desde JSON local (en lugar de Fintoc)
router.get('/conciliations/movements-from-json', controller.listMovementsFromJson);

export default router;
