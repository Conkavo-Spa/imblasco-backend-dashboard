/**
 * Cabeceras de hilo alineadas a Programa 8 (In-Reply-To / References).
 */

/** Formato RFC 5322: Gmail/Yahoo agrupan mal si falta <>. */
export function normalizarMessageIdRfc(msgId) {
    if (msgId == null || msgId === '') return null;
    const t = String(msgId).trim();
    if (!t) return null;
    if (t.startsWith('<') && t.endsWith('>')) return t;
    return `<${t}>`;
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} emailsRawCollection
 * @param {object} rawEmail - correo al que se responde (entrante)
 */
export async function construirCabecerasHiloRespuesta(db, emailsRawCollection, rawEmail) {
    const inReplyDirect = normalizarMessageIdRfc(rawEmail?.message_id);
    const tid = rawEmail?.thread_id ? String(rawEmail.thread_id).trim() : '';

    if (!tid) {
        return {
            inReplyTo: inReplyDirect || undefined,
            references: inReplyDirect || undefined,
        };
    }

    const enHilo = await db
        .collection(emailsRawCollection)
        .find({
            thread_id: tid,
            $expr: { $not: { $regexMatch: { input: '$email_id', regex: '^sys_' } } },
        })
        .sort({ date: 1, created_at: 1, _id: 1 })
        .toArray();

    const seen = new Set();
    const cadena = [];
    for (const doc of enHilo) {
        const mid = normalizarMessageIdRfc(doc.message_id);
        if (!mid || seen.has(mid)) continue;
        seen.add(mid);
        cadena.push(mid);
    }

    if (inReplyDirect && !seen.has(inReplyDirect)) {
        seen.add(inReplyDirect);
        cadena.push(inReplyDirect);
    }

    let inReplyTo = inReplyDirect;
    if (!inReplyTo && cadena.length > 0) {
        inReplyTo = cadena[cadena.length - 1];
    }

    const references = cadena.length > 0 ? cadena.join(' ') : inReplyTo || undefined;

    return {
        inReplyTo: inReplyTo || undefined,
        references: references || undefined,
    };
}

export function extractEmail(str) {
    if (!str) return null;
    const m = String(str).match(/<([^>]+)>/);
    if (m) return m[1].trim();
    return String(str).trim();
}
