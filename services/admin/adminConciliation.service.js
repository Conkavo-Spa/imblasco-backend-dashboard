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
                movimiento: primary
                    ? {
                          id: primary.id,
                          amount: primary.amount,
                          currency: primary.currency,
                          post_date: primary.post_date,
                          transaction_date: primary.transaction_date ?? null,
                          description: primary.description ?? null,
                          type: primary.type ?? null,
                          comment: primary.comment ?? null,
                          reference_id: primary.reference_id ?? null,
                          document_number: primary.document_number ?? null,
                          sender_account: primary.sender_account
                              ? {
                                    holder_id: primary.sender_account.holder_id ?? null,
                                    holder_name: primary.sender_account.holder_name ?? null,
                                    number: primary.sender_account.number ?? null,
                                    institution_name:
                                        primary.sender_account.institution?.name ?? null,
                                }
                              : null,
                          recipient_account: primary.recipient_account
                              ? {
                                    holder_id: primary.recipient_account.holder_id ?? null,
                                    holder_name: primary.recipient_account.holder_name ?? null,
                                    number: primary.recipient_account.number ?? null,
                                    institution_name:
                                        primary.recipient_account.institution?.name ?? null,
                                }
                              : null,
                      }
                    : null,
            },
        };
    };
}
