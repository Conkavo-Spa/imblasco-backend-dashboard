/**
 * Cliente Fintoc — soporta múltiples bancos via variables de entorno.
 *
 * Convención: una variable por banco, formato FINTOC_NOMBRE=link_token
 *   FINTOC_SANTANDER=link_xxx
 *   FINTOC_BCI=link_yyy
 *   FINTOC_BANCO_ESTADO=link_zzz
 *
 * El código detecta automáticamente todas las vars FINTOC_* que contengan
 * un link_token (valor comienza con "link_"). Al agregar/quitar una variable
 * en Render, el banco aparece/desaparece de la tabla sin tocar código.
 *
 * Documentación Fintoc: https://docs.fintoc.com/reference/movements-list
 */

const FINTOC_API_BASE = 'https://api.fintoc.com/v1';
const MAX_PER_PAGE = 300;
const MAX_PAGES_SAFETY = 50;

// Vars internas que no son bancos
const RESERVED_KEYS = new Set([
    'FINTOC_SECRET_KEY',
    'FINTOC_LINK_TOKEN',
    'FINTOC_ACCOUNT_ID',
    'FINTOC_ACCOUNT_IDS',
]);

/**
 * Lee FINTOC_SECRET_KEY y detecta automáticamente todos los bancos configurados.
 * Un banco = cualquier variable FINTOC_* cuyo valor empiece con "link_".
 *
 * @returns {{ secretKey: string, banks: Array<{ name: string, linkToken: string }> } | null}
 */
export function getFintocConfigFromEnv() {
    const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
    if (!secretKey) return null;

    const banks = [];
    for (const [key, value] of Object.entries(process.env)) {
        if (
            key.startsWith('FINTOC_') &&
            !RESERVED_KEYS.has(key) &&
            typeof value === 'string' &&
            value.trim().startsWith('link_')
        ) {
            const bankName = key
                .replace('FINTOC_', '')
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/\b\w/g, (c) => c.toUpperCase());

            banks.push({ name: bankName, linkToken: value.trim() });
        }
    }

    if (banks.length === 0) return null;

    return { secretKey, banks };
}

function postDateToYmd(postDate) {
    if (!postDate || typeof postDate !== 'string') return '';
    return postDate.slice(0, 10);
}

async function fetchMovementsPage({ secretKey, linkToken, accountId, since, until, page, perPage }) {
    const url = new URL(`${FINTOC_API_BASE}/accounts/${encodeURIComponent(accountId)}/movements`);
    url.searchParams.set('link_token', linkToken);
    url.searchParams.set('since', since);
    url.searchParams.set('until', until);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: secretKey, Accept: 'application/json' },
    });

    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }

    if (!res.ok) {
        const msg = body?.error?.message || body?.message || `Fintoc HTTP ${res.status}`;
        const err = new Error(msg);
        err.fintocStatus = res.status;
        throw err;
    }

    return Array.isArray(body) ? body : [];
}

/**
 * Trae las cuentas vinculadas a un link_token.
 */
async function fetchAccounts({ secretKey, linkToken }) {
    const url = new URL(`${FINTOC_API_BASE}/accounts`);
    url.searchParams.set('link_token', linkToken);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: secretKey, Accept: 'application/json' },
    });

    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }

    if (!res.ok) {
        const msg = body?.error?.message || body?.message || `Fintoc HTTP ${res.status}`;
        throw new Error(msg);
    }

    return Array.isArray(body) ? body : [];
}

/**
 * Lista movimientos de UNA cuenta paginando automáticamente.
 */
async function listMovementsForAccount({ secretKey, linkToken, accountId, since, untilExclusive }) {
    const all = [];
    let page = 1;

    for (;;) {
        const chunk = await fetchMovementsPage({
            secretKey,
            linkToken,
            accountId,
            since,
            until: untilExclusive,
            page,
            perPage: MAX_PER_PAGE,
        });
        all.push(...chunk);
        if (chunk.length < MAX_PER_PAGE) break;
        page += 1;
        if (page > MAX_PAGES_SAFETY) break;
    }

    return all;
}

/**
 * Lista movimientos de TODOS los bancos configurados en paralelo.
 * Cada movimiento incluye: bank_name, account_id, account_number, account_holder.
 *
 * Si un banco falla, los demás siguen funcionando (Promise.allSettled).
 *
 * @param {{ secretKey: string, banks: Array<{ name, linkToken }> }} cfg
 * @param {string} since - YYYY-MM-DD (inclusive)
 * @param {string} untilExclusive - YYYY-MM-DD (exclusivo)
 * @returns {Promise<object[]>}
 */
export async function listMovementsAllAccounts(cfg, since, untilExclusive) {
    const bankResults = await Promise.allSettled(
        cfg.banks.map(async ({ name: bankName, linkToken }) => {
            // 1. Obtener cuentas del banco
            const accounts = await fetchAccounts({ secretKey: cfg.secretKey, linkToken });

            // 2. Traer movimientos de todas las cuentas del banco en paralelo
            const accountResults = await Promise.allSettled(
                accounts.map((account) =>
                    listMovementsForAccount({
                        secretKey: cfg.secretKey,
                        linkToken,
                        accountId: account.id,
                        since,
                        untilExclusive,
                    }).then((movements) =>
                        movements.map((m) => ({
                            ...m,
                            bank_name: bankName,
                            account_id: account.id,
                            account_number: account.number ?? null,
                            account_holder: account.holder_name ?? null,
                        }))
                    )
                )
            );

            const bankMovements = [];
            for (const result of accountResults) {
                if (result.status === 'fulfilled') {
                    bankMovements.push(...result.value);
                } else {
                    console.error(`[Fintoc][${bankName}] Error en cuenta:`, result.reason?.message);
                }
            }
            return bankMovements;
        })
    );

    const all = [];
    for (const [i, result] of bankResults.entries()) {
        if (result.status === 'fulfilled') {
            all.push(...result.value);
        } else {
            console.error(`[Fintoc][${cfg.banks[i]?.name}] Error al consultar banco:`, result.reason?.message);
        }
    }

    return all;
}

// Mantiene compatibilidad con el service para payment-status (single bank lookup)
export async function listMovementsInRange(cfg, since, untilExclusive) {
    return listMovementsAllAccounts(cfg, since, untilExclusive);
}

export { fetchAccounts as listAccounts };

/**
 * Filtra abonos que coinciden con monto y fecha contable (YYYY-MM-DD).
 */
export function filterMatchingDeposits(movements, targetMonto, targetFechaYmd) {
    return movements.filter((m) => {
        const amt = m.amount;
        const ymd = postDateToYmd(m.post_date);
        return typeof amt === 'number' && amt === targetMonto && amt > 0 && ymd === targetFechaYmd;
    });
}
