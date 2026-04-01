import AdminConversationsService from '../../services/admin/adminConversations.service.js';

const AdminConversations = new AdminConversationsService();

export default class AdminConversationsController {

    getAllConversations = async (req, res) => {
        try {
            const { page, limit, channel } = req.query;

            const response = await AdminConversations.getAllConversations({
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 10,
                channel: channel || 'email',
            });

            return res.status(200).json(response);

        } catch (error) {
            console.error('❌ Controller - error al obtener conversaciones:', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setConversationFeedback = async (req, res) => {
        try {
            const { id } = req.params;
            const { feedback } = req.body || {};

            const response = await AdminConversations.setConversationFeedback(id, feedback);

            return res.status(response.success ? 200 : 400).json(response);

        } catch (error) {
            console.error('❌ Controller - error al guardar feedback:', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setMessageFeedback = async (req, res) => {
        try {
            const { id, messageId } = req.params;
            const { feedback } = req.body || {};

            const response = await AdminConversations.setMessageFeedback(id, messageId, feedback);

            return res.status(response.success ? 200 : 400).json(response);

        } catch (error) {
            console.error('❌ Controller - error al guardar feedback del mensaje:', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };

    setConversationGoodAnswer = async (req, res) => {
        try {
            const { id } = req.params;
            const { isGood } = req.body || {};

            const response = await AdminConversations.setConversationGoodAnswer(id, isGood);

            return res.status(response.success ? 200 : 400).json(response);

        } catch (error) {
            console.error('❌ Controller - error al guardar bien respondido:', error);

            return res.status(500).json({
                success: false,
                message: error.message || 'Error inesperado en el servidor',
            });
        }
    };
}
