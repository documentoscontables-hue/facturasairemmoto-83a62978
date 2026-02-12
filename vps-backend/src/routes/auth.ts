import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const result = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Get user role
    const roleResult = await db.query('SELECT role FROM user_roles WHERE user_id = $1', [user.id]);
    const role = roleResult.rows[0]?.role || 'user';

    // Get profile with team
    const profileResult = await db.query('SELECT team_id FROM profiles WHERE user_id = $1', [user.id]);
    const teamId = profileResult.rows[0]?.team_id || null;

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
        team_id: teamId,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    // Create profile
    await db.query('INSERT INTO profiles (user_id, email) VALUES ($1, $2)', [user.id, user.email]);

    // Assign default role
    await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'user')", [user.id]);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'user',
        team_id: null,
      },
    });
  } catch (error: any) {
    console.error('Register error:', error.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/auth/me - Get current user info
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const roleResult = await db.query('SELECT role FROM user_roles WHERE user_id = $1', [req.userId]);
    const profileResult = await db.query('SELECT team_id FROM profiles WHERE user_id = $1', [req.userId]);

    return res.json({
      id: req.userId,
      email: req.userEmail,
      role: roleResult.rows[0]?.role || 'user',
      team_id: profileResult.rows[0]?.team_id || null,
    });
  } catch {
    return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
