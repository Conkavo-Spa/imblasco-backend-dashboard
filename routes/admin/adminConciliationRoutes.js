import express from 'express';
import AdminConciliationController from '../../controllers/admin/adminConciliationController.js';

const router = express.Router();
const controller = new AdminConciliationController();

/**
 * Conciliación bancaria (cotización vs movimientos Fintoc).
 */
router.get(
    '/conciliations/cotizaciones/:cotizacionId/payment-status',
    controller.getQuotePaymentStatus
);

export default router;
