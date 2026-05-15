import dayjs from 'dayjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    CONCILIATION_CODES,
} from '../../constants/adminConciliation.constants.js';
import {
    getFintocConfigFromEnv,
    listMovementsInRange,
    listMovementsAllAccounts,
    filterMatchingDeposits,
} from '../../libs/fintocClient.js';
import Cotizacion from '../../models/Cotizacion.js';
import Factura from '../../models/Factura.js';
import Conciliacion from '../../models/Conciliacion.js';

function isValidYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = dayjs(s);
    return d.isValid() && d.format('YYYY-MM-DD') === s;
}

function institutionLabel(inst) {
    if (inst == null) return null;
    if (typeof inst === 'string' && inst.trim() !== '') return inst.trim();
    if (typeof inst === 'object') {
        const name = inst.name;
        const id = inst.id;
        if (name != null && String(name).trim() !== '') return String(name).trim();
        if (id != null && String(id).trim() !== '') return String(id).trim();
    }
    return null;
}

function mapTransferAccount(raw) {
    if (!raw) return null;
    return {
        holder_id: raw.holder_id ?? null,
        holder_name: raw.holder_name ?? null,
        number: raw.number ?? null,
        institution_name: institutionLabel(raw.institution),
    };
}

function mapFintocMovementToDto(m) {
    return {
        id: m.id,
        amount: m.amount,
        currency: m.currency,
        post_date: m.post_date,
        transaction_date: m.transaction_date ?? null,
        description: m.description ?? null,
        type: m.type ?? null,
        comment: m.comment ?? null,
        reference_id: m.reference_id ?? null,
        document_number: m.document_number ?? null,
        sender_account: mapTransferAccount(m.sender_account),
        recipient_account: mapTransferAccount(m.recipient_account),
        // Datos de la cuenta bancaria receptora (para filtro por banco en UI)
        bank_name: m.bank_name ?? null,
        account_id: m.account_id ?? null,
        account_number: m.account_number ?? null,
        account_holder: m.account_holder ?? null,
        account_name: m.account_name ?? null,
    };
}

function formatRutChile(rut, digcli) {
    if (!rut) return null;
    const rutStr = String(rut).padStart(8, '0');
    const formatted = `${rutStr.slice(0, 2)}.${rutStr.slice(2, 5)}.${rutStr.slice(5, 8)}`;
    return digcli ? `${formatted}-${digcli}` : formatted;
}

function mapCotizacionToDto(doc) {
    const digcli = doc.digcli ?? doc.cliente?.digcli;
    const rutcli = formatRutChile(doc.rutcli, digcli);
    return {
        cotizacion: doc.cotizacion,
        rutcli,
        razon_social: doc.cliente?.razon_social ?? null,
        fecha: doc.fecha ? dayjs(doc.fecha).format('YYYY-MM-DD') : null,
        monto: doc.totales?.totgen ?? null,
        totales: doc.totales ?? null,
    };
}

function mapFacturaToDto(doc, digcli = null) {
    const digcliVal = doc.cliente?.digcli ?? digcli;
    const rutcli = formatRutChile(doc.rutcli, digcliVal);
    return {
        factura: doc.factura,
        cotizacion_ref: doc.cotizacion ?? null,
        razon_social: doc.cliente?.razon_social ?? null,
        rutcli,
        fecha: doc.fecha ? dayjs(doc.fecha).format('YYYY-MM-DD') : null,
        monto: doc.totgen ?? null,
    };
}

export default class AdminConciliationService {

    /**
     * Guarda una conciliación en MongoDB.
     * POST /api/conciliations/conciliar
     * @param {object} params - { movement, cotizacion?, factura?, document_type: 'cotizacion'|'factura' }
     */
    saveConciliacion = async ({ movement, cotizacion, factura, document_type = 'cotizacion' }) => {
        if (!movement?.id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'movement.id es obligatorio',
            };
        }

        if (document_type === 'factura' && !factura?.id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'factura.id es obligatorio cuando document_type es "factura"',
            };
        }

        if (document_type === 'cotizacion' && !cotizacion?.id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'cotizacion.id es obligatorio cuando document_type es "cotizacion"',
            };
        }

        const existing = await Conciliacion.findOne({ movement_id: movement.id });
        if (existing) {
            return {
                success: false,
                code: CONCILIATION_CODES.ALREADY_CONCILIATED,
                message: `El movimiento ${movement.id} ya fue conciliado`,
            };
        }

        const docData = {
            movement_id: movement.id,
            document_type,
            monto: movement.amount,
            fecha_movimiento: movement.post_date ? String(movement.post_date).slice(0, 10) : null,
            bank_name: movement.bank_name ?? null,
            movement,
        };

        if (document_type === 'factura' && factura) {
            docData.factura_id = Number(factura.id);
            docData.cliente = factura.cliente ?? null;
            docData.rut = factura.rut ?? null;
            docData.factura = factura;
        } else if (document_type === 'cotizacion' && cotizacion) {
            docData.cotizacion_id = Number(cotizacion.id);
            docData.cliente = cotizacion.cliente ?? null;
            docData.rut = cotizacion.rut ?? null;
            docData.cotizacion = cotizacion;
        }

        const doc = await Conciliacion.create(docData);

        return { success: true, code: CONCILIATION_CODES.OK, data: doc };
    };

    /**
     * Elimina una conciliación por su _id de MongoDB.
     * DELETE /api/conciliations/:id
     */
    deleteConciliacion = async (id) => {
        if (!id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'Se requiere el id de la conciliación',
            };
        }
        const deleted = await Conciliacion.findByIdAndDelete(id);
        if (!deleted) {
            return {
                success: false,
                code: CONCILIATION_CODES.NOT_FOUND,
                message: `Conciliación ${id} no encontrada`,
            };
        }
        return { success: true, code: CONCILIATION_CODES.OK, data: { id } };
    };

    /**
     * Lista todas las conciliaciones guardadas.
     * GET /api/conciliations/historial
     */
    listConciliaciones = async ({ page = 1, limit = 200 } = {}) => {
        const skip = (Math.max(1, page) - 1) * limit;
        const [docs, total] = await Promise.all([
            Conciliacion.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Conciliacion.countDocuments(),
        ]);
        return {
            success: true,
            code: CONCILIATION_CODES.OK,
            data: { total, page: Number(page), limit: Number(limit), conciliaciones: docs },
        };
    };

    /**
     * Lista cotizaciones desde MongoDB con filtro opcional por rango de fecha.
     * GET /api/conciliations/cotizaciones?since=&until=&page=&limit=
     */
    listCotizaciones = async ({ since, until, page = 1, limit = 50 } = {}) => {
        const filter = {};

        if (since || until) {
            filter.fecha = {};
            if (since && isValidYmd(since)) {
                filter.fecha.$gte = dayjs(since).toDate();
            }
            if (until && isValidYmd(until)) {
                filter.fecha.$lte = dayjs(until).endOf('day').toDate();
            }
        }

        const skip = (Math.max(1, page) - 1) * limit;

        const [docs, total] = await Promise.all([
            Cotizacion.find(filter)
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Cotizacion.countDocuments(filter),
        ]);

        return {
            success: true,
            code: CONCILIATION_CODES.OK,
            data: {
                total,
                page: Number(page),
                limit: Number(limit),
                cotizaciones: docs.map(mapCotizacionToDto),
            },
        };
    };

    /**
     * Lista facturas desde MongoDB con filtro opcional por rango de fecha.
     * GET /api/conciliations/facturas?since=&until=&page=&limit=
     */
    listFacturas = async ({ since, until, page = 1, limit = 50 } = {}) => {
        const filter = {};

        if (since || until) {
            filter.fecha = {};
            if (since && isValidYmd(since)) {
                filter.fecha.$gte = dayjs(since).toDate();
            }
            if (until && isValidYmd(until)) {
                filter.fecha.$lte = dayjs(until).endOf('day').toDate();
            }
        }

        const skip = (Math.max(1, page) - 1) * limit;

        const [docs, total] = await Promise.all([
            Factura.find(filter)
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Factura.countDocuments(filter),
        ]);

        // Obtener digcli de las cotizaciones asociadas
        const cotizacionIds = [...new Set(docs.map(d => d.cotizacion).filter(Boolean))];
        const cotizacionesMap = new Map();
        if (cotizacionIds.length > 0) {
            const cotizaciones = await Cotizacion.find({ cotizacion: { $in: cotizacionIds } }).select('cotizacion digcli cliente.digcli').lean();
            cotizaciones.forEach(c => {
                const digcli = c.digcli ?? c.cliente?.digcli;
                cotizacionesMap.set(c.cotizacion, digcli);
            });
        }

        return {
            success: true,
            code: CONCILIATION_CODES.OK,
            data: {
                total,
                page: Number(page),
                limit: Number(limit),
                facturas: docs.map(f => mapFacturaToDto(f, cotizacionesMap.get(f.cotizacion))),
            },
        };
    };

    /**
     * Busca la cotización en MongoDB y con su fecha + monto total consulta Fintoc.
     * GET /api/conciliations/cotizaciones/:cotizacionId/payment-status
     */
    checkQuotePaymentStatus = async (cotizacionId) => {
        const idNum = Number(String(cotizacionId ?? '').trim());
        if (!idNum || isNaN(idNum)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'El id de cotización debe ser un número válido',
            };
        }

        const cotizacion = await Cotizacion.findOne({ cotizacion: idNum }).lean();
        if (!cotizacion) {
            return {
                success: false,
                code: CONCILIATION_CODES.NOT_FOUND,
                message: `Cotización ${idNum} no encontrada en la base de datos`,
            };
        }

        const fecha = cotizacion.fecha
            ? dayjs(cotizacion.fecha).format('YYYY-MM-DD')
            : null;

        if (!fecha || !isValidYmd(fecha)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: `La cotización ${idNum} no tiene fecha válida`,
            };
        }

        const monto = cotizacion.totales?.totgen;
        if (!Number.isInteger(monto) || monto <= 0) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: `La cotización ${idNum} no tiene monto total (totgen) válido`,
            };
        }

        const cfg = getFintocConfigFromEnv();
        if (!cfg) {
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_NOT_CONFIGURED,
                message: 'Fintoc no está configurado. Defina FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID.',
            };
        }

        const untilExclusive = dayjs(fecha).add(1, 'day').format('YYYY-MM-DD');

        let movements;
        try {
            movements = await listMovementsAllAccounts(cfg, fecha, untilExclusive);
        } catch (e) {
            console.error('❌ AdminConciliationService — error Fintoc:', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al consultar movimientos en Fintoc',
            };
        }

        const candidates = filterMatchingDeposits(movements, monto, fecha);
        const pagada = candidates.length > 0;
        const primary = pagada ? candidates[0] : null;

        return {
            success: true,
            code: pagada ? CONCILIATION_CODES.PAID : CONCILIATION_CODES.UNPAID,
            message: pagada
                ? 'Se encontró un movimiento que coincide con monto y fecha.'
                : 'No se encontró abono coincidente para esta cotización en la fecha indicada.',
            data: {
                cotizacion: mapCotizacionToDto(cotizacion),
                pagada,
                candidatos: candidates.length,
                movimiento: primary ? mapFintocMovementToDto(primary) : null,
            },
        };
    };

    /**
     * Abonos (amount > 0) en [since, until] fechas contables YYYY-MM-DD.
     */
    listInboundMovements = async (sinceYmd, untilInclusiveYmd) => {
        const since = typeof sinceYmd === 'string' ? sinceYmd.trim() : '';
        const untilIn = typeof untilInclusiveYmd === 'string' ? untilInclusiveYmd.trim() : '';
        if (!isValidYmd(since) || !isValidYmd(untilIn)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'since y until deben ser fechas YYYY-MM-DD válidas',
            };
        }
        if (dayjs(since).isAfter(dayjs(untilIn), 'day')) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'since no puede ser posterior a until',
            };
        }

        const cfg = getFintocConfigFromEnv();
        if (!cfg) {
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_NOT_CONFIGURED,
                message: 'Fintoc no está configurado. Defina FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID.',
            };
        }

        const untilExclusive = dayjs(untilIn).add(1, 'day').format('YYYY-MM-DD');

        let movements;
        try {
            movements = await listMovementsAllAccounts(cfg, since, untilExclusive);
        } catch (e) {
            console.error('❌ AdminConciliationService — error Fintoc (list):', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al consultar movimientos en Fintoc',
            };
        }

        // Cualquier abono (amount > 0) — transferencias, cheques, depósitos, etc.
        // Fintoc usa tipos variados por banco ('transfer', 'check', 'credit', 'other', etc.)
        const inbound = movements.filter((m) => {
            if (!(typeof m.amount === 'number' && m.amount > 0)) return false;
            return true;
        });

        const dtos = inbound.map((m) => mapFintocMovementToDto(m));
        dtos.sort((a, b) => {
            const da = String(a.post_date || '');
            const db = String(b.post_date || '');
            return db.localeCompare(da);
        });

        return {
            success: true,
            code: CONCILIATION_CODES.OK,
            data: { movements: dtos },
        };
    };

    /**
     * Lee movimientos desde el archivo JSON local (data/movimientos_fintoc.json)
     * GET /api/conciliations/movements-from-json?since=YYYY-MM-DD&until=YYYY-MM-DD
     */
    listMovementsFromJson = async (sinceYmd, untilInclusiveYmd) => {
        const since = typeof sinceYmd === 'string' ? sinceYmd.trim() : '';
        const untilIn = typeof untilInclusiveYmd === 'string' ? untilInclusiveYmd.trim() : '';
        if (!isValidYmd(since) || !isValidYmd(untilIn)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'since y until deben ser fechas YYYY-MM-DD válidas',
            };
        }
        if (dayjs(since).isAfter(dayjs(untilIn), 'day')) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'since no puede ser posterior a until',
            };
        }

        try {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const filepath = path.join(__dirname, '../../data/movimientos_fintoc.json');

            const content = await fs.readFile(filepath, 'utf8');
            const data = JSON.parse(content);

            if (!Array.isArray(data?.movements)) {
                return {
                    success: false,
                    code: CONCILIATION_CODES.INVALID_PARAMS,
                    message: 'Archivo JSON inválido o sin movimientos',
                };
            }

            const sinceDate = dayjs(since).toDate();
            const untilDate = dayjs(untilIn).endOf('day').toDate();

            const filtered = data.movements.filter((m) => {
                if (!(typeof m.amount === 'number' && m.amount > 0)) return false;
                const postDate = m.post_date ? new Date(m.post_date) : null;
                if (!postDate || isNaN(postDate.getTime())) return false;
                return postDate >= sinceDate && postDate <= untilDate;
            });

            filtered.sort((a, b) =>
                String(b.post_date || '').localeCompare(String(a.post_date || ''))
            );

            return {
                success: true,
                code: CONCILIATION_CODES.OK,
                data: { movements: filtered },
            };
        } catch (e) {
            console.error('❌ AdminConciliationService — error reading JSON:', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al leer archivo JSON',
            };
        }
    };

    /**
     * GET /api/conciliations/facturas/:facturaId/detalle
     * Retorna la factura completa con array de productos (detalle).
     * El detalle se popula via el script enrich_facturas_detalle.js.
     */
    getFacturaDetalle = async (facturaId) => {
        const idNum = Number(String(facturaId ?? '').trim());
        if (!idNum || isNaN(idNum)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'El id de factura debe ser un número válido',
            };
        }

        try {
            const factura = await Factura.findOne({ factura: idNum }).lean();
            if (!factura) {
                return {
                    success: false,
                    code: CONCILIATION_CODES.NOT_FOUND,
                    message: `Factura ${idNum} no encontrada`,
                };
            }

            return {
                success: true,
                code: CONCILIATION_CODES.OK,
                data: factura,
            };
        } catch (e) {
            console.error('❌ AdminConciliationService — getFacturaDetalle:', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al obtener detalle de factura',
            };
        }
    };

    /**
     * GET /api/conciliations/cotizaciones/:cotizacionId/detalle
     * Retorna la cotización completa con array de productos (detalle)
     */
    getCotizacionDetalle = async (cotizacionId) => {
        const idNum = Number(String(cotizacionId ?? '').trim());
        if (!idNum || isNaN(idNum)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'El id de cotización debe ser un número válido',
            };
        }

        try {
            const cotizacion = await Cotizacion.findOne({ cotizacion: idNum }).lean();
            if (!cotizacion) {
                return {
                    success: false,
                    code: CONCILIATION_CODES.NOT_FOUND,
                    message: `Cotización ${idNum} no encontrada`,
                };
            }

            return {
                success: true,
                code: CONCILIATION_CODES.OK,
                data: cotizacion,
            };
        } catch (e) {
            console.error('❌ AdminConciliationService — getCotizacionDetalle:', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al obtener detalle de cotización',
            };
        }
    };
}
