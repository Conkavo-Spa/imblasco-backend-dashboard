/**
 * Cliente HTTP para la API de agregación Fintoc (movimientos por cuenta).
 * Soporta múltiples cuentas bancarias via FINTOC_ACCOUNT_IDS (separadas por coma).
 * Documentación: https://docs.fintoc.com/reference/movements-list
 */

const FINTOC_API_BASE = 'https://api.fintoc.com/v1';
const MAX_PER_PAGE = 300;
const MAX_PAGES_SAFETY = 50;

/**
 * Lee configuración Fintoc desde variables de entorno.
 * Soporta FINTOC_ACCOUNT_IDS (múltiple) con fallback a FINTOC_ACCOUNT_ID (legado).
 *
 * @returns {{ secretKey, linkToken, accountIds: string[] } | null}
 */
export function getFintocConfigFromEnv() {
    const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
    const linkToken = process.env.FINTOC_LINK_TOKEN?.trim();
    if (!secretKey || !linkToken) return null;

    const multipleIds = process.env.FINTOC_ACCOUNT_IDS?.trim();
    const singleId = process.env.FINTOC_ACCOUNT_ID?.trim();

    const accountIds = multipleIds
        ? multipleIds.split(',').map((id) => id.trim()).filter(Boolean)
        : singleId
            ? [singleId]
            : [];

    if (accountIds.length === 0) return null;

    return { secretKey, linkToken, accountIds };
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
 * Trae metadata de todas las cuentas vinculadas al link_token.
 * Usado para obtener número de cuenta y titular para enriquecer movimientos.
 *
 * @param {{ secretKey, linkToken }} cfg
 * @returns {Promise<Array<{ id, number, holder_name, name }>>}
 */
export async function listAccounts(cfg) {
    const url = new URL(`${FINTOC_API_BASE}/accounts`);
    url.searchParams.set('link_token', cfg.linkToken);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: cfg.secretKey, Accept: 'application/json' },
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
 * Lista todos los movimientos de UNA cuenta en [since, until) paginando automáticamente.
 *
 * @param {{ secretKey, linkToken }} cfg
 * @param {string} accountId
 * @param {string} since - YYYY-MM-DD (inclusive)
 * @param {string} untilExclusive - YYYY-MM-DD (exclusivo)
 * @returns {Promise<object[]>}
 */
export async function listMovementsInRange(cfg, since, untilExclusive, accountId = null) {
    const accId = accountId ?? cfg.accountIds?.[0] ?? cfg.accountId;
    const all = [];
    let page = 1;

    for (;;) {
        const chunk = await fetchMovementsPage({
            secretKey: cfg.secretKey,
            linkToken: cfg.linkToken,
            accountId: accId,
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
 * Lista movimientos de TODAS las cuentas en paralelo y los enriquece con info de cuenta.
 * Cada movimiento incluye: account_id, account_number, account_holder.
 *
 * @param {{ secretKey, linkToken, accountIds: string[] }} cfg
 * @param {string} since - YYYY-MM-DD
 * @param {string} untilExclusive - YYYY-MM-DD (exclusivo)
 * @returns {Promise<object[]>}
 */
export async function listMovementsAllAccounts(cfg, since, untilExclusive) {
    // Trae metadata de cuentas para enriquecer movimientos con número y titular
    let accountsMeta = [];
    try {
        accountsMeta = await listAccounts(cfg);
    } catch (e) {
        console.warn('[Fintoc] No se pudo obtener metadata de cuentas:', e.message);
    }

    const metaById = Object.fromEntries(accountsMeta.map((a) => [a.id, a]));

    // Consulta todas las cuentas en paralelo
    const results = await Promise.allSettled(
        cfg.accountIds.map((accountId) =>
            listMovementsInRange(cfg, since, untilExclusive, accountId).then((movements) => {
                const meta = metaById[accountId] ?? {};
                return movements.map((m) => ({
                    ...m,
                    account_id: accountId,
                    account_number: meta.number ?? null,
                    account_holder: meta.holder_name ?? null,
                    account_name: meta.name ?? null,
                }));
            })
        )
    );

    const all = [];
    for (const [i, result] of results.entries()) {
        if (result.status === 'fulfilled') {
            all.push(...result.value);
        } else {
            console.error(`[Fintoc] Error cuenta ${cfg.accountIds[i]}:`, result.reason?.message);
        }
    }

    return all;
}

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
