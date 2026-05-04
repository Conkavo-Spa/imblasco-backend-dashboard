import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLS_PATH = 'C:/Users/Javier/Downloads/TB03_20260429_195134 (1).xls';
const OUT_PATH = path.resolve(__dirname, '../data/catalogo_familias.json');

const workbook = XLSX.readFile(XLS_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const catalogo = {};
let count = 0;

for (const row of rows) {
    const cod = String(row['CODPRO'] ?? '').trim();
    const familia = String(row['FAMILIA'] ?? '').trim().toUpperCase();
    if (cod && familia) {
        catalogo[cod] = familia;
        count++;
    }
}

writeFileSync(OUT_PATH, JSON.stringify(catalogo, null, 2), 'utf8');
console.log(`✅ catalogo_familias.json generado con ${count} productos.`);

const familias = [...new Set(Object.values(catalogo))].sort();
console.log('Familias únicas:', familias);
