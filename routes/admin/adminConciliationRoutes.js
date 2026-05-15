import express from 'express';
import AdminConciliationController from '../../controllers/admin/adminConciliationController.js';

const router = express.Router();
const controller = new AdminConciliationController();

// Guarda una conciliación (movimiento + cotización) en MongoDB
router.post('/conciliations/conciliar', controller.saveConciliacion);

// Lista todas las conciliaciones guardadas
router.get('/conciliations/historial', controller.listConciliaciones);

// Elimina una conciliación por su _id
router.delete('/conciliations/:id', controller.deleteConciliacion);

// Lista cotizaciones desde MongoDB (cotizaciones_emitidas)
router.get('/conciliations/cotizaciones', controller.listCotizaciones);

// Lista facturas desde MongoDB (facturas_emitidas)
router.get('/conciliations/facturas', controller.listFacturas);

// Retorna cotización completa con detalle (productos)
router.get('/conciliations/cotizaciones/:cotizacionId/detalle', controller.getCotizacionDetalle);

// Retorna factura completa con detalle (productos, tras correr enrich_facturas_detalle.js)
router.get('/conciliations/facturas/:facturaId/detalle', controller.getFacturaDetalle);

// Cruza una cotización de MongoDB contra transferencias Fintoc
router.get('/conciliations/cotizaciones/:cotizacionId/payment-status', controller.getQuotePaymentStatus);

// Lista transferencias entrantes desde Fintoc
router.get('/conciliations/movements', controller.listMovements);

// Lista movimientos desde JSON local (en lugar de Fintoc)
router.get('/conciliations/movements-from-json', controller.listMovementsFromJson);

export default router;
