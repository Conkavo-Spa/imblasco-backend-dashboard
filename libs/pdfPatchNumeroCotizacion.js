import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Parchea el PDF usando metadata PDF_PATCH_1 (coordenadas PDFKit: origen arriba-izquierda, y = baseline).
 * @param {string} pdfBase64
 * @param {object} pdfPatchRoot - { schema_version, numero_cotizacion: { page, x, y, w, h, fontSize } }
 * @param {string} numeroTexto - hasta 7 dígitos recomendado
 * @returns {Promise<string>} base64 del PDF modificado
 */
export async function patchPdfBase64WithNumero(pdfBase64, pdfPatchRoot, numeroTexto) {
    const patch = pdfPatchRoot?.numero_cotizacion;
    if (!patch || typeof patch !== 'object') {
        const err = new Error('pdf_patch.numero_cotizacion ausente');
        err.code = 'PDF_PATCH_MISSING';
        throw err;
    }

    const pageIndex = Math.max(1, Number(patch.page) || 1) - 1;
    const x = Number(patch.x);
    const yKit = Number(patch.y);
    const w = Number(patch.w) || 100;
    const h = Number(patch.h) || 22;
    const fontSize = Number(patch.fontSize) || 18;

    if (!Number.isFinite(x) || !Number.isFinite(yKit)) {
        const err = new Error('pdf_patch: x/y inválidos');
        err.code = 'PDF_PATCH_INVALID';
        throw err;
    }

    const bytes = Buffer.from(String(pdfBase64).trim(), 'base64');
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    const page = pages[pageIndex];
    if (!page) {
        const err = new Error(`pdf_patch: página ${pageIndex + 1} no existe`);
        err.code = 'PDF_PATCH_PAGE';
        throw err;
    }

    const pageHeight = page.getHeight();
    /** PDFKit: baseline medido desde arriba; pdf-lib: baseline desde abajo */
    const yBaselinePdf = pageHeight - yKit;

    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const text = String(numeroTexto ?? '').slice(0, 7);

    page.drawRectangle({
        x: x - 1,
        y: yBaselinePdf - 3,
        width: w + 2,
        height: h,
        color: rgb(1, 1, 1),
    });

    page.drawText(text, {
        x,
        y: yBaselinePdf,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
    });

    const out = await doc.save();
    return Buffer.from(out).toString('base64');
}
