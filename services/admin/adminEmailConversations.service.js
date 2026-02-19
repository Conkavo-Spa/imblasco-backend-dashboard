import MailThreads from '../../models/MailThreads.js';

export default class AdminEmailConversationsService {
    getAllEmailConversations = async (options = {}) => {
        try {
            const { page = 1, limit = 10 } = options;

            const result = await MailThreads.paginate(
                { channel: 'email' },
                {
                    page,
                    limit,
                    sort: { 'summary.lastMessageAt': -1, createdAt: -1 },
                }
            );

            return {
                success: true,
                message: 'Emails obtenidos correctamente',
                data: result,
            };
        } catch (error) {
            console.error('❌ Servicio - error al obtener emails:', error);
            throw new Error('No se pudieron obtener los emails');
        }
    };

    setEmailMessageFeedback = async (conversationId, messageId, feedback) => {
        try {
            const text = String(feedback ?? '').trim();
            if (!text) {
                return {
                    success: false,
                    message: 'El feedback es requerido',
                };
            }

            const updated = await MailThreads.findOneAndUpdate(
                { _id: conversationId, 'messages._id': messageId },
                { $set: { 'messages.$.feedback': text } },
                { new: true }
            );

            if (!updated) {
                return {
                    success: false,
                    message: 'Conversación o mensaje no encontrado',
                };
            }

            const msg = updated.messages?.find((m) => String(m._id) === String(messageId));

            return {
                success: true,
                message: 'Feedback guardado correctamente',
                data: {
                    conversationId: String(conversationId),
                    messageId: String(messageId),
                    feedback: msg?.feedback ?? text,
                },
            };
        } catch (error) {
            console.error('❌ Servicio - error al guardar feedback (email):', error);
            throw new Error('No se pudo guardar el feedback');
        }
    };
}

