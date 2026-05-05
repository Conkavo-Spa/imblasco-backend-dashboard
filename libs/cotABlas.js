/**
 * Persistencia cot_a_blas (MongoDB). Clave única: cotizacion_clave.
 */

const COLLECTION = 'cot_a_blas';

function isNonEmptyPlainObject(value) {
    return (
        value != null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0
    );
}

/**
 * @param {object} emailDoc - documento emails_raw
 * @returns {boolean}
 */
export function tieneDatosCotizacionMinimos(emailDoc) {
    if (!emailDoc || typeof emailDoc !== 'object') return false;
    if (isNonEmptyPlainObject(emailDoc.cabecera_cotizacion)) return true;
    if (Array.isArray(emailDoc.lineas_producto) && emailDoc.lineas_producto.length > 0) return true;
    if (isNonEmptyPlainObject(emailDoc.totales_cotizacion_pdf)) return true;
    return false;
}

/**
 * thread_id si viene y no está vacío; si no, email_id.
 * @param {object} emailDoc
 * @returns {string}
 */
export function buildCotizacionClave(emailDoc) {
    const tid = emailDoc?.thread_id;
    if (tid != null && String(tid).trim() !== '') return String(tid).trim();
    const eid = emailDoc?.email_id;
    if (eid != null && String(eid).trim() !== '') return String(eid).trim();
    const err = new Error('No se puede determinar cotizacion_clave: faltan thread_id y email_id en emails_raw');
    err.code = 'COT_A_BLAS_SIN_CLAVE';
    throw err;
}

/**
 * @param {import('mongodb').Db} db
 */
export async function ensureIndexesCotABlas(db) {
    await db.collection(COLLECTION).createIndex({ cotizacion_clave: 1 }, { unique: true, name: 'cotizacion_clave_unique' });
}

/**
 * Upsert pendiente desde emails_raw (source system ya validado por el caller).
 * @param {import('mongodb').Db} db
 * @param {object} emailDoc
 */
export async function upsertCotizacionBlasPendienteDesdeEmailsRaw(db, emailDoc) {
    if (!tieneDatosCotizacionMinimos(emailDoc)) {
        const err = new Error(
            'Faltan datos de cotización en emails_raw: se requiere al menos uno de cabecera_cotizacion, lineas_producto o totales_cotizacion_pdf'
        );
        err.code = 'COT_A_BLAS_DATOS_INCOMPLETOS';
        throw err;
    }

    const cotizacion_clave = buildCotizacionClave(emailDoc);
    const now = new Date();
    const col = db.collection(COLLECTION);

    const emails_raw_id = emailDoc._id;

    const setDoc = {
        cotizacion_clave,
        estado: 'pendiente',
        emails_raw_id,
        email_id: emailDoc.email_id ?? null,
        thread_id: emailDoc.thread_id ?? null,
        source: emailDoc.source ?? null,
        cabecera_cotizacion: emailDoc.cabecera_cotizacion ?? null,
        lineas_producto: emailDoc.lineas_producto ?? null,
        totales_cotizacion_pdf: emailDoc.totales_cotizacion_pdf ?? null,
        updated_at: now,
    };

    const r = await col.updateOne(
        { cotizacion_clave },
        {
            $set: setDoc,
            $setOnInsert: { created_at: now },
        },
        { upsert: true }
    );

    return {
        cotizacion_clave,
        upserted: Boolean(r.upsertedCount),
        modified: r.modifiedCount > 0,
        matched: r.matchedCount > 0,
    };
}

/**
 * Actualización posterior por agente Blas.
 * @param {import('mongodb').Db} db
 * @param {string} cotizacion_clave
 * @param {{ estado: string, numero_cotizacion_blas?: string, mensaje?: string, error?: string }} payload
 */
export async function actualizarRespuestaAgenteCotABlas(db, cotizacion_clave, payload) {
    const key = String(cotizacion_clave ?? '').trim();
    if (!key) {
        const err = new Error('cotizacion_clave es requerida');
        err.code = 'COT_A_BLAS_CLAVE_VACIA';
        throw err;
    }
    const estado = payload?.estado;
    if (estado == null || String(estado).trim() === '') {
        const err = new Error('estado es requerido');
        err.code = 'COT_A_BLAS_ESTADO_VACIO';
        throw err;
    }

    const set = {
        estado: String(estado).trim(),
        updated_at: new Date(),
    };
    if (payload.numero_cotizacion_blas != null) set.numero_cotizacion_blas = payload.numero_cotizacion_blas;
    if (payload.mensaje != null) set.mensaje_agente = payload.mensaje;
    if (payload.error != null) set.error_agente = payload.error;

    const r = await db.collection(COLLECTION).updateOne({ cotizacion_clave: key }, { $set: set });
    return { matched: r.matchedCount > 0, modified: r.modifiedCount > 0 };
}

export { COLLECTION as COT_A_BLAS_COLLECTION };
