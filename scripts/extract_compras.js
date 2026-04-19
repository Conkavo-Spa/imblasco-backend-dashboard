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
const CATALOG_PATH        = path.resolve(__dirname, '../data/catalogo_completo.json');
const ACTIVE_CATALOG_PATH = path.resolve(__dirname, '../data/catalogo_activo.json');

// ── Fórmula de sugerencia ─────────────────────────────────────────────────────
function calcularSugerencia({ y2023, y2024, y2025, y2026, stock, porEmbarcar }) {
    const proyeccion = (y2025 * 0.5) + (y2024 * 0.3) + (y2023 * 0.2);
    const raw = proyeccion - y2026 - stock - porEmbarcar;
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
const ventas = {};       // { codpro: { 2023: n, 2024: n, 2025: n, 2026: n } }
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
            if (year < 2016 || year > 2026) continue;

            const codpro = stripQuotes(cols[K.codpro]);

            // Rastrear último año con venta (toda la historia)
            if (!ultimaVenta[codpro] || year > ultimaVenta[codpro]) ultimaVenta[codpro] = year;

            // Acumular solo 2023-2026 para cálculo de sugerencia
            if (year >= 2023) {
                if (!ventas[codpro]) ventas[codpro] = { 2023: 0, 2024: 0, 2025: 0, 2026: 0 };
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
    console.log(`   Productos con ventas 2023-2026: ${Object.keys(ventas).length}`);
    console.log(`   Productos en catálogo:          ${Object.keys(nombres).length}`);
    console.log(`   Productos con stock:            ${Object.keys(stockMap).length}`);

    // ── Función para armar un producto ───────────────────────────────────────
    const buildProducto = (codpro, años) => {
        const y2023 = años[2023] || 0;
        const y2024 = años[2024] || 0;
        const y2025 = años[2025] || 0;
        const y2026 = años[2026] || 0;
        const s = stockMap[codpro] || { stock: 0, porEmbarcar: 0 };
        return {
            cod: codpro,
            nombre: nombres[codpro] || `Producto ${codpro}`,
            y2023, y2024, y2025, y2026,
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
            sugerencia: calcularSugerencia({ y2023, y2024, y2025, y2026, stock: s.stock, porEmbarcar: s.porEmbarcar }),
        };
    };

    const ordenados = Object.entries(ventas)
        .map(([codpro, años]) => buildProducto(codpro, años))
        .sort((a, b) => (b.y2023 + b.y2024 + b.y2025 + b.y2026) - (a.y2023 + a.y2024 + a.y2025 + a.y2026));

    // ── Top 50 (para la tabla principal) ─────────────────────────────────────
    const top50 = ordenados.slice(0, 50);

    // ── Catálogo activo (para búsqueda) ──────────────────────────────────────
    // Solo productos con última venta >= 2022 (FACT o GUIA), ordenados por total histórico
    const catalogoActivo = [];
    Object.keys(nombres).forEach(codpro => {
        const ultimoAno = ultimaVenta[codpro] || 0;
        if (ultimoAno < 2022) return;  // excluir dormidos/obsoletos
        const v = ventas[codpro] || { 2023: 0, 2024: 0, 2025: 0, 2026: 0 };
        const s = stockMap[codpro] || { stock: 0, porEmbarcar: 0 };
        const y2023 = v[2023] || 0;
        const y2024 = v[2024] || 0;
        const y2025 = v[2025] || 0;
        const y2026 = v[2026] || 0;
        catalogoActivo.push({
            cod: codpro,
            nombre: nombres[codpro],
            y2023, y2024, y2025, y2026,
            stock: s.stock,
            porEmbarcar: s.porEmbarcar,
            sugerencia: calcularSugerencia({ y2023, y2024, y2025, y2026, stock: s.stock, porEmbarcar: s.porEmbarcar }),
            ultimoAno,
        });
    });
    catalogoActivo.sort((a, b) => (b.y2023 + b.y2024 + b.y2025 + b.y2026) - (a.y2023 + a.y2024 + a.y2025 + a.y2026));

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
            const total = p.y2023 + p.y2024 + p.y2025 + p.y2026;
            console.log(`  ${i + 1}. [${p.cod}] ${p.nombre.slice(0, 50)} — ${total.toLocaleString()} un`);
        });
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
