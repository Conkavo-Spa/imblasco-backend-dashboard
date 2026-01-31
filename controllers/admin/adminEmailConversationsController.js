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

