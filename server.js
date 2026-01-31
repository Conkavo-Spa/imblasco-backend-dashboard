import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';
import connectMongoDB from './libs/mongoose.js';

// Permite elegir archivo de variables por ambiente:
// ENV_FILE=.env.production npm start
// ENV_FILE=.env.staging npm run staging
// ENV_FILE=.env.development npm run dev
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = process.env.ENV_FILE || '.env';
const envPath = path.isAbsolute(envFile) ? envFile : path.resolve(__dirname, envFile);

const dotenvResult = dotenv.config({ path: envPath, override: true });
if (dotenvResult.error && !process.env.MONGO_URI) {
    console.error(`❌ No se pudo cargar archivo de entorno: ${envPath}`);
    console.error(dotenvResult.error);
}

const app = express();

// Conectar a MongoDB antes de levantar el servidor
await connectMongoDB();

// Middleware CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // Postman/curl
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (isDev && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
        return callback(new Error('CORS bloqueado'), false);
    },
    credentials: true,
}));

// Middleware de subida de archivos (DEBE ir antes de express.json())
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './tmp',
    createParentPath: true // crea carpetas si no existen
}));

// Middleware para JSON
app.use(express.json());

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

import AdminConversationsRoutes from './routes/admin/adminConversationsRoutes.js';
import AdminEmailConversationsRoutes from './routes/admin/adminEmailConversationsRoutes.js';

app.use('/api', AdminConversationsRoutes);
app.use('/api', AdminEmailConversationsRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor funcionando' });
});

// Iniciar servidor
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en http://0.0.0.0:${PORT}`);
});

