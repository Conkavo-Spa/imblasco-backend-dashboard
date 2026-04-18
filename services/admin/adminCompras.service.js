/**
 * Servicio de Compras — ImBlasco Dashboard
 * Lee datos reales desde data/compras_productos.json (generado por scripts/extract_compras.js).
 * Si el archivo no existe, usa mock data como fallback.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import path from 'path';
import Pedido from '../../models/Pedido.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JSON_PATH     = path.resolve(__dirname, '../../data/compras_productos.json');
const CATALOG_PATH  = path.resolve(__dirname, '../../data/catalogo_completo.json');

function calcularSugerencia({ y2023, y2024, y2025, y2026, stock, porEmbarcar }) {
    const proyeccion = (y2025 * 0.5) + (y2024 * 0.3) + (y2023 * 0.2);
    const raw = proyeccion - y2026 - stock - porEmbarcar;
    return Math.max(0, Math.round(raw));
}

const MOCK_PRODUCTOS = [
    { cod: '2231', nombre: 'Bolsa tote ecológica 35×40',         y2023: 2100, y2024: 2400, y2025: 2650, y2026: 980,  stock: 820,  porEmbarcar: 400 },
    { cod: '2244', nombre: 'Taza cerámica 350ml c/logo',          y2023: 1800, y2024: 2100, y2025: 2300, y2026: 710,  stock: 150,  porEmbarcar: 200 },
    { cod: '2260', nombre: 'Lápiz metálico grabado',              y2023: 5200, y2024: 5800, y2025: 6100, y2026: 2100, stock: 2200, porEmbarcar: 1000 },
    { cod: '2275', nombre: 'Libreta tapa dura A5',                y2023: 1400, y2024: 1700, y2025: 1900, y2026: 550,  stock: 300,  porEmbarcar: 100 },
    { cod: '2290', nombre: 'Botella acero inox 500ml',            y2023: 900,  y2024: 1200, y2025: 1450, y2026: 390,  stock: 80,   porEmbarcar: 300 },
    { cod: '2310', nombre: 'Pendrive 16GB carcasa bambú',         y2023: 700,  y2024: 900,  y2025: 1100, y2026: 280,  stock: 420,  porEmbarcar: 0 },
    { cod: '2325', nombre: 'Paraguas plegable automático',        y2023: 600,  y2024: 750,  y2025: 880,  y2026: 210,  stock: 95,   porEmbarcar: 150 },
    { cod: '2340', nombre: 'Gorro lana bordado',                  y2023: 1100, y2024: 1300, y2025: 1500, y2026: 420,  stock: 60,   porEmbarcar: 200 },
    { cod: '2355', nombre: 'Polera algodón 180g',                 y2023: 3200, y2024: 3700, y2025: 4100, y2026: 1350, stock: 500,  porEmbarcar: 800 },
    { cod: '2370', nombre: 'Delantal cocina sublimado',           y2023: 800,  y2024: 950,  y2025: 1050, y2026: 310,  stock: 200,  porEmbarcar: 0 },
    { cod: '2388', nombre: 'Set destornilladores 6 pzas',         y2023: 450,  y2024: 600,  y2025: 720,  y2026: 190,  stock: 130,  porEmbarcar: 50 },
    { cod: '2400', nombre: 'Cargador inalámbrico 15W',            y2023: 350,  y2024: 500,  y2025: 680,  y2026: 170,  stock: 40,   porEmbarcar: 100 },
    { cod: '2415', nombre: 'Audífono bluetooth on-ear',           y2023: 280,  y2024: 380,  y2025: 490,  y2026: 120,  stock: 25,   porEmbarcar: 50 },
    { cod: '2430', nombre: 'Mousepad XL 80×40cm',                 y2023: 900,  y2024: 1100, y2025: 1250, y2026: 380,  stock: 310,  porEmbarcar: 0 },
    { cod: '2445', nombre: 'Termo café 400ml c/tapa',             y2023: 650,  y2024: 800,  y2025: 950,  y2026: 270,  stock: 120,  porEmbarcar: 100 },
    { cod: '2460', nombre: 'Poncho polar fleece',                 y2023: 1200, y2024: 1400, y2025: 1600, y2026: 460,  stock: 180,  porEmbarcar: 250 },
    { cod: '2475', nombre: 'Linterna LED recargable',             y2023: 400,  y2024: 520,  y2025: 640,  y2026: 175,  stock: 90,   porEmbarcar: 0 },
    { cod: '2490', nombre: 'Cartera cuero sintético',             y2023: 550,  y2024: 700,  y2025: 820,  y2026: 220,  stock: 70,   porEmbarcar: 80 },
    { cod: '2505', nombre: 'Agenda ejecutiva 2026',               y2023: 1800, y2024: 2000, y2025: 2200, y2026: 680,  stock: 400,  porEmbarcar: 300 },
    { cod: '2520', nombre: 'Lapicero set ×3 colores',             y2023: 3000, y2024: 3400, y2025: 3800, y2026: 1150, stock: 1200, porEmbarcar: 500 },
    { cod: '2535', nombre: 'Portanombre acrílico',                y2023: 2500, y2024: 2800, y2025: 3100, y2026: 930,  stock: 800,  porEmbarcar: 0 },
    { cod: '2550', nombre: 'Mascarilla tela reutilizable',        y2023: 4000, y2024: 3500, y2025: 3000, y2026: 820,  stock: 600,  porEmbarcar: 0 },
    { cod: '2565', nombre: 'Tote bag yute natural',               y2023: 1600, y2024: 1900, y2025: 2100, y2026: 630,  stock: 350,  porEmbarcar: 200 },
    { cod: '2580', nombre: 'Mug plástico 400ml doble pared',      y2023: 1300, y2024: 1500, y2025: 1700, y2026: 490,  stock: 280,  porEmbarcar: 100 },
    { cod: '2595', nombre: 'Bloc notas 100 hojas',                y2023: 2200, y2024: 2500, y2025: 2800, y2026: 840,  stock: 900,  porEmbarcar: 0 },
    { cod: '2610', nombre: 'Regla metálica 30cm',                 y2023: 1900, y2024: 2100, y2025: 2300, y2026: 700,  stock: 700,  porEmbarcar: 0 },
    { cod: '2625', nombre: 'Clip magnético set ×10',              y2023: 3500, y2024: 3900, y2025: 4200, y2026: 1280, stock: 1500, porEmbarcar: 300 },
    { cod: '2640', nombre: 'Post-it 76×76 neón ×4',               y2023: 4200, y2024: 4600, y2025: 5000, y2026: 1540, stock: 1800, porEmbarcar: 400 },
    { cod: '2655', nombre: 'Cinta adhesiva transparente',         y2023: 2800, y2024: 3100, y2025: 3400, y2026: 1020, stock: 1100, porEmbarcar: 0 },
    { cod: '2670', nombre: 'Tijeras acero inox 21cm',             y2023: 700,  y2024: 850,  y2025: 1000, y2026: 290,  stock: 200,  porEmbarcar: 0 },
    { cod: '2685', nombre: 'Sacapuntas metálico doble',           y2023: 2100, y2024: 2400, y2025: 2700, y2026: 810,  stock: 850,  porEmbarcar: 100 },
    { cod: '2700', nombre: 'Corrector líquido 7ml',               y2023: 3100, y2024: 3400, y2025: 3700, y2026: 1110, stock: 1300, porEmbarcar: 200 },
    { cod: '2715', nombre: 'Resaltador pastel set ×4',            y2023: 2600, y2024: 2900, y2025: 3200, y2026: 960,  stock: 1000, porEmbarcar: 0 },
    { cod: '2730', nombre: 'Archivador lomo ancho A4',            y2023: 900,  y2024: 1050, y2025: 1200, y2026: 350,  stock: 250,  porEmbarcar: 50 },
    { cod: '2745', nombre: 'Separadores plástico ×10',            y2023: 1700, y2024: 1900, y2025: 2100, y2026: 630,  stock: 600,  porEmbarcar: 0 },
    { cod: '2760', nombre: 'Perforador 30 hojas metálico',        y2023: 450,  y2024: 580,  y2025: 700,  y2026: 195,  stock: 80,   porEmbarcar: 30 },
    { cod: '2775', nombre: 'Engrapador 24/6 50 hojas',            y2023: 380,  y2024: 490,  y2025: 600,  y2026: 160,  stock: 60,   porEmbarcar: 20 },
    { cod: '2790', nombre: 'Grapas 24/6 caja ×1000',              y2023: 5000, y2024: 5500, y2025: 6000, y2026: 1850, stock: 2000, porEmbarcar: 500 },
    { cod: '2805', nombre: 'Ligas colores surtidos 100g',         y2023: 2400, y2024: 2700, y2025: 3000, y2026: 900,  stock: 900,  porEmbarcar: 0 },
    { cod: '2820', nombre: 'Porta lápices escritorio acrílico',   y2023: 600,  y2024: 750,  y2025: 900,  y2026: 250,  stock: 150,  porEmbarcar: 0 },
    { cod: '2835', nombre: 'Calculadora 12 dígitos',              y2023: 300,  y2024: 400,  y2025: 500,  y2026: 130,  stock: 50,   porEmbarcar: 30 },
    { cod: '2850', nombre: 'Alfombrilla gel reposamuñecas',       y2023: 400,  y2024: 520,  y2025: 640,  y2026: 175,  stock: 90,   porEmbarcar: 0 },
    { cod: '2865', nombre: 'Hub USB 4 puertos',                   y2023: 250,  y2024: 340,  y2025: 450,  y2026: 110,  stock: 35,   porEmbarcar: 40 },
    { cod: '2880', nombre: 'Cable USB-C trenzado 1.5m',           y2023: 800,  y2024: 1000, y2025: 1200, y2026: 360,  stock: 300,  porEmbarcar: 100 },
    { cod: '2895', nombre: 'Soporte celular escritorio ajustable',y2023: 350,  y2024: 460,  y2025: 580,  y2026: 150,  stock: 70,   porEmbarcar: 0 },
    { cod: '2910', nombre: 'Mini lámpara LED cuello cisne USB',   y2023: 280,  y2024: 370,  y2025: 470,  y2026: 120,  stock: 45,   porEmbarcar: 20 },
    { cod: '2925', nombre: 'Stickers circulares ×100',            y2023: 3800, y2024: 4200, y2025: 4600, y2026: 1400, stock: 1600, porEmbarcar: 200 },
    { cod: '2940', nombre: 'Bolígrafo gel negro ×12',             y2023: 4500, y2024: 5000, y2025: 5500, y2026: 1700, stock: 1900, porEmbarcar: 300 },
    { cod: '2955', nombre: 'Carpeta presentación A4 c/logo',      y2023: 1100, y2024: 1300, y2025: 1500, y2026: 430,  stock: 350,  porEmbarcar: 100 },
    { cod: '2970', nombre: 'Papel bond 75g resma 500 hjs',        y2023: 2000, y2024: 2200, y2025: 2400, y2026: 720,  stock: 700,  porEmbarcar: 0 },
];

export default class AdminComprasService {
    buscarProductos = async (query) => {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return { success: true, data: { productos: [] } };

        const fuente = existsSync(CATALOG_PATH) ? CATALOG_PATH : JSON_PATH;
        if (!existsSync(fuente)) return { success: true, data: { productos: [] } };

        const todos = JSON.parse(readFileSync(fuente, 'utf8'));
        const resultados = todos.filter(p =>
            p.nombre.toLowerCase().includes(q) || p.cod.toLowerCase().includes(q)
        ).slice(0, 100);

        return { success: true, data: { productos: resultados, total: resultados.length } };
    };

    getProductos = async () => {
        // Sin datos reales no hay nada que mostrar — el mock no tiene valor operativo
        const fuente = existsSync(CATALOG_PATH) ? CATALOG_PATH
                     : existsSync(JSON_PATH)     ? JSON_PATH
                     : null;

        if (!fuente) return { success: true, data: { productos: [], actualizadoEl: null } };

        const todos = JSON.parse(readFileSync(fuente, 'utf8'));

        // Fecha de última extracción del SQL dump (mtime del archivo JSON)
        let actualizadoEl = null;
        try { actualizadoEl = statSync(fuente).mtime; } catch { /* sin permisos, ignorar */ }

        // Cantidades confirmadas/embarcadas desde el dashboard (MongoDB)
        // Se descuentan de la sugerencia para no pedir de más lo ya gestionado aquí
        const pedidos = await Pedido.find().lean();
        const confirmadosMap = {};
        const embarcadosMap  = {};
        pedidos.forEach(pedido => {
            pedido.productos.forEach(p => {
                if (p.estado === 'confirmado') confirmadosMap[p.cod] = (confirmadosMap[p.cod] || 0) + p.cantidad;
                if (p.estado === 'embarcado')  embarcadosMap[p.cod]  = (embarcadosMap[p.cod]  || 0) + p.cantidad;
            });
        });

        // Calcular mesesCobertura y recalcular sugerencia en tiempo real
        // Incluye unidades del dashboard (confirmado + embarcado) además del ERP (porEmbarcar)
        const conCobertura = todos.map(p => {
            const proyeccion       = (p.y2025 * 0.5) + (p.y2024 * 0.3) + (p.y2023 * 0.2);
            const tasaMensual      = proyeccion / 12;
            const dashConfirmado   = confirmadosMap[p.cod] ?? 0;
            const dashEmbarcado    = embarcadosMap[p.cod]  ?? 0;
            const totalDisponible  = (p.stock ?? 0) + (p.porEmbarcar ?? 0) + dashConfirmado + dashEmbarcado;
            const mesesCobertura   = tasaMensual > 0 ? totalDisponible / tasaMensual : null;
            const sugerencia       = Math.max(0, Math.round(
                proyeccion - (p.y2026 ?? 0) - (p.stock ?? 0) - (p.porEmbarcar ?? 0) - dashConfirmado - dashEmbarcado
            ));
            return { ...p, mesesCobertura, sugerencia };
        });

        // Solo productos con actividad reciente demostrada (2025 o 2026) y demanda proyectada significativa.
        // Productos sin ventas en 2025 ni 2026 se consideran inactivos y se excluyen.
        const aPedir = conCobertura.filter(p => {
            if (p.sugerencia <= 0) return false;

            const proy = (p.y2025 * 0.5) + (p.y2024 * 0.3) + (p.y2023 * 0.2);
            if (proy < 100) return false;

            // Requiere actividad en 2025 o 2026 — confirma que el producto sigue en el catálogo activo
            const tieneActividadReciente = (p.y2025 ?? 0) > 0 || (p.y2026 ?? 0) > 0;
            if (!tieneActividadReciente) return false;

            return true;
        });

        // Sort: productos con actividad en 2026 primero, luego todos por urgencia (mesesCobertura asc).
        // Sin tiers: todos los productos restantes tienen actividad en 2025 o 2026.
        aPedir.sort((a, b) => {
            const activo2026A = (a.y2026 ?? 0) > 0 ? 0 : 1;
            const activo2026B = (b.y2026 ?? 0) > 0 ? 0 : 1;
            if (activo2026A !== activo2026B) return activo2026A - activo2026B;
            if (a.mesesCobertura === null && b.mesesCobertura === null) return 0;
            if (a.mesesCobertura === null) return 1;
            if (b.mesesCobertura === null) return -1;
            return a.mesesCobertura - b.mesesCobertura;
        });

        return { success: true, data: { productos: aPedir, actualizadoEl } };
    };

    actualizarDatos = () => {
        const scriptPath = path.resolve(__dirname, '../../scripts/extract_compras.js');
        return new Promise((resolve, reject) => {
            const child = spawn('node', [scriptPath], {
                env: { ...process.env },
                cwd: path.resolve(__dirname, '../..'),
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', d => { stdout += d.toString(); });
            child.stderr.on('data', d => { stderr += d.toString(); });
            child.on('close', code => {
                if (code === 0) resolve({ success: true, output: stdout });
                else reject(new Error(stderr || `El script terminó con código ${code}`));
            });
            child.on('error', reject);
        });
    };
}
