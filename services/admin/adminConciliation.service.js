import dayjs from 'dayjs';
import { COTIZACIONES_SEED } from '../../data/cotizacionesSeed.js';
import {
    CONCILIATION_CODES,
} from '../../constants/adminConciliation.constants.js';
import {
    getFintocConfigFromEnv,
    listMovementsInRange,
    filterMatchingDeposits,
} from '../../libs/fintocClient.js';

/**
 * Lógica de negocio: conciliar cotizaciones (catálogo seed) contra movimientos Fintoc.
 */
export default class AdminConciliationService {
    /**
     * Comprueba si existe un abono en Fintoc que coincida con monto y fecha contable de la cotización.
     *
     * @param {string} cotizacionId - ej. COT-001
     * @returns {Promise<object>}
     */
    checkQuotePaymentStatus = async (cotizacionId) => {
        const id = String(cotizacionId ?? '').trim();
        if (!id) {
            return {
                success: false,
                code: CONCILIATION_CODES.INVALID_ID,
                message: 'El id de cotización es requerido',
            };
        }

        const cotizacion = COTIZACIONES_SEED.find((c) => c.id === id);
        if (!cotizacion) {
            return {
                success: false,
                code: CONCILIATION_CODES.NOT_FOUND,
                message: 'Cotización no encontrada',
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

        const since = cotizacion.fecha;
        const untilExclusive = dayjs(cotizacion.fecha).add(1, 'day').format('YYYY-MM-DD');

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

        const candidates = filterMatchingDeposits(
            movements,
            cotizacion.monto,
            cotizacion.fecha
        );

        const pagada = candidates.length > 0;
        const primary = pagada ? candidates[0] : null;

        return {
            success: true,
            code: pagada ? CONCILIATION_CODES.PAID : CONCILIATION_CODES.UNPAID,
            message: pagada
                ? 'Se encontró un movimiento que coincide con monto y fecha.'
                : 'No se encontró abono coincidente para esta cotización en la fecha indicada.',
            data: {
                cotizacionId: cotizacion.id,
                fecha: cotizacion.fecha,
                monto: cotizacion.monto,
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
