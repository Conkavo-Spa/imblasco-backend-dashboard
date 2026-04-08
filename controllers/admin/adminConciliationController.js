import AdminConciliationService from '../../services/admin/adminConciliation.service.js';
import {
    CONCILIATION_CODES,
    HTTP_STATUS_BY_CONCILIATION_CODE,
} from '../../constants/adminConciliation.constants.js';

const adminConciliationService = new AdminConciliationService();

export default class AdminConciliationController {
    /**
     * GET /api/conciliations/cotizaciones/:cotizacionId/payment-status
     */
    getQuotePaymentStatus = async (req, res) => {
        try {
            const { cotizacionId } = req.params;

            const result = await adminConciliationService.checkQuotePaymentStatus(cotizacionId);

            if (!result.success) {
                const status =
                    HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
                return res.status(status).json({
                    success: false,
                    code: result.code,
                    message: result.message,
                });
            }

            return res.status(200).json({
                success: true,
                code: result.code,
                message: result.message,
                data: result.data,
            });
        } catch (error) {
            console.error('❌ AdminConciliationController — error inesperado:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };
}
