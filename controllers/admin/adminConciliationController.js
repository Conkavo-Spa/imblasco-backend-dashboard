import AdminConciliationService from '../../services/admin/adminConciliation.service.js';
import {
    CONCILIATION_CODES,
    HTTP_STATUS_BY_CONCILIATION_CODE,
} from '../../constants/adminConciliation.constants.js';

const adminConciliationService = new AdminConciliationService();

export default class AdminConciliationController {

    /**
     * POST /api/conciliations/conciliar
     * Body: { movement: object, cotizacion: object }
     */
    saveConciliacion = async (req, res) => {
        try {
            const { movement, cotizacion } = req.body ?? {};
            const result = await adminConciliationService.saveConciliacion({ movement, cotizacion });

            if (!result.success) {
                const status = HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
                return res.status(status).json({ success: false, code: result.code, message: result.message });
            }

            return res.status(201).json({ success: true, code: result.code, data: result.data });
        } catch (error) {
            console.error('❌ AdminConciliationController — saveConciliacion:', error);
            return res.status(500).json({ success: false, code: CONCILIATION_CODES.INTERNAL_ERROR, message: error.message });
        }
    };

    /**
     * GET /api/conciliations/historial
     * Query: page=1, limit=200
     */
    listConciliaciones = async (req, res) => {
        try {
            const { page = 1, limit = 200 } = req.query;
            const result = await adminConciliationService.listConciliaciones({
                page: Number(page),
                limit: Math.min(Number(limit), 1000),
            });
            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminConciliationController — listConciliaciones:', error);
            return res.status(500).json({ success: false, code: CONCILIATION_CODES.INTERNAL_ERROR, message: error.message });
        }
    };

    /**
     * GET /api/conciliations/cotizaciones
     * Query: since=YYYY-MM-DD, until=YYYY-MM-DD, page=1, limit=50
     */
    listCotizaciones = async (req, res) => {
        try {
            const { since, until, page = 1, limit = 50 } = req.query;

            const result = await adminConciliationService.listCotizaciones({
                since,
                until,
                page: Number(page),
                limit: Math.min(Number(limit), 1000),
            });

            return res.status(200).json(result);
        } catch (error) {
            console.error('❌ AdminConciliationController — listCotizaciones:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    /**
     * GET /api/conciliations/cotizaciones/:cotizacionId/detalle
     * Retorna cotización completa con productos (detalle)
     */
    getCotizacionDetalle = async (req, res) => {
        try {
            const { cotizacionId } = req.params;
            const result = await adminConciliationService.getCotizacionDetalle(cotizacionId);

            if (!result.success) {
                const status = HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
                return res.status(status).json({
                    success: false,
                    code: result.code,
                    message: result.message,
                });
            }

            return res.status(200).json({
                success: true,
                code: result.code,
                data: result.data,
            });
        } catch (error) {
            console.error('❌ AdminConciliationController — getCotizacionDetalle:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    /**
     * GET /api/conciliations/cotizaciones/:cotizacionId/payment-status
     * Busca la cotización en MongoDB y cruza contra Fintoc.
     * No requiere fecha ni monto en query — los obtiene de la BD.
     */
    getQuotePaymentStatus = async (req, res) => {
        try {
            const { cotizacionId } = req.params;

            const result = await adminConciliationService.checkQuotePaymentStatus(cotizacionId);

            if (!result.success) {
                const status = HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
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
            console.error('❌ AdminConciliationController — getQuotePaymentStatus:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    /**
     * GET /api/conciliations/movements
     * Query: since=YYYY-MM-DD, until=YYYY-MM-DD (inclusive)
     */
    listMovements = async (req, res) => {
        try {
            const since = req.query.since != null ? String(req.query.since) : '';
            const until = req.query.until != null ? String(req.query.until) : '';

            const result = await adminConciliationService.listInboundMovements(since, until);

            if (!result.success) {
                const status = HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
                return res.status(status).json({
                    success: false,
                    code: result.code,
                    message: result.message,
                });
            }

            return res.status(200).json({
                success: true,
                code: result.code,
                data: result.data,
            });
        } catch (error) {
            console.error('❌ AdminConciliationController — listMovements:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    /**
     * GET /api/conciliations/movements-from-json
     * Query: since=YYYY-MM-DD, until=YYYY-MM-DD (inclusive)
     * Lee desde archivo JSON local en lugar de Fintoc API
     */
    listMovementsFromJson = async (req, res) => {
        try {
            const since = req.query.since != null ? String(req.query.since) : '';
            const until = req.query.until != null ? String(req.query.until) : '';

            const result = await adminConciliationService.listMovementsFromJson(since, until);

            if (!result.success) {
                const status = HTTP_STATUS_BY_CONCILIATION_CODE[result.code] || 400;
                return res.status(status).json({
                    success: false,
                    code: result.code,
                    message: result.message,
                });
            }

            return res.status(200).json({
                success: true,
                code: result.code,
                data: result.data,
            });
        } catch (error) {
            console.error('❌ AdminConciliationController — listMovementsFromJson:', error);
            return res.status(500).json({
                success: false,
                code: CONCILIATION_CODES.INTERNAL_ERROR,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };
}
