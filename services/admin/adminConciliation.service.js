import dayjs from 'dayjs';
import {
    CONCILIATION_CODES,
} from '../../constants/adminConciliation.constants.js';
import {
    getFintocConfigFromEnv,
    listMovementsInRange,
    filterMatchingDeposits,
} from '../../libs/fintocClient.js';

function isValidYmd(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = dayjs(s);
    return d.isValid() && d.format('YYYY-MM-DD') === s;
}

/**
 * DTO estable para UI: mismo shape que `data.movimiento` en payment-status.
 * @param {object} m - movimiento crudo Fintoc
 */
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
    };
}

/**
 * Conciliación: datos de cotización vienen del cliente; Fintoc aporta movimientos reales.
 */
export default class AdminConciliationService {
    /**
     * @param {string} cotizacionId - ej. COT-001
     * @param {string} fechaYmd - YYYY-MM-DD (fecha contable esperada)
     * @param {number} monto - entero positivo (ej. CLP)
     * @param {string} [hora] - informativo (UI); no usado en match Fintoc por ahora
     */
    checkQuotePaymentStatus = async (cotizacionId, fechaYmd, monto, hora) => {
        const id = String(cotizacionId ?? '').trim();
        if (!id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'El id de cotización es requerido',
            };
        }

        const fecha = typeof fechaYmd === 'string' ? fechaYmd.trim() : '';
        if (!isValidYmd(fecha)) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'fecha inválida: use YYYY-MM-DD',
            };
        }

        const m =
            typeof monto === 'number'
                ? monto
                : Number.parseInt(String(monto ?? '').trim(), 10);
        if (!Number.isInteger(m) || m <= 0) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_PARAMS,
                message: 'monto inválido: entero positivo requerido',
            };
        }

        const horaStr =
            hora != null && String(hora).trim() !== '' ? String(hora).trim() : null;

        const cfg = getFintocConfigFromEnv();
        if (!cfg) {
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_NOT_CONFIGURED,
                message:
                    'Fintoc no está configurado. Defina FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID.',
            };
        }

        const since = fecha;
        const untilExclusive = dayjs(fecha).add(1, 'day').format('YYYY-MM-DD');

        let movements;
        try {
            movements = await listMovementsInRange(cfg, since, untilExclusive);
        } catch (e) {
            console.error('❌ AdminConciliationService — error Fintoc:', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al consultar movimientos en Fintoc',
            };
        }

        const candidates = filterMatchingDeposits(movements, m, fecha);

        const pagada = candidates.length > 0;
        const primary = pagada ? candidates[0] : null;

        return {
            success: true,
            code: pagada ? CONCILIATION_CODES.PAID : CONCILIATION_CODES.UNPAID,
            message: pagada
                ? 'Se encontró un movimiento que coincide con monto y fecha.'
                : 'No se encontró abono coincidente para esta cotización en la fecha indicada.',
            data: {
                cotizacionId: id,
                fecha,
                monto: m,
                hora: horaStr,
                pagada,
                candidatos: candidates.length,
                movimiento: primary ? mapFintocMovementToDto(primary) : null,
            },
        };
    };

    /**
     * Abonos (amount &gt; 0) en [since, until] fechas contables YYYY-MM-DD.
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
                message:
                    'Fintoc no está configurado. Defina FINTOC_SECRET_KEY, FINTOC_LINK_TOKEN y FINTOC_ACCOUNT_ID.',
            };
        }

        const untilExclusive = dayjs(untilIn).add(1, 'day').format('YYYY-MM-DD');

        let movements;
        try {
            movements = await listMovementsInRange(cfg, since, untilExclusive);
        } catch (e) {
            console.error('❌ AdminConciliationService — error Fintoc (list):', e);
            return {
                success: false,
                code: CONCILIATION_CODES.FINTOC_ERROR,
                message: e.message || 'Error al consultar movimientos en Fintoc',
            };
        }

        // Prioridad: transferencias (type transfer). Excluye cheques. Los abonos "other"
        // suelen no traer contraparte; si type viene vacío pero hay cuentas, se incluye.
        const inbound = movements.filter((m) => {
            if (!(typeof m.amount === 'number' && m.amount > 0)) return false;
            const typeNorm = String(m.type || '').toLowerCase();
            if (typeNorm === 'check') return false;
            if (typeNorm === 'transfer') return true;
            const hasParty =
                m.sender_account != null || m.recipient_account != null;
            if (!m.type && hasParty) return true;
            return false;
        });
        const dtos = inbound.map((m) => mapFintocMovementToDto(m));
        dtos.sort((a, b) => {
            const da = String(a.post_date || '');
            const db = String(b.post_date || '');
            if (da !== db) return db.localeCompare(da);
            return (b.amount || 0) - (a.amount || 0);
        });

        return {
            success: true,
            code: CONCILIATION_CODES.OK,
            data: { movements: dtos },
        };
    };
}
