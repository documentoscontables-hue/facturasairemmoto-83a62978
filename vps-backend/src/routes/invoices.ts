import { Router, Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { isAdminOrSuperadmin, isCoordinator, getCoordinatorTeamIds } from '../middleware/roles';
import db from '../db';
import { uploadFile, getFileBuffer, getSignedDownloadUrl, deleteFile, deleteFiles } from '../storage';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Sanitize file names
function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

// GET /api/invoices - Get user's invoices
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices/upload - Upload invoices
router.post('/upload', authMiddleware, upload.array('files', 50), async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const clientName = req.body.client_name;

    if (!clientName?.trim()) {
      return res.status(400).json({ error: 'El nombre del cliente es requerido' });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron archivos' });
    }

    const results: { file: string; success: boolean; error?: string }[] = [];

    for (const file of files) {
      try {
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        const isPdf = ext === 'pdf';
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext || '');

        if (!isPdf && !isImage) {
          results.push({ file: file.originalname, success: false, error: 'Formato no soportado' });
          continue;
        }

        const sanitized = sanitizeFileName(file.originalname);
        const filePath = `${req.userId}/${Date.now()}-${sanitized}`;

        await uploadFile('invoices', filePath, file.buffer, file.mimetype);

        await db.query(
          `INSERT INTO invoices (user_id, file_name, file_path, file_type, client_name)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.userId, file.originalname, filePath, isPdf ? 'pdf' : 'image', clientName.trim()]
        );

        results.push({ file: file.originalname, success: true });
      } catch (err: any) {
        results.push({ file: file.originalname, success: false, error: err.message });
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length === 0 && failed.length > 0) {
      return res.status(400).json({ error: 'Todas las subidas fallaron', results });
    }

    return res.json({ successful, failed });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/invoices/:id - Update invoice classification
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { invoice_type, operation_type, classification_status, feedback_status, assigned_account } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (invoice_type !== undefined) { updates.push(`invoice_type = $${idx++}`); values.push(invoice_type); }
    if (operation_type !== undefined) { updates.push(`operation_type = $${idx++}`); values.push(operation_type); }
    if (classification_status !== undefined) { updates.push(`classification_status = $${idx++}`); values.push(classification_status); }
    if (feedback_status !== undefined) { updates.push(`feedback_status = $${idx++}`); values.push(feedback_status); }
    if (assigned_account !== undefined) { updates.push(`assigned_account = $${idx++}`); values.push(assigned_account); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(req.params.id, req.userId);
    await db.query(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
      values
    );

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM invoices WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    await deleteFile('invoices', result.rows[0].file_path);
    await db.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices/delete-batch
router.post('/delete-batch', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.status(400).json({ error: 'No hay IDs' });

    const result = await db.query(
      'SELECT id, file_path FROM invoices WHERE id = ANY($1) AND user_id = $2',
      [ids, req.userId]
    );

    const filePaths = result.rows.map((r: any) => r.file_path);
    const invoiceIds = result.rows.map((r: any) => r.id);

    await deleteFiles('invoices', filePaths);
    await db.query('DELETE FROM invoices WHERE id = ANY($1)', [invoiceIds]);

    return res.json({ success: true, count: invoiceIds.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices/:id/classify
router.post('/:id/classify', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const invoiceResult = await db.query('SELECT * FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const invoice = invoiceResult.rows[0];
    if (!invoice.client_name) {
      return res.status(400).json({ error: 'El nombre del cliente es requerido para clasificar' });
    }

    // Get feedback history
    const feedbackResult = await db.query(
      `SELECT original_invoice_type, original_operation_type, corrected_invoice_type, corrected_operation_type
       FROM classification_feedback WHERE user_id = $1 AND is_correct = false ORDER BY created_at DESC LIMIT 10`,
      [req.userId]
    );

    let feedbackPromptSection = '';
    if (feedbackResult.rows.length > 0) {
      const corrections = feedbackResult.rows.map((f: any, i: number) =>
        `  ${i + 1}. La IA clasificó como tipo="${f.original_invoice_type}", operación="${f.original_operation_type}" → El usuario corrigió a tipo="${f.corrected_invoice_type}", operación="${f.corrected_operation_type}"`
      ).join('\n');
      feedbackPromptSection = `\n\n**CORRECCIONES ANTERIORES DEL USUARIO (aprende de estos errores y NO los repitas):**\n${corrections}\n`;
    }

    // Check if user has account book
    const accountsResult = await db.query('SELECT id FROM accounts WHERE user_id = $1 LIMIT 1', [req.userId]);
    const hasAccountBook = accountsResult.rows.length > 0;

    // Get file from MinIO
    const fileBuffer = await getFileBuffer('invoices', invoice.file_path);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = invoice.file_type === 'pdf' ? 'application/pdf' : 'image/jpeg';

    // Import the classify logic
    const { classifyInvoice } = await import('../services/gemini');
    const result = await classifyInvoice(invoice, base64Data, mimeType, feedbackPromptSection, hasAccountBook, req.userId!);

    return res.json(result);
  } catch (error: any) {
    console.error('Classification error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/invoices/:id/feedback
router.post('/:id/feedback', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { is_correct, original_invoice_type, original_operation_type, corrected_invoice_type, corrected_operation_type } = req.body;

    await db.query(
      `INSERT INTO classification_feedback (invoice_id, user_id, is_correct, original_invoice_type, original_operation_type, corrected_invoice_type, corrected_operation_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.params.id, req.userId, is_correct, original_invoice_type, original_operation_type, corrected_invoice_type || null, corrected_operation_type || null]
    );

    const feedbackStatus = is_correct ? 'correct' : 'corrected';
    const updateFields: any = { feedback_status: feedbackStatus };

    if (!is_correct && corrected_invoice_type && corrected_operation_type) {
      await db.query(
        'UPDATE invoices SET feedback_status = $1, invoice_type = $2, operation_type = $3 WHERE id = $4',
        [feedbackStatus, corrected_invoice_type, corrected_operation_type, req.params.id]
      );
    } else {
      await db.query('UPDATE invoices SET feedback_status = $1 WHERE id = $2', [feedbackStatus, req.params.id]);
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/invoices/:id/download-url
router.get('/:id/download-url', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Check ownership or admin
    const admin = await isAdminOrSuperadmin(req.userId!);
    let query = 'SELECT file_path FROM invoices WHERE id = $1';
    const params: any[] = [req.params.id];

    if (!admin) {
      query += ' AND user_id = $2';
      params.push(req.userId);
    }

    const result = await db.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });

    const url = await getSignedDownloadUrl('invoices', result.rows[0].file_path, 300);
    return res.json({ url });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/invoices/admin/:userId - Admin get invoices for a user
router.get('/admin/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const admin = await isAdminOrSuperadmin(req.userId!);
    const coordinator = await isCoordinator(req.userId!);

    if (!admin && !coordinator) {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    if (coordinator && !admin) {
      const teamIds = await getCoordinatorTeamIds(req.userId!);
      const profileResult = await db.query(
        'SELECT team_id FROM profiles WHERE user_id = $1', [req.params.userId]
      );
      const targetTeam = profileResult.rows[0]?.team_id;
      if (!targetTeam || !teamIds.includes(targetTeam)) {
        return res.status(403).json({ error: 'No tienes permisos para este usuario' });
      }
    }

    const result = await db.query(
      'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
