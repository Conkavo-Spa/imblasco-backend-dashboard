// models/Conversation.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

/**
 * Subdocumento: Persona / Identidad
 */
const PersonSchema = new Schema(
    {
        name: { type: String, trim: true, default: null },
        email: { type: String, trim: true, lowercase: true, default: null }
    },
    { _id: false }
);

/**
 * Subdocumento: Contenido del mensaje
 */
const MessageContentSchema = new Schema(
    {
        text: { type: String, trim: false, default: "" },
        html: { type: String, trim: false, default: null } // solo si viene (emails)
    },
    { _id: false }
);

/**
 * Subdocumento: Mensaje (embebido)
 */
const EmbeddedMessageSchema = new Schema(
    {
        // ID interno del mensaje dentro del hilo (string para ser liviano)
        id: { type: String, required: true },

        channel: { type: String, required: true, enum: ["email", "chat"] },
        provider: {
            type: String,
            required: true,
            enum: ["gmail", "webchat", "whatsapp", "instagram", "other"]
        },

        // IDs externos (opcional según provider)
        externalMessageId: { type: String, default: null },

        direction: { type: String, required: true, enum: ["inbound", "outbound"] },

        from: { type: PersonSchema, required: true },
        to: { type: [PersonSchema], default: [] }, // emails: destinatarios; chat: puede ir vacío

        content: { type: MessageContentSchema, required: true },

        meta: {
            isRead: { type: Boolean, default: false }
        },

        sentAt: { type: Date, required: true },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: false } // importante: no generar _id por cada mensaje (reduce tamaño)
);

/**
 * Documento principal: Conversation (hilo + mensajes)
 */
const ConversationSchema = new Schema(
    {
        channel: { type: String, required: true, enum: ["email", "chat"] },
        provider: {
            type: String,
            required: true,
            enum: ["gmail", "webchat", "whatsapp", "instagram", "other"]
        },

        external: {
            // ID del hilo externo (Gmail threadId / chat sessionId / roomId)
            threadId: { type: String, required: true, index: true },
            // Para email: mailbox que recibe (útil si tienes varias casillas)
            mailbox: { type: String, trim: true, lowercase: true, default: null }
        },

        participants: {
            customer: { type: PersonSchema, default: {} },
            agent: { type: PersonSchema, default: {} }
        },

        subject: { type: String, trim: true, default: null },

        status: {
            state: { type: String, enum: ["open", "closed"], default: "open" },
            stage: {
                type: String,
                enum: ["awaiting_agent", "awaiting_customer", "resolved"],
                default: "awaiting_agent"
            },
            priority: {
                type: String,
                enum: ["low", "normal", "high", "urgent"],
                default: "normal"
            }
        },

        // Resumen para tabla/inbox (NO recorrer messages en cada listado)
        summary: {
            lastMessagePreview: { type: String, trim: true, default: "" },
            lastMessageAt: { type: Date, default: null, index: true },
            messageCount: { type: Number, default: 0 },
            unreadCount: { type: Number, default: 0 }
        },

        tags: { type: [String], default: [] },

        // Mensajes embebidos (conversación completa)
        messages: { type: [EmbeddedMessageSchema], default: [] },

        // Límites “contrato” para evitar que crezca infinito
        limits: {
            maxMessages: { type: Number, default: 50 }
        }
    },
    {
        timestamps: true, // createdAt / updatedAt automáticos
        collection: "conversations"
    }
);

/**
 * Índice único: evita duplicar hilos (por provider + mailbox + threadId)
 * Si no usas mailbox, igual funciona (null forma parte del índice; si te complica,
 * puedes omitir mailbox o setearlo siempre).
 */
ConversationSchema.index(
    { provider: 1, "external.mailbox": 1, "external.threadId": 1 },
    { unique: true }
);

/**
 * Reglas recomendadas (sin lógica pesada)
 * - mantener summary.messageCount alineado
 * - mantener summary.lastMessageAt/Preview alineado
 */
ConversationSchema.methods.rebuildSummary = function () {
    const msgCount = this.messages.length;
    const last = msgCount ? this.messages[msgCount - 1] : null;

    this.summary.messageCount = msgCount;
    this.summary.lastMessageAt = last ? last.sentAt : null;
    this.summary.lastMessagePreview = last?.content?.text
        ? last.content.text.slice(0, 140)
        : "";

    this.summary.unreadCount = this.messages.reduce(
        (acc, m) => acc + (m.direction === "inbound" && !m.meta?.isRead ? 1 : 0),
        0
    );

    return this;
};

module.exports = mongoose.model("Conversation", ConversationSchema);
