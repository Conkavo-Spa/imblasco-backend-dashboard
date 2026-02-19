import mongoose from 'mongoose';
import { conversationSchema } from './Conversations.js';

/**
 * Modelo para hilos de chat en la base de datos stockf, colección chatthreads.
 * Solo lectura desde este dashboard.
 */
const stockfDb = mongoose.connection.useDb('stockf');
const ChatThreads = stockfDb.model('ChatThread', conversationSchema, 'chatthreads');

export default ChatThreads;
