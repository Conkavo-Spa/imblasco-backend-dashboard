/**
 * Cliente HTTP mínimo para la API de agregación Fintoc (movimientos por cuenta).
 * Documentación: https://docs.fintoc.com/reference/movements-list
 */

const FINTOC_API_BASE = 'https://api.fintoc.com/v1';
const MAX_PER_PAGE = 300;
const MAX_PAGES_SAFETY = 50;

/**
 * @returns {{ secretKey: string, linkToken: string, accountId: string } | null}
 */
export function getFintocConfigFromEnv() {
    const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
    const linkToken = process.env.FINTOC_LINK_TOKEN?.trim();
    const accountId = process.env.FINTOC_ACCOUNT_ID?.trim();
    if (!secretKey || !linkToken || !accountId) return null;
    return { secretKey, linkToken, accountId };
}

function postDateToYmd(postDate) {
    if (!postDate || typeof postDate !== 'string') return '';
    return postDate.slice(0, 10);
}

/**
 * @param {object} params
 * @param {string} params.secretKey
 * @param {string} params.linkToken
 * @param {string} params.accountId
 * @param {string} params.since - YYYY-MM-DD (inclusive)
 * @param {string} params.until - YYYY-MM-DD (exclusive, según API Fintoc)
 * @param {number} params.page
 * @param {number} params.perPage
 */
async function fetchMovementsPage(params) {
    const { secretKey, linkToken, accountId, since, until, page, perPage } = params;
    const url = new URL(`${FINTOC_API_BASE}/accounts/${encodeURIComponent(accountId)}/movements`);
    url.searchParams.set('link_token', linkToken);
    url.searchParams.set('since', since);
    url.searchParams.set('until', until);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: secretKey,
            Accept: 'application/json',
        },
    });

    const text = await res.text();
    let body;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = null;
    }

    if (!res.ok) {
        const msg =
            body?.error?.message || body?.message || `Fintoc HTTP ${res.status}`;
        const err = new Error(msg);
        err.fintocStatus = res.status;
        throw err;
    }

    return Array.isArray(body) ? body : [];
}

/**
 * Lista todos los movimientos en [since, until) paginando automáticamente.
 *
 * @param {object} cfg - resultado de getFintocConfigFromEnv()
 * @param {string} since - YYYY-MM-DD
 * @param {string} untilExclusive - YYYY-MM-DD (exclusivo)
 * @returns {Promise<object[]>}
 */
export async function listMovementsInRange(cfg, since, untilExclusive) {
    const all = [];
    let page = 1;

    for (;;) {
        const chunk = await fetchMovementsPage({
            ...cfg,
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
 * Filtra abonos que coinciden con monto y fecha contable (YYYY-MM-DD).
 *
 * @param {object[]} movements
 * @param {number} targetMonto - entero CLP
 * @param {string} targetFechaYmd - YYYY-MM-DD
 */
export function filterMatchingDeposits(movements, targetMonto, targetFechaYmd) {
    return movements.filter((m) => {
        const amt = m.amount;
        const ymd = postDateToYmd(m.post_date);
        return typeof amt === 'number' && amt === targetMonto && amt > 0 && ymd === targetFechaYmd;
    });
}
