import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { requireAdminMiddleware } from '../middleware/roles';
import db from '../db';

const router = Router();

// GET /api/admin/users - Get all users with stats
router.get('/users', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(`
      SELECT 
        p.user_id, p.email, p.team_id, p.created_at,
        ur.role,
        COUNT(i.id) AS total_invoices,
        COUNT(CASE WHEN i.classification_status = 'classified' THEN 1 END) AS classified_invoices,
        COUNT(CASE WHEN i.classification_status = 'pending' THEN 1 END) AS pending_invoices
      FROM profiles p
      LEFT JOIN user_roles ur ON p.user_id = ur.user_id
      LEFT JOIN invoices i ON p.user_id = i.user_id
      GROUP BY p.user_id, p.email, p.team_id, p.created_at, ur.role
      ORDER BY p.created_at DESC
    `);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/create-user
router.post('/create-user', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, role, team_id, coordinator_team_ids } = req.body;

    if (!email || !password || !role) {
      return res.json({ error: 'Email, contraseña y rol son requeridos' });
    }
    if (!['admin', 'coordinador', 'user'].includes(role)) {
      return res.json({ error: 'Rol inválido' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), passwordHash]
    );
    const userId = userResult.rows[0].id;

    // Create profile
    await db.query('INSERT INTO profiles (user_id, email, team_id) VALUES ($1, $2, $3)',
      [userId, email.toLowerCase(), team_id || null]);

    // Assign role
    await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, role]);

    // Assign coordinator teams
    if (role === 'coordinador' && coordinator_team_ids?.length > 0) {
      for (const tid of coordinator_team_ids) {
        await db.query('INSERT INTO coordinator_teams (user_id, team_id) VALUES ($1, $2)', [userId, tid]);
      }
    }

    return res.json({ success: true, user_id: userId });
  } catch (error: any) {
    console.error('Create user error:', error.message);
    return res.json({ error: error.message });
  }
});

// POST /api/admin/delete-user
router.post('/delete-user', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

    // Check if target is superadmin
    const roleResult = await db.query(
      "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'superadmin'", [user_id]
    );
    if (roleResult.rows.length > 0) {
      return res.status(400).json({ error: 'No se puede eliminar al SuperAdmin' });
    }

    // Clean up related data (cascading delete handles most, but be explicit)
    await db.query('DELETE FROM coordinator_teams WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM classification_feedback WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM invoices WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM accounts WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM account_books WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM profiles WHERE user_id = $1', [user_id]);
    await db.query('DELETE FROM users WHERE id = $1', [user_id]);

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// GET /api/admin/teams
router.get('/teams', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query('SELECT * FROM teams ORDER BY created_at');
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/teams
router.post('/teams', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });

    const result = await db.query('INSERT INTO teams (name) VALUES ($1) RETURNING *', [name]);
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/teams/:id
router.delete('/teams/:id', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await db.query('DELETE FROM teams WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:userId/role
router.put('/users/:userId/role', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    await db.query('UPDATE user_roles SET role = $1 WHERE user_id = $2', [role, req.params.userId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:userId/team
router.put('/users/:userId/team', authMiddleware, requireAdminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { team_id } = req.body;
    await db.query('UPDATE profiles SET team_id = $1 WHERE user_id = $2', [team_id || null, req.params.userId]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/coordinator-teams/:userId
router.get('/coordinator-teams/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT team_id FROM coordinator_teams WHERE user_id = $1',
      [req.params.userId]
    );
    return res.json(result.rows.map((r: any) => r.team_id));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
