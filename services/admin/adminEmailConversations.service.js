import ConversationMailDash from '../../models/ConversationMailDash.js';
import { getNativeMongoDb } from '../../libs/mongoNativeDb.js';
import { upsertCotizacionBlasPendienteDesdeEmailsRaw } from '../../libs/cotABlas.js';
import { enviarCotizacionDesdeDashboard } from '../../libs/enviarCotizacionDesdeDashboard.js';

const EMAILS_RAW_COLLECTION = 'emails_raw';

export default class AdminEmailConversationsService {
    getAllEmailConversations = async (options = {}) => {
        try {
            const { page = 1, limit = 10 } = options;

            const result = await ConversationMailDash.paginate(
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

    deleteEmailConversation = async (conversationId) => {
        try {
            const deleted = await ConversationMailDash.findByIdAndDelete(conversationId);
            if (!deleted) {
                return { success: false, message: 'Conversación no encontrada' };
            }
            return { success: true, message: 'Conversación eliminada correctamente' };
        } catch (error) {
            console.error('❌ Servicio - error al eliminar email:', error);
            throw new Error('No se pudo eliminar la conversación');
        }
    };

    setEmailConversationGoodAnswer = async (conversationId, isGood) => {
        try {
            const val = isGood === true;
            const updated = await ConversationMailDash.findByIdAndUpdate(
                conversationId,
                { $set: { 'summary.hasGoodAnswer': val, isGoodAnswer: val } },
                { new: true }
            );
            if (!updated) {
                return { success: false, message: 'Conversación no encontrada' };
            }
            return {
                success: true,
                message: 'Actualizado',
                data: { _id: updated._id, isGoodAnswer: val },
            };
        } catch (error) {
            console.error('❌ Servicio - error al guardar bien respondido (email):', error);
            throw new Error('No se pudo guardar "Bien respondido"');
        }
    };

    setEmailConversationCorrected = async (conversationId, isCorrected) => {
        try {
            const val = isCorrected === true;
            const updated = await ConversationMailDash.findByIdAndUpdate(
                conversationId,
                { $set: { 'summary.isCorrected': val, isCorrected: val } },
                { new: true }
            );
            if (!updated) {
                return { success: false, message: 'Conversación no encontrada' };
            }
            return {
                success: true,
                message: 'Actualizado',
                data: { _id: updated._id, isCorrected: val },
            };
        } catch (error) {
            console.error('❌ Servicio - error al guardar corregido (email):', error);
            throw new Error('No se pudo guardar "Corregido"');
        }
    };

    /**
     * Registra cotización pendiente en cot_a_blas desde emails_raw (source: system).
     * @param {{ email_id?: string, thread_id?: string }} ids
     */
    responderCotABlas = async (ids = {}) => {
        const thread_id = ids.thread_id != null ? String(ids.thread_id).trim() : '';
        const email_id = ids.email_id != null ? String(ids.email_id).trim() : '';

        if (!thread_id && !email_id) {
            return {
                success: false,
                message: 'Se requiere thread_id y/o email_id',
            };
        }

        const db = getNativeMongoDb();
        const filter = { source: 'system' };
        if (thread_id) filter.thread_id = thread_id;
        else filter.email_id = email_id;

        const emailDoc = await db.collection(EMAILS_RAW_COLLECTION).findOne(filter);

        if (!emailDoc) {
            return {
                success: false,
                message: 'No se encontró emails_raw (source: system) para los identificadores indicados',
            };
        }

        try {
            const data = await upsertCotizacionBlasPendienteDesdeEmailsRaw(db, emailDoc);
            return {
                success: true,
                message: 'Cotización registrada como pendiente',
                data,
            };
        } catch (err) {
            if (err.code === 'COT_A_BLAS_DATOS_INCOMPLETOS' || err.code === 'COT_A_BLAS_SIN_CLAVE') {
                return {
                    success: false,
                    message: err.message || 'Datos insuficientes en emails_raw',
                };
            }
            throw err;
        }
    };

    /**
     * Envía cotización por SMTP (paridad Programa 8), parchea número en PDF y actualiza conversationmaildash.
     * @param {{ conversation_id: string, thread_id?: string, email_id?: string, mode?: 'test'|'prod', numero_cotizacion?: string }} body
     */
    enviarRespuestaCotizacionDashboard = async (body = {}) => {
        const conversation_id =
            body.conversation_id != null ? String(body.conversation_id).trim() : '';
        if (!conversation_id) {
            return { success: false, message: 'conversation_id es requerido' };
        }

        const conversation = await ConversationMailDash.findById(conversation_id);
        if (!conversation) {
            return { success: false, message: 'Conversación no encontrada' };
        }

        const db = getNativeMongoDb();
        const thread_id =
            body.thread_id != null && String(body.thread_id).trim()
                ? String(body.thread_id).trim()
                : String(conversation.external?.threadId || '').trim();
        const email_id = body.email_id != null ? String(body.email_id).trim() : '';
        const mode = body.mode === 'prod' || body.mode === 'test' ? body.mode : undefined;
        const numero_cotizacion =
            body.numero_cotizacion != null ? String(body.numero_cotizacion).trim() : undefined;

        try {
            return await enviarCotizacionDesdeDashboard({
                db,
                conversation,
                thread_id,
                email_id: email_id || undefined,
                mode,
                numero_cotizacion,
            });
        } catch (err) {
            console.error('❌ enviarRespuestaCotizacionDashboard:', err);
            if (err.code === 'MAIL_ENV_MISSING') {
                return { success: false, message: err.message, code: err.code };
            }
            throw err;
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

            const updated = await ConversationMailDash.findOneAndUpdate(
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

