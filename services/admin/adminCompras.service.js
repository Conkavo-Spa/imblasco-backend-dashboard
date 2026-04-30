import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Pedido from '../../models/Pedido.js';
import ImblascoProducto from '../../models/ImblascoProducto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CODIGOS_DESCARTAR = new Set(
    JSON.parse(readFileSync(path.resolve(__dirname, '../../data/codigos_descartar.json'), 'utf8'))
        .map(String)
);
const CATALOGO_FAMILIAS = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../data/catalogo_familias.json'), 'utf8')
);

const CY = new Date().getFullYear();

function calcularSugerencia({ py1, py2, py3, cy, stock, porEmbarcar }) {
    const proyeccion = (py1 * 0.5) + (py2 * 0.3) + (py3 * 0.2);
    const raw = proyeccion - cy - stock - porEmbarcar;
    return Math.max(0, Math.round(raw));
}

function enriquecerProducto(p) {
    return {
        ...p,
        descartado: CODIGOS_DESCARTAR.has(String(p.cod)),
        familia:    CATALOGO_FAMILIAS[String(p.cod)] ?? 'VARIOS',
    };
}

export default class AdminComprasService {
    buscarProductos = async (query) => {
        const q = String(query || '').trim();
        if (!q) return { success: true, data: { productos: [] } };

        const coincidencias = await ImblascoProducto.find({
            $and: [
                { $or: [
                    { nombre: { $regex: q, $options: 'i' } },
                    { cod:    { $regex: q, $options: 'i' } },
                ]},
                { $expr: { $gt: [{ $add: [`$y${CY - 3}`, `$y${CY - 2}`, `$y${CY - 1}`, `$y${CY}`] }, 0] } },
            ],
        }).limit(100).lean();

        if (!coincidencias.length) return { success: true, data: { productos: [], total: 0 } };

        const pedidos = await Pedido.find().lean();
        const confirmadosMap = {};
        const embarcadosMap  = {};
        pedidos.forEach(pedido => {
            pedido.productos.forEach(p => {
                if (p.estado === 'confirmado') confirmadosMap[p.cod] = (confirmadosMap[p.cod] || 0) + p.cantidad;
                if (p.estado === 'embarcado')  embarcadosMap[p.cod]  = (embarcadosMap[p.cod]  || 0) + p.cantidad;
            });
        });

        const resultados = coincidencias.map(p => {
            const dashConfirmado = confirmadosMap[p.cod] ?? 0;
            const dashEmbarcado  = embarcadosMap[p.cod]  ?? 0;
            const sugerencia     = calcularSugerencia({
                py1: p[`y${CY - 1}`] ?? 0,
                py2: p[`y${CY - 2}`] ?? 0,
                py3: p[`y${CY - 3}`] ?? 0,
                cy:  p[`y${CY}`]     ?? 0,
                stock: (p.stock ?? 0) + (p.porEmbarcar ?? 0) + dashConfirmado + dashEmbarcado,
                porEmbarcar: 0,
            });
            return enriquecerProducto({ ...p, sugerencia });
        });

        resultados.sort((a, b) => {
            if (a.descartado !== b.descartado) return a.descartado ? 1 : -1;
            return 0;
        });

        return { success: true, data: { productos: resultados, total: resultados.length } };
    };

    getProductos = async () => {
        const todos = await ImblascoProducto.find({
            $or: [
                { [`y${CY - 1}`]: { $gt: 0 } },
                { [`y${CY}`]:     { $gt: 0 } },
            ],
        }).lean();

        if (!todos.length) return { success: true, data: { productos: [], actualizadoEl: null } };

        const actualizadoEl = todos[0]?.syncedAt ?? null;

        const pedidos = await Pedido.find().lean();
        const confirmadosMap = {};
        const embarcadosMap  = {};
        pedidos.forEach(pedido => {
            pedido.productos.forEach(p => {
                if (p.estado === 'confirmado') confirmadosMap[p.cod] = (confirmadosMap[p.cod] || 0) + p.cantidad;
                if (p.estado === 'embarcado')  embarcadosMap[p.cod]  = (embarcadosMap[p.cod]  || 0) + p.cantidad;
            });
        });

        const conCobertura = todos.map(p => {
            const proyeccion      = (p[`y${CY - 1}`] * 0.5) + (p[`y${CY - 2}`] * 0.3) + (p[`y${CY - 3}`] * 0.2);
            const tasaMensual     = proyeccion / 12;
            const dashConfirmado  = confirmadosMap[p.cod] ?? 0;
            const dashEmbarcado   = embarcadosMap[p.cod]  ?? 0;
            const totalDisponible = (p.stock ?? 0) + (p.porEmbarcar ?? 0) + dashConfirmado + dashEmbarcado;
            const mesesCobertura  = tasaMensual > 0 ? totalDisponible / tasaMensual : null;
            const sugerencia      = Math.max(0, Math.round(
                proyeccion - (p[`y${CY}`] ?? 0) - (p.stock ?? 0) - (p.porEmbarcar ?? 0) - dashConfirmado - dashEmbarcado
            ));
            return enriquecerProducto({ ...p, mesesCobertura, sugerencia });
        });

        const aPedir = conCobertura.filter(p => {
            if (p.sugerencia <= 0) return false;
            const proy = (p[`y${CY - 1}`] * 0.5) + (p[`y${CY - 2}`] * 0.3) + (p[`y${CY - 3}`] * 0.2);
            if (proy < 100) return false;
            const tieneActividadReciente = (p[`y${CY - 1}`] ?? 0) > 0 || (p[`y${CY}`] ?? 0) > 0;
            if (!tieneActividadReciente) return false;
            return true;
        });

        aPedir.sort((a, b) => {
            if (a.descartado !== b.descartado) return a.descartado ? 1 : -1;
            const activoCyA = (a[`y${CY}`] ?? 0) > 0 ? 0 : 1;
            const activoCyB = (b[`y${CY}`] ?? 0) > 0 ? 0 : 1;
            if (activoCyA !== activoCyB) return activoCyA - activoCyB;
            if (a.mesesCobertura === null && b.mesesCobertura === null) return 0;
            if (a.mesesCobertura === null) return 1;
            if (b.mesesCobertura === null) return -1;
            return a.mesesCobertura - b.mesesCobertura;
        });

        return { success: true, data: { productos: aPedir, actualizadoEl } };
    };

    actualizarDatos = async () => {
        await Pedido.updateMany(
            { 'productos.estado': 'embarcado' },
            { $set: { 'productos.$[item].estado': 'recibido' } },
            { arrayFilters: [{ 'item.estado': 'embarcado' }] }
        );
        return { success: true };
    };
}
