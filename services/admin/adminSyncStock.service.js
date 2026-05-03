import SyncTrigger from '../../models/SyncTrigger.js';

export default class AdminSyncStockService {

    triggerSync = async () => {
        const STALE_MS = 15 * 60 * 1000;
        const hace5min = new Date(Date.now() - STALE_MS);
        const activo = await SyncTrigger.findOne({
            status: { $in: ['pending', 'running'] },
            requestedAt: { $gte: hace5min },
        });
        if (activo) {
            return { success: false, message: 'Ya hay una sincronización en curso.' };
        }
        await SyncTrigger.create({ status: 'pending', requestedAt: new Date() });
        return { success: true };
    };

    getStatus = async () => {
        const ultimo = await SyncTrigger.findOne().sort({ requestedAt: -1 }).lean();
        return { success: true, data: ultimo };
    };
}
