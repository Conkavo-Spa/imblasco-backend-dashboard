import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const { Schema } = mongoose;

const conversationMailDashSchema = new Schema(
    {
        channel: { type: String, required: true, enum: ['email', 'chat'] },
        provider: {
            type: String,
            required: true,
            enum: ['gmail', 'webchat', 'whatsapp', 'instagram', 'other']
        },

        external: {
            threadId: { type: String, required: true, index: true },
            mailbox: { type: String, trim: true, lowercase: true, default: null }
        },

        participants: {
            customer: {
                name: { type: String, trim: true, default: null },
                email: { type: String, trim: true, lowercase: true, default: null }
            },
            agent: {
                name: { type: String, trim: true, default: null },
                email: { type: String, trim: true, lowercase: true, default: null }
            }
        },

        subject: { type: String, trim: true, default: null },

        // Campos nuevos para el dashboard
        clasificacion: { type: String, trim: true, default: null },
        accion: { type: String, trim: true, default: null },
        estado: { type: String, trim: true, default: null },

        status: {
            state: { type: String, enum: ['open', 'closed'], default: 'open' },
            stage: {
                type: String,
                enum: ['awaiting_agent', 'awaiting_customer', 'resolved'],
                default: 'awaiting_agent'
            },
            priority: {
                type: String,
                enum: ['low', 'normal', 'high', 'urgent'],
                default: 'normal'
            }
        },

        summary: {
            lastMessagePreview: { type: String, trim: true, default: '' },
            lastMessageAt: { type: Date, default: null, index: true },
            messageCount: { type: Number, default: 0 },
            unreadCount: { type: Number, default: 0 },
            hasGoodAnswer: { type: Boolean, default: false },
            isCorrected: { type: Boolean, default: false },
        },

        isGoodAnswer: { type: Boolean, default: false },
        isCorrected: { type: Boolean, default: false },

        tags: { type: [String], default: [] },

        messages: {
            type: [
                {
                    id: { type: String, required: true },
                    channel: { type: String, required: true, enum: ['email', 'chat'] },
                    provider: {
                        type: String,
                        required: true,
                        enum: ['gmail', 'webchat', 'whatsapp', 'instagram', 'other']
                    },
                    externalMessageId: { type: String, default: null },
                    direction: { type: String, required: true, enum: ['inbound', 'outbound'] },
                    from: {
                        name: { type: String, trim: true, default: null },
                        email: { type: String, trim: true, lowercase: true, default: null }
                    },
                    to: {
                        type: [
                            {
                                name: { type: String, trim: true, default: null },
                                email: { type: String, trim: true, lowercase: true, default: null }
                            }
                        ],
                        default: []
                    },
                    content: {
                        text: { type: String, trim: false, default: '' },
                        html: { type: String, trim: false, default: null }
                    },
                    meta: {
                        isRead: { type: Boolean, default: false }
                    },
                    feedback: { type: String, trim: false, default: '' },
                    /** PDF en base64 (p. ej. cotización enviada), opcional */
                    pdf_base64: { type: String, trim: false, default: null },
                    sentAt: { type: Date, required: true },
                    createdAt: { type: Date, default: Date.now }
                }
            ],
            default: []
        },

        limits: {
            maxMessages: { type: Number, default: 50 }
        }
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
        collection: 'conversationmaildash'
    }
);

// Índice único: evita duplicar hilos
conversationMailDashSchema.index(
    { provider: 1, 'external.mailbox': 1, 'external.threadId': 1 },
    { unique: true }
);

// Método helper: reconstruir summary
conversationMailDashSchema.methods.rebuildSummary = function () {
    const msgCount = this.messages.length;
    const last = msgCount ? this.messages[msgCount - 1] : null;

    this.summary.messageCount = msgCount;
    this.summary.lastMessageAt = last ? last.sentAt : null;
    this.summary.lastMessagePreview = last?.content?.text
        ? last.content.text.slice(0, 140)
        : '';

    this.summary.unreadCount = this.messages.reduce(
        (acc, m) => acc + (m.direction === 'inbound' && !m.meta?.isRead ? 1 : 0),
        0
    );

    return this;
};

conversationMailDashSchema.plugin(mongoosePaginate);

const ConversationMailDash = mongoose.model('ConversationMailDash', conversationMailDashSchema);

export default ConversationMailDash;
export { conversationMailDashSchema };

