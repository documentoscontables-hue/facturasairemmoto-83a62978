import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import db from '../db';
import { uploadFile, getFileBuffer, deleteFile } from '../storage';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function sanitizeFileName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseExcelToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let fullText = '';
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
    fullText += `=== Hoja: ${sheetName} ===\n${csv}\n\n`;
  }
  return fullText;
}

// GET /api/account-books
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT * FROM account_books WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/account-books/accounts
router.get('/accounts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT * FROM accounts WHERE user_id = $1 ORDER BY account_code',
      [req.userId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/account-books/upload
router.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No se proporcionó archivo' });

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!['pdf', 'xlsx', 'xls'].includes(ext || '')) {
      return res.status(400).json({ error: 'Formato no soportado. Use PDF o Excel.' });
    }

    const sanitized = sanitizeFileName(file.originalname);
    const filePath = `${req.userId}/${Date.now()}-${sanitized}`;

    await uploadFile('account-books', filePath, file.buffer, file.mimetype);

    const result = await db.query(
      'INSERT INTO account_books (user_id, file_name, file_path) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, file.originalname, filePath]
    );

    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/account-books/:id/parse
router.post('/:id/parse', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const bookResult = await db.query(
      'SELECT * FROM account_books WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (bookResult.rows.length === 0) return res.status(404).json({ error: 'Libro no encontrado' });

    const book = bookResult.rows[0];
    const fileBuffer = await getFileBuffer('account-books', book.file_path);

    const fileExt = book.file_name.split('.').pop()?.toLowerCase();
    const isExcel = ['xlsx', 'xls'].includes(fileExt || '');
    const isPdf = fileExt === 'pdf';

    const PARSE_PROMPT = `Eres un experto en contabilidad española. Tu tarea es extraer las cuentas contables de este libro/plan de cuentas.

El documento puede contener un listado de cuentas contables con su código y descripción.

Responde SOLO con JSON válido sin markdown:
{
  "accounts": [
    { "code": "100", "description": "Capital social" }
  ],
  "total_found": 2
}`;

    let aiRequestBody: any;

    if (isExcel) {
      const excelText = parseExcelToText(fileBuffer);
      aiRequestBody = {
        contents: [{ parts: [{ text: PARSE_PROMPT }, { text: `Contenido del archivo Excel:\n\n${excelText}` }] }],
        generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 8192 },
      };
    } else if (isPdf) {
      const base64 = fileBuffer.toString('base64');
      aiRequestBody = {
        contents: [{
          parts: [
            { text: PARSE_PROMPT },
            { text: 'Extrae todas las cuentas contables de este documento:' },
            { inline_data: { mime_type: 'application/pdf', data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 8192 },
      };
    } else {
      return res.status(400).json({ error: `Tipo de archivo no soportado: ${fileExt}` });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aiRequestBody) }
    );

    if (!aiResponse.ok) throw new Error('AI parsing failed');

    const aiData: any = await aiResponse.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('No response from AI');

    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    const accounts = parsed.accounts || [];

    // Delete existing accounts for this book
    await db.query('DELETE FROM accounts WHERE book_id = $1', [req.params.id]);

    // Insert new accounts
    if (accounts.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      accounts.forEach((acc: any, i: number) => {
        const offset = i * 4;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
        values.push(req.params.id, req.userId, acc.code, acc.description);
      });

      await db.query(
        `INSERT INTO accounts (book_id, user_id, account_code, account_description) VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    return res.json({ success: true, accounts_count: accounts.length, accounts: accounts.slice(0, 10) });
  } catch (error: any) {
    console.error('Book parsing error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/account-books/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM account_books WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Libro no encontrado' });

    await deleteFile('account-books', result.rows[0].file_path);
    await db.query('DELETE FROM accounts WHERE book_id = $1', [req.params.id]);
    await db.query('DELETE FROM account_books WHERE id = $1', [req.params.id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
