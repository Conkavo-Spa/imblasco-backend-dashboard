import express from 'express';
import AdminConciliationController from '../../controllers/admin/adminConciliationController.js';

const router = express.Router();
const controller = new AdminConciliationController();

// Lista cotizaciones desde MongoDB (cotizaciones_emitidas)
// Query: since=YYYY-MM-DD, until=YYYY-MM-DD, page=1, limit=50
router.get('/conciliations/cotizaciones', controller.listCotizaciones);

// Cruza una cotización de MongoDB contra transferencias Fintoc
router.get('/conciliations/cotizaciones/:cotizacionId/payment-status', controller.getQuotePaymentStatus);

// Lista transferencias entrantes desde Fintoc
// Query: since=YYYY-MM-DD, until=YYYY-MM-DD
router.get('/conciliations/movements', controller.listMovements);

export default router;
