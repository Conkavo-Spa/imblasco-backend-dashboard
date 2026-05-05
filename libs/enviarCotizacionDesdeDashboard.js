import { createRequire } from 'module';
import { createTransport } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { patchPdfBase64WithNumero } from './pdfPatchNumeroCotizacion.js';
import {
    normalizarMessageIdRfc,
    construirCabecerasHiloRespuesta,
    extractEmail,
} from './emailThreadingP8.js';

const require = createRequire(import.meta.url);
const MailComposer = require('nodemailer/lib/mail-composer/index.js');

const COL_EMAILS_RAW = 'emails_raw';
const COL_EMAIL_EVENTS = 'email_events';
const COL_THREADS = 'threads';
const COL_INPUTS = 'cotizacion_inputs';
const COL_COTIZACIONES = 'cotizaciones';
const COL_COT_A_BLAS = 'cot_a_blas';

function envBool(v, def) {
    if (v === undefined || v === null || v === '') return def;
    const s = String(v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

/**
 * Normaliza RUT chileno para nombre de archivo (misma idea que Programa 8).
 */
export function normalizarRutParaNombreArchivo(rut) {
    if (!rut || typeof rut !== 'string') return null;
    const s0 = String(rut).trim();
    if (!s0) return null;
    let s = s0.replace(/\./g, '').replace(/\s+/g, '');
    if (s.includes('-')) {
        const parteNumero = s.split('-')[0];
        const soloNumeros = parteNumero.replace(/\D/g, '');
        return soloNumeros || null;
    }
    const soloNumeros = s.replace(/\D/g, '');
    if (!soloNumeros) return null;
    if (soloNumeros.length === 9 && /^\d+$/.test(soloNumeros)) {
        return soloNumeros.slice(0, -1);
    }
    return soloNumeros;
}

function cotizacionSnapshotParaEmailRaw(cot) {
    if (!cot || typeof cot !== 'object') return null;
    const snap = { ...cot };
    delete snap.pdf_base64;
    return snap;
}

function htmlToPlain(html) {
    if (!html) return '';
    return String(html)
        .replace(/>\s+</g, '><')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<tr[^>]*>/gi, '\n')
        .replace(/<\/t[dh]>/gi, '\t')
        .replace(/<t[dh][^>]*>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\t+/g, '\t')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
}

async function construirMimeRaw(mailOptions) {
    const composer = new MailComposer({
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        inReplyTo: mailOptions.inReplyTo,
        references: mailOptions.references,
        attachments: Array.isArray(mailOptions.attachments) ? mailOptions.attachments : undefined,
        messageId: mailOptions.messageId,
        date: new Date(),
    });
    return composer.compile().build();
}

async function guardarCopiaEnEnviados(rawMime) {
    if (!rawMime || rawMime.length === 0) {
        throw new Error('MIME vacío');
    }
    const IMAP_SENT_MAILBOX = process.env.IMAP_SENT_MAILBOX || 'Sent';
    const client = new ImapFlow({
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: Number(process.env.IMAP_PORT || 993),
        secure: envBool(process.env.IMAP_SECURE, true),
        auth: {
            user: process.env.IMAP_USER || process.env.MAIL_USER || '',
            pass: process.env.IMAP_PASS || process.env.MAIL_APP_PASSWORD || '',
        },
        logger: false,
    });
    await client.connect();
    try {
        await client.append(IMAP_SENT_MAILBOX, rawMime, ['\\Seen']);
    } finally {
        await client.logout().catch(() => {});
    }
}

async function findSystemEmailRaw(db, { thread_id, email_id }) {
    const filter = { source: 'system' };
    if (email_id && String(email_id).trim()) {
        filter.email_id = String(email_id).trim();
    } else if (thread_id && String(thread_id).trim()) {
        filter.thread_id = String(thread_id).trim();
    } else {
        return null;
    }
    let doc = await db.collection(COL_EMAILS_RAW).findOne(filter);
    if (!doc && thread_id && !email_id) {
        doc = await db
            .collection(COL_EMAILS_RAW)
            .find({ source: 'system', thread_id: String(thread_id).trim() })
            .sort({ date: -1, ingested_at: -1, _id: -1 })
            .limit(1)
            .next();
    }
    if (!doc && thread_id && email_id) {
        doc = await db
            .collection(COL_EMAILS_RAW)
            .find({ source: 'system', thread_id: String(thread_id).trim() })
            .sort({ date: -1, ingested_at: -1, _id: -1 })
            .limit(1)
            .next();
    }
    return doc;
}

async function findUltimoInboundNoSystem(db, threadId) {
    const tid = String(threadId || '').trim();
    if (!tid) return null;
    const docs = await db
        .collection(COL_EMAILS_RAW)
        .find({ thread_id: tid })
        .sort({ date: 1, created_at: 1, _id: 1 })
        .toArray();
    const filtered = docs.filter(
        (d) => d && d.source !== 'system' && !String(d.email_id || '').startsWith('sys_')
    );
    return filtered.length ? filtered[filtered.length - 1] : null;
}

/** Preferir el entrante al que apunta in_reply_to del borrador system (paridad con Programa 8). */
async function resolveInboundRaw(db, threadId, systemDoc) {
    const tid = String(threadId || '').trim();
    if (!tid) return null;
    const replyTo = systemDoc?.in_reply_to;
    if (replyTo) {
        const target = normalizarMessageIdRfc(replyTo);
        const docs = await db.collection(COL_EMAILS_RAW).find({ thread_id: tid }).toArray();
        const match = docs.find(
            (d) =>
                d &&
                d.source !== 'system' &&
                !String(d.email_id || '').startsWith('sys_') &&
                normalizarMessageIdRfc(d.message_id) === target
        );
        if (match) return match;
    }
    return findUltimoInboundNoSystem(db, tid);
}

function totalesCotizacionPdfParaEmailRawFromSystem(systemDoc) {
    if (systemDoc?.totales_cotizacion_pdf && typeof systemDoc.totales_cotizacion_pdf === 'object') {
        return systemDoc.totales_cotizacion_pdf;
    }
    const cot = systemDoc?.cotizacion_snapshot;
    if (!cot?.totales) return null;
    const t = cot.totales;
    return {
        subtotal: t.subtotal ?? 0,
        dcto_porcentaje: 0,
        monto_descuento: 0,
        total_neto: t.subtotal ?? 0,
        iva: t.iva ?? 0,
        total_bruto: t.total_final ?? 0,
        porcentaje_iva_aplicado: 19,
    };
}

/**
 * Envío de cotización desde el dashboard (paridad con Programa 8 + escritura en conversationmaildash).
 *
 * @param {object} params
 * @param {import('mongodb').Db} params.db
 * @param {import('mongoose').Document} params.conversation - ConversationMailDash (documento Mongoose)
 * @param {string} [params.thread_id]
 * @param {string} [params.email_id] - email_id del emails_raw system
 * @param {'test'|'prod'} [params.mode] - test: no inserta RESPUESTA_ENVIADA (pipeline); inserta RESPUESTA_ENVIADA_DASH_TEST
 * @param {string} [params.numero_cotizacion]
 */
export async function enviarCotizacionDesdeDashboard(params) {
    const { db, conversation } = params;
    const thread_id =
        (params.thread_id != null && String(params.thread_id).trim()) ||
        String(conversation?.external?.threadId || '').trim();
    const email_id_param = params.email_id != null ? String(params.email_id).trim() : '';

    const mode =
        params.mode === 'prod'
            ? 'prod'
            : params.mode === 'test'
              ? 'test'
              : String(process.env.DASH_EMAIL_SEND_MODE || 'test').toLowerCase() === 'prod'
                ? 'prod'
                : 'test';

    if (!process.env.MAIL_USER || !process.env.MAIL_APP_PASSWORD) {
        const err = new Error('Faltan MAIL_USER o MAIL_APP_PASSWORD en el entorno del dashboard');
        err.code = 'MAIL_ENV_MISSING';
        throw err;
    }

    if (!thread_id) {
        return { success: false, message: 'Falta thread_id en la conversación', code: 'NO_THREAD' };
    }

    const systemDoc = await findSystemEmailRaw(db, {
        thread_id,
        email_id: email_id_param || undefined,
    });

    if (!systemDoc) {
        return {
            success: false,
            message: 'No se encontró emails_raw (source: system) para este hilo',
            code: 'NO_SYSTEM_EMAIL',
        };
    }

    const inbound = await resolveInboundRaw(db, thread_id, systemDoc);
    if (!inbound) {
        return {
            success: false,
            message: 'No hay correo entrante en el hilo para construir In-Reply-To',
            code: 'NO_INBOUND',
        };
    }

    if (mode === 'prod') {
        const exist = await db.collection(COL_EMAIL_EVENTS).findOne({
            email_id: inbound.email_id,
            tipo: 'RESPUESTA_ENVIADA',
        });
        if (exist) {
            return {
                success: false,
                message: 'Ya existe RESPUESTA_ENVIADA para este correo (pipeline). Evite duplicar envío.',
                code: 'ALREADY_SENT',
            };
        }
    }

    let numero =
        params.numero_cotizacion != null && String(params.numero_cotizacion).trim()
            ? String(params.numero_cotizacion).trim()
            : null;
    if (!numero) {
        const blas = await db.collection(COL_COT_A_BLAS).findOne({ cotizacion_clave: thread_id });
        if (blas?.numero_cotizacion_blas != null && String(blas.numero_cotizacion_blas).trim()) {
            numero = String(blas.numero_cotizacion_blas).trim();
        }
    }
    if (!numero) {
        numero = String(process.env.DASH_COT_NUMERO_DEFAULT || '9999999').trim();
    }
    numero = numero.replace(/\D/g, '').slice(0, 7);
    if (!numero) {
        numero = '9999999';
    }

    const pdfPatch = systemDoc.pdf_patch || systemDoc.cotizacion_snapshot?.pdf_patch;
    const pdfBase64Orig = systemDoc.pdf_base64;
    if (!pdfBase64Orig) {
        return { success: false, message: 'El correo sistema no tiene pdf_base64', code: 'NO_PDF' };
    }

    let pdfBase64Patched;
    try {
        pdfBase64Patched = await patchPdfBase64WithNumero(pdfBase64Orig, pdfPatch, numero);
    } catch (e) {
        return {
            success: false,
            message: e.message || 'Error al parchear PDF',
            code: e.code || 'PDF_PATCH_ERROR',
        };
    }

    let html = String(systemDoc.body_html || '');
    if (html.includes('0000000')) {
        html = html.split('0000000').join(numero);
    }

    const subjectBase = systemDoc.subject || conversation.subject || 'Cotización';
    const subject = subjectBase.toLowerCase().startsWith('re:') ? subjectBase : `Re: ${subjectBase}`;

    const mailUser = String(process.env.MAIL_USER).trim();
    const fromHeader = `"${mailUser}" <${mailUser}>`;

    const emailDestino =
        conversation.participants?.customer?.email ||
        extractEmail(inbound.from) ||
        extractEmail(systemDoc.to?.[0]);

    if (!emailDestino) {
        return { success: false, message: 'No se pudo determinar email destino', code: 'NO_TO' };
    }

    const cabHilo = await construirCabecerasHiloRespuesta(db, COL_EMAILS_RAW, inbound);

    const cab = systemDoc.cabecera_cotizacion || {};
    const rutParaNombre =
        normalizarRutParaNombreArchivo(cab.rut) ||
        normalizarRutParaNombreArchivo(systemDoc.cotizacion_snapshot?.cabecera?.rut) ||
        'N/A';
    const cotId =
        systemDoc.cotizacion_snapshot?.cotizacion_id ||
        systemDoc.cotizacion_snapshot?.email_id ||
        systemDoc.email_id ||
        thread_id;

    const attachments = [
        {
            filename: `Cotizacion_${rutParaNombre}_${cotId}.pdf`,
            content: Buffer.from(pdfBase64Patched, 'base64'),
            contentType: 'application/pdf',
        },
    ];

    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    let smtpSecure = smtpPort === 465;
    if (process.env.SMTP_SECURE !== undefined && String(process.env.SMTP_SECURE).trim() !== '') {
        smtpSecure = envBool(process.env.SMTP_SECURE, smtpSecure);
    }

    const transporter = createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_APP_PASSWORD,
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 120000,
    });

    const mailOptions = {
        from: fromHeader,
        to: emailDestino,
        subject,
        html,
        attachments,
        inReplyTo: cabHilo.inReplyTo,
        references: cabHilo.references,
    };

    const info = await transporter.sendMail(mailOptions);
    const messageIdEnviado = info.messageId;
    const midRfc = normalizarMessageIdRfc(messageIdEnviado);
    const email_id_sys = `sys_${midRfc}`;

    try {
        const rawMime = await construirMimeRaw({
            ...mailOptions,
            messageId: messageIdEnviado,
        });
        await guardarCopiaEnEnviados(rawMime);
    } catch (e) {
        console.warn('[enviarCotizacionDesdeDashboard] IMAP Sent:', e.message);
    }

    const cuerpoTexto = htmlToPlain(html);
    const now = new Date();

    const lineasProducto = Array.isArray(systemDoc.lineas_producto) ? systemDoc.lineas_producto : [];

    await db.collection(COL_EMAILS_RAW).updateOne(
        { source: 'system', email_id: email_id_sys },
        {
            $setOnInsert: {
                source: 'system',
                email_id: email_id_sys,
                thread_id,
                message_id: messageIdEnviado,
                in_reply_to: inbound?.message_id || null,
                references: inbound?.message_id ? [inbound.message_id] : [],
                from: fromHeader,
                to: [emailDestino],
                subject,
                body: cuerpoTexto,
                body_html: html,
                pdf_base64: pdfBase64Patched,
                pdf_patch: pdfPatch || null,
                cotizacion_snapshot: cotizacionSnapshotParaEmailRaw(systemDoc.cotizacion_snapshot),
                date: now.toISOString(),
                schema_version: 'SYSTEM_EMAIL_1.0',
                ingested_at: now,
                dash_send_mode: mode,
                dash_origen: 'imblasco-backend-dashboard',
            },
            $set: {
                cabecera_cotizacion: systemDoc.cabecera_cotizacion || cab || null,
                lineas_producto: lineasProducto,
                totales_cotizacion_pdf: totalesCotizacionPdfParaEmailRawFromSystem(systemDoc),
            },
        },
        { upsert: true }
    );

    if (mode === 'prod') {
        await db.collection(COL_EMAIL_EVENTS).insertOne({
            email_id: inbound.email_id,
            thread_id,
            tipo: 'RESPUESTA_ENVIADA',
            created_at: now,
            dash_origen: true,
        });

        await db.collection(COL_THREADS).updateOne(
            { thread_id },
            { $set: { estado: 'RESUELTO', updated_at: now } },
            { upsert: false }
        );

        await db.collection(COL_INPUTS).updateMany(
            { $or: [{ thread_id }, { email_id: inbound.email_id }] },
            {
                $set: {
                    respondido: true,
                    fecha_envio: now,
                    en_proceso_envio: false,
                },
            }
        );

        await db.collection(COL_COTIZACIONES).updateMany(
            {
                $or: [
                    { thread_id },
                    { email_id: inbound.email_id },
                    { email_id: systemDoc.cotizacion_snapshot?.email_id },
                ],
            },
            { $set: { estado: 'ENVIADA', fecha_envio: now } }
        );
    } else {
        await db.collection(COL_EMAIL_EVENTS).insertOne({
            email_id: inbound.email_id,
            thread_id,
            tipo: 'RESPUESTA_ENVIADA_DASH_TEST',
            created_at: now,
            numero_cotizacion_aplicado: numero,
        });
    }

    const provider = conversation.provider || 'gmail';
    const mailbox = mailUser.toLowerCase();

    const newMessage = {
        id: email_id_sys,
        channel: 'email',
        provider,
        externalMessageId: messageIdEnviado,
        direction: 'outbound',
        from: { name: null, email: mailUser.toLowerCase() },
        to: [{ name: null, email: emailDestino.toLowerCase() }],
        content: {
            text: cuerpoTexto,
            html,
        },
        pdf_base64: pdfBase64Patched,
        meta: { isRead: true },
        sentAt: now,
    };

    conversation.messages = conversation.messages || [];
    const dup = conversation.messages.some((m) => m.id === email_id_sys);
    if (!dup) {
        conversation.messages.push(newMessage);
    }
    if (typeof conversation.rebuildSummary === 'function') {
        conversation.rebuildSummary();
    }
    await conversation.save();

    return {
        success: true,
        message:
            mode === 'test'
                ? 'Cotización enviada (modo test: sin RESPUESTA_ENVIADA para el pipeline)'
                : 'Cotización enviada',
        data: {
            mode,
            thread_id,
            email_id_sys,
            message_id: messageIdEnviado,
            numero_cotizacion: numero,
            message: newMessage,
        },
    };
}
