/**
 * Códigos de respuesta del módulo admin — conciliación bancaria (Fintoc).
 * Mantener sincronizado con el contrato que consume el frontend.
 */
export const CONCILIATION_CODES = {
    OK: 'OK',
    PAID: 'PAID',
    UNPAID: 'UNPAID',
    INVALID_PARAMS: 'INVALID_PARAMS',
    INVALID_ID: 'INVALID_ID',
    NOT_FOUND: 'NOT_FOUND',
    FINTOC_NOT_CONFIGURED: 'FINTOC_NOT_CONFIGURED',
    FINTOC_ERROR: 'FINTOC_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/** @type {Record<string, number>} */
export const HTTP_STATUS_BY_CONCILIATION_CODE = {
    [CONCILIATION_CODES.INVALID_PARAMS]: 400,
    [CONCILIATION_CODES.INVALID_ID]: 400,
    [CONCILIATION_CODES.NOT_FOUND]: 404,
    [CONCILIATION_CODES.FINTOC_NOT_CONFIGURED]: 503,
    [CONCILIATION_CODES.FINTOC_ERROR]: 502,
};
