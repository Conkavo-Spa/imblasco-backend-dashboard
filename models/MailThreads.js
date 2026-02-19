import mongoose from 'mongoose';
import { conversationMailDashSchema } from './ConversationMailDash.js';

/**
 * Modelo para hilos de mail en la base de datos stockf, colección mailthreads.
 * Solo lectura desde este dashboard.
 */
const stockfDb = mongoose.connection.useDb('stockf');
const MailThreads = stockfDb.model('MailThread', conversationMailDashSchema, 'mailthreads');

export default MailThreads;
