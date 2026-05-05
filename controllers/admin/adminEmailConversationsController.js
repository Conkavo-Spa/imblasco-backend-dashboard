import AdminEmailConversationsService from '../../services/admin/adminEmailConversations.service.js';

const AdminEmailConversations = new AdminEmailConversationsService();

export default class AdminEmailConversationsController {
    getAllEmailConversations = async (req, res) => {
        try {
            const { page, limit } = req.query;

            const response = await AdminEmailConversations.getAllEmailConversations({
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
            });

            return res.status(200).json(response);
        } catch (error) {
            console.error('❌ Controller - error al obtener emails:', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    deleteEmailConversation = async (req, res) => {
        try {
            const { id } = req.params;
            const response = await AdminEmailConversations.deleteEmailConversation(id);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ Controller - error al eliminar email:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setEmailConversationGoodAnswer = async (req, res) => {
        try {
            const { id } = req.params;
            const { isGood } = req.body || {};
            const response = await AdminEmailConversations.setEmailConversationGoodAnswer(id, isGood);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ Controller - error al guardar bien respondido (email):', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setEmailConversationCorrected = async (req, res) => {
        try {
            const { id } = req.params;
            const { isCorrected } = req.body || {};
            const response = await AdminEmailConversations.setEmailConversationCorrected(id, isCorrected);
            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ Controller - error al guardar corregido (email):', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    responderCotABlas = async (req, res) => {
        try {
            const { email_id, thread_id } = req.body || {};
            const response = await AdminEmailConversations.responderCotABlas({ email_id, thread_id });
            let status = 200;
            if (!response.success) {
                if (String(response.message || '').includes('No se encontró')) status = 404;
                else status = 400;
            }
            return res.status(status).json(response);
        } catch (error) {
            console.error('❌ Controller - responderCotABlas:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    enviarRespuestaCotizacion = async (req, res) => {
        try {
            const { conversation_id, thread_id, email_id, mode, numero_cotizacion } = req.body || {};
            const response = await AdminEmailConversations.enviarRespuestaCotizacionDashboard({
                conversation_id,
                thread_id,
                email_id,
                mode,
                numero_cotizacion,
            });
            let status = 200;
            if (!response.success) {
                if (response.code === 'NO_SYSTEM_EMAIL' || response.code === 'NO_INBOUND') status = 404;
                else if (response.code === 'ALREADY_SENT') status = 409;
                else status = 400;
            }
            return res.status(status).json(response);
        } catch (error) {
            console.error('❌ Controller - enviarRespuestaCotizacion:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setEmailMessageFeedback = async (req, res) => {
        try {
            const { id, messageId } = req.params;
            const { feedback } = req.body || {};

            const response = await AdminEmailConversations.setEmailMessageFeedback(id, messageId, feedback);

            return res.status(response.success ? 200 : 400).json(response);
        } catch (error) {
            console.error('❌ Controller - error al guardar feedback (email):', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };
}

