/**
 * extract_compras.js
 *
 * Lee el dump SQL de Imblasco y genera data/compras_productos.json
 * con los 50 productos más vendidos (2023-2026), su stock actual
 * y la sugerencia de pedido calculada.
 *
 * Uso:
 *   node scripts/extract_compras.js
 *   SQL_PATH="ruta/al/archivo.sql" node scripts/extract_compras.js
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQL_PATH = process.env.SQL_PATH ||
    'C:/Users/Javier/Desktop/blas-local/blas_local 20260227 0400.sql';
const OUT_PATH            = path.resolve(__dirname, '../data/compras_productos.json');
const ACTIVE_CATALOG_PATH = path.resolve(__dirname, '../data/catalogo_activo.json');

const CURRENT_YEAR = new Date().getFullYear();

// ── Fórmula de sugerencia ─────────────────────────────────────────────────────
// py1 = año anterior (50%), py2 = hace 2 años (30%), py3 = hace 3 años (20%), cy = año actual vendido
function calcularSugerencia({ py1, py2, py3, cy, stock, porEmbarcar }) {
    const proyeccion = (py1 * 0.5) + (py2 * 0.3) + (py3 * 0.2);
    const raw = proyeccion - cy - stock - porEmbarcar;
    return Math.max(0, Math.round(raw));
}

// ── Parsear una línea de datos: ('val1','val2',NULL,...) ──────────────────────
function parseDataRow(line) {
    const trimmed = line.trim();
    // Debe empezar con ( y terminar con ) o ),
    if (!trimmed.startsWith('(')) return null;

    const inner = trimmed.replace(/[,;]+$/, '').slice(1, -1);
    const values = [];
    let current = '';
    let inStr = false;

    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "'" && inner[i - 1] !== '\\') {
            inStr = !inStr;
            current += ch;
        } else if (ch === ',' && !inStr) {
            values.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim() !== '') values.push(current.trim());
    return values;
}

function stripQuotes(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s === 'NULL') return '';
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/\\'/g, "'");
    return s;
}

function toNum(val) {
    const n = parseInt(stripQuotes(val), 10);
    return isNaN(n) ? 0 : n;
}

// ── Índices de columnas (0-based, según schema del dump) ─────────────────────
// ma_kardex: codbod,boddes,codpro,fecemi,entra,sale,glosa,cospro,codigo,codtip,docto,folio,codusu,numoc
const K = { codpro: 2, fecemi: 3, sale: 5, docto: 10 };
// ma_product: codpro,descri,coduni,codfam,codgru,codmar,activo,...
const P = { codpro: 0, descri: 1 };
// re_bodprod: codbod,codpro,stock,stkcom,stkini,fecini,stktran
const B = { codpro: 1, stock: 2, stktran: 6 };

// ── Acumuladores ──────────────────────────────────────────────────────────────
const ventas = {};       // { codpro: { [cy-3]: n, ..., [cy]: n } }
const nombres = {};      // { codpro: descri }
const stockMap = {};     // { codpro: { stock: n, porEmbarcar: n } }
const ultimaVenta = {};  // { codpro: año } — último año con venta (toda la historia)

async function main() {
    if (!fs.existsSync(SQL_PATH)) {
        console.error(`❌ No se encontró el archivo SQL en: ${SQL_PATH}`);
        process.exit(1);
    }

    console.log('📂 Leyendo archivo SQL...');
    console.log(`   Ruta: ${SQL_PATH}\n`);

    const rl = readline.createInterface({
        input: fs.createReadStream(SQL_PATH, { encoding: 'latin1' }),
        crlfDelay: Infinity,
    });

    let currentTable = null; // 'kardex' | 'product' | 'bodprod' | null
    let lineCount = 0;

    for await (const line of rl) {
        lineCount++;
        if (lineCount % 300000 === 0) {
            console.log(`   ... ${(lineCount / 1000).toFixed(0)}k líneas | ventas: ${Object.keys(ventas).length} prods`);
        }

        const trimmed = line.trim();

        // ── Detectar cambio de tabla ──────────────────────────────────────────
        if (trimmed.startsWith('-- Dumping data for table')) {
            if (trimmed.includes('`ma_kardex`'))  { currentTable = 'kardex';  continue; }
            if (trimmed.includes('`ma_product`')) { currentTable = 'product'; continue; }
            if (trimmed.includes('`re_bodprod`')) { currentTable = 'bodprod'; continue; }
            currentTable = null;
            continue;
        }

        if (!currentTable) continue;

        // ── Líneas de datos: empiezan con ( ──────────────────────────────────
        if (!trimmed.startsWith('(')) continue;

        const cols = parseDataRow(trimmed);
        if (!cols || cols.length < 3) continue;

        if (currentTable === 'product') {
            const codpro = stripQuotes(cols[P.codpro]);
            const descri = stripQuotes(cols[P.descri]).trim();
            if (codpro && descri) nombres[codpro] = descri;

        } else if (currentTable === 'kardex') {
            if (cols.length <= K.docto) continue;
            const docto = stripQuotes(cols[K.docto]);
            if (docto !== 'FACT' && docto !== 'GUIA') continue;

            const sale = toNum(cols[K.sale]);
            if (sale <= 0) continue;

            const fecemi = stripQuotes(cols[K.fecemi]);
            const year = fecemi ? parseInt(fecemi.substring(0, 4), 10) : 0;
            if (year < 2016 || year > CURRENT_YEAR) continue;

            const codpro = stripQuotes(cols[K.codpro]);

            // Rastrear último año con venta (toda la historia)
            if (!ultimaVenta[codpro] || year > ultimaVenta[codpro]) ultimaVenta[codpro] = year;

            // Acumular últimos 4 años (cy-3 a cy) para cálculo de sugerencia
            if (year >= CURRENT_YEAR - 3) {
                if (!ventas[codpro]) {
                    const init = {};
                    for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR; y++) init[y] = 0;
                    ventas[codpro] = init;
                }
                ventas[codpro][year] += sale;
            }

        } else if (currentTable === 'bodprod') {
            if (cols.length <= B.stktran) continue;
            const codpro = stripQuotes(cols[B.codpro]);
            const stock  = toNum(cols[B.stock]);
            const stktran = toNum(cols[B.stktran]);
            if (!stockMap[codpro]) stockMap[codpro] = { stock: 0, porEmbarcar: 0 };
            stockMap[codpro].stock       += stock;
            stockMap[codpro].porEmbarcar += stktran;
        }
    }

    console.log(`\n✅ Lectura completada (${lineCount.toLocaleString()} líneas)`);
    console.log(`   Productos con ventas ${CURRENT_YEAR - 3}-${CURRENT_YEAR}: ${Object.keys(ventas).length}`);
    console.log(`   Productos en catálogo:          ${Object.keys(nombres).length}`);
    console.log(`   Productos con stock:            ${Object.keys(stockMap).length}`);

    // ── Función para armar un producto ───────────────────────────────────────
    const buildProducto = (codpro, años) => {
        const cy = CURRENT_YEAR;
        const s  = stockMap[codpro] || { stock: 0, porEmbarcar: 0 };
        const producto = {
            cod: codpro,
            nombre: nombres[codpro] || `Producto ${codpro}`,
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
        };
        for (let y = cy - 3; y <= cy; y++) producto[`y${y}`] = años[y] || 0;
        producto.sugerencia = calcularSugerencia({
            py1: años[cy - 1] || 0,
            py2: años[cy - 2] || 0,
            py3: años[cy - 3] || 0,
            cy:  años[cy]     || 0,
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
        });
        return producto;
    };

    const ordenados = Object.entries(ventas)
        .map(([codpro, años]) => buildProducto(codpro, años))
        .sort((a, b) => {
            let sumA = 0, sumB = 0;
            for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR; y++) {
                sumA += a[`y${y}`] || 0;
                sumB += b[`y${y}`] || 0;
            }
            return sumB - sumA;
        });

    // ── Top 50 (para la tabla principal) ─────────────────────────────────────
    const top50 = ordenados.slice(0, 50);

    // ── Catálogo activo (para búsqueda) ──────────────────────────────────────
    // Solo productos con última venta en los últimos 4 años, ordenados por total histórico
    const catalogoActivo = [];
    Object.keys(nombres).forEach(codpro => {
        const ultimoAno = ultimaVenta[codpro] || 0;
        if (ultimoAno < CURRENT_YEAR - 4) return;  // excluir dormidos/obsoletos
        const v = ventas[codpro] || {};
        const s = stockMap[codpro] || { stock: 0, porEmbarcar: 0 };
        const item = {
            cod: codpro,
            nombre: nombres[codpro],
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
            ultimoAno,
        };
        for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR; y++) item[`y${y}`] = v[y] || 0;
        item.sugerencia = calcularSugerencia({
            py1: v[CURRENT_YEAR - 1] || 0,
            py2: v[CURRENT_YEAR - 2] || 0,
            py3: v[CURRENT_YEAR - 3] || 0,
            cy:  v[CURRENT_YEAR]     || 0,
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
        });
        catalogoActivo.push(item);
    });
    catalogoActivo.sort((a, b) => {
        let sumA = 0, sumB = 0;
        for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR; y++) {
            sumA += a[`y${y}`] || 0;
            sumB += b[`y${y}`] || 0;
        }
        return sumB - sumA;
    });

    // ── Guardar JSON ──────────────────────────────────────────────────────────
    const outDir = path.dirname(OUT_PATH);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(OUT_PATH, JSON.stringify(top50, null, 2), 'utf8');
    fs.writeFileSync(ACTIVE_CATALOG_PATH, JSON.stringify(catalogoActivo, null, 2), 'utf8');

    console.log(`\n🎉 Archivos generados:`);
    console.log(`   Top 50:           ${OUT_PATH} (${top50.length} productos)`);
    console.log(`   Catálogo activo:   ${ACTIVE_CATALOG_PATH} (${catalogoActivo.length} productos)`);

    if (top50.length > 0) {
        console.log('\nTop 5 productos:');
        top50.slice(0, 5).forEach((p, i) => {
            let total = 0;
            for (let y = CURRENT_YEAR - 3; y <= CURRENT_YEAR; y++) total += p[`y${y}`] || 0;
            console.log(`  ${i + 1}. [${p.cod}] ${p.nombre.slice(0, 50)} — ${total.toLocaleString()} un`);
        });
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
