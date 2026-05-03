import mongoose from 'mongoose';

const syncTriggerSchema = new mongoose.Schema({
    status:       { type: String, enum: ['pending', 'running', 'done', 'error'], default: 'pending' },
    requestedAt:  { type: Date, default: Date.now },
    completedAt:  { type: Date },
    updatedCount: { type: Number },
    error:        { type: String },
}, {
    collection: 'sync_triggers',
    timestamps: false,
});

export default mongoose.model('SyncTrigger', syncTriggerSchema);
