import express from 'express';
import AdminSyncStockController from '../../controllers/admin/adminSyncStockController.js';

const router = express.Router();
const controller = new AdminSyncStockController();

router.post('/sync/stock', controller.triggerSync);
router.get('/sync/stock/status', controller.getStatus);

export default router;
