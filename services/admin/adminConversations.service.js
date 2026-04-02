import Conversations from '../../models/Conversations.js';
import ChatThreads from '../../models/ChatThreads.js';

function getModelForChannel(channel) {
    return channel === 'chat' ? ChatThreads : Conversations;
}

export default class AdminConversationsService {
    getAllConversations = async (options = {}) => {
        try {
            const { page = 1, limit = 10, channel = 'email' } = options;

            const filter = { channel };
            const Model = getModelForChannel(channel);

            const result = await Model.paginate(filter, {
                page,
                limit,
                sort: { 'summary.lastMessageAt': -1, createdAt: -1 },
            });

            return {
                success: true,
                message: 'Conversaciones obtenidas correctamente',
                data: result,
            };

        } catch (error) {
            console.error('❌ Servicio - error al obtener conversaciones:', error);
            throw new Error('No se pudieron obtener las conversaciones');
        }
    };

    setConversationFeedback = async (conversationId, feedback) => {
        try {
            const text = String(feedback ?? '').trim();
            if (!text) {
                return {
                    success: false,
                    message: 'El feedback es requerido',
                };
            }

            let updated = await ChatThreads.findByIdAndUpdate(
                conversationId,
                { $set: { feedback: text } },
                { new: true, runValidators: true }
            );
            if (!updated) {
                updated = await Conversations.findByIdAndUpdate(
                    conversationId,
                    { $set: { feedback: text } },
                    { new: true, runValidators: true }
                );
            }

            if (!updated) {
                return {
                    success: false,
                    message: 'Conversación no encontrada',
                };
            }

            return {
                success: true,
                message: 'Feedback guardado correctamente',
                data: { _id: updated._id, feedback: updated.feedback },
            };

        } catch (error) {
            console.error('❌ Servicio - error al guardar feedback:', error);
            throw new Error('No se pudo guardar el feedback');
        }
    };

    setMessageFeedback = async (conversationId, messageId, feedback) => {
        try {
            const text = String(feedback ?? '').trim();
            if (!text) {
                return {
                    success: false,
                    message: 'El feedback es requerido',
                };
            }

            let result = await ChatThreads.findOneAndUpdate(
                { _id: conversationId, 'messages._id': messageId },
                { $set: { 'messages.$.feedback': text, 'summary.hasFeedback': true, 'summary.lastFeedbackText': text } },
                { new: true }
            );
            if (!result) {
                result = await Conversations.findOneAndUpdate(
                    { _id: conversationId, 'messages._id': messageId },
                    { $set: { 'messages.$.feedback': text, 'summary.hasFeedback': true, 'summary.lastFeedbackText': text } },
                    { new: true }
                );
            }

            if (!result) {
                return {
                    success: false,
                    message: 'Conversación o mensaje no encontrado',
                };
            }

            const msg = result.messages?.find((m) => String(m._id) === String(messageId));

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
            console.error('❌ Servicio - error al guardar feedback del mensaje:', error);
            throw new Error('No se pudo guardar el feedback del mensaje');
        }
    };

    setConversationGoodAnswer = async (conversationId, isGood) => {
        try {
            const val = isGood === true;

            let updated = await ChatThreads.findByIdAndUpdate(
                conversationId,
                { $set: { isGoodAnswer: val, 'summary.hasGoodAnswer': val } },
                { new: true, runValidators: true }
            );
            if (!updated) {
                updated = await Conversations.findByIdAndUpdate(
                    conversationId,
                    { $set: { isGoodAnswer: val, 'summary.hasGoodAnswer': val } },
                    { new: true, runValidators: true }
                );
            }

            if (!updated) {
                return {
                    success: false,
                    message: 'Conversación no encontrada',
                };
            }

            return {
                success: true,
                message: 'Actualizado',
                data: { _id: updated._id, isGoodAnswer: val },
            };

        } catch (error) {
            console.error('❌ Servicio - error al guardar bien respondido:', error);
            throw new Error('No se pudo guardar "Bien respondido"');
        }
    };

    deleteConversation = async (conversationId) => {
        try {
            // Intentar borrar en chatthreads (db stockf) y si no, en conversationdash
            let deleted = await ChatThreads.findByIdAndDelete(conversationId);
            if (!deleted) {
                deleted = await Conversations.findByIdAndDelete(conversationId);
            }

            if (!deleted) {
                return {
                    success: false,
                    message: 'Conversación no encontrada',
                };
            }

            return {
                success: true,
                message: 'Conversación eliminada',
                data: { _id: deleted._id },
            };
        } catch (error) {
            console.error('❌ Servicio - error al borrar conversación:', error);
            throw new Error('No se pudo borrar la conversación');
        }
    };

    setConversationCorrected = async (conversationId, isCorrected) => {
        try {
            const val = isCorrected === true;
            let updated = await ChatThreads.findByIdAndUpdate(
                conversationId,
                { $set: { 'summary.isCorrected': val, isCorrected: val } },
                { new: true }
            );
            if (!updated) {
                updated = await Conversations.findByIdAndUpdate(
                    conversationId,
                    { $set: { 'summary.isCorrected': val, isCorrected: val } },
                    { new: true }
                );
            }
            if (!updated) {
                return { success: false, message: 'Conversación no encontrada' };
            }
            return { success: true, message: 'Actualizado', data: { _id: updated._id, isCorrected: val } };
        } catch (error) {
            console.error('❌ Servicio - error al guardar corregida:', error);
            throw new Error('No se pudo guardar "Corregida"');
        }
    };

    exportConversations = async (options = {}) => {
        try {
            const { from, to, channel = 'chat' } = options;
            const Model = getModelForChannel(channel);
            const filter = { channel };
            if (from || to) {
                filter.createdAt = {};
                if (from) filter.createdAt.$gte = new Date(from);
                if (to) {
                    const toDate = new Date(to);
                    toDate.setHours(23, 59, 59, 999);
                    filter.createdAt.$lte = toDate;
                }
            }
            const docs = await Model.find(filter).sort({ createdAt: -1 }).lean();
            return { success: true, data: docs };
        } catch (error) {
            console.error('❌ Servicio - error al exportar conversaciones:', error);
            throw new Error('No se pudieron exportar las conversaciones');
        }
    };
}
