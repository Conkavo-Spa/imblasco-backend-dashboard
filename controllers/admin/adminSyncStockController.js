import AdminSyncStockService from '../../services/admin/adminSyncStock.service.js';

const service = new AdminSyncStockService();

export default class AdminSyncStockController {

    triggerSync = async (req, res) => {
        try {
            const result = await service.triggerSync();
            if (!result.success) return res.status(409).json(result);
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminSyncStockController — triggerSync:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };

    getStatus = async (req, res) => {
        try {
            const result = await service.getStatus();
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminSyncStockController — getStatus:', error);
            return res.status(500).json({ success: false, message: error.message });
        }
    };
}
