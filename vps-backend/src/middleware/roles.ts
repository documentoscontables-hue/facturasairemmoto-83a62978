import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import db from '../db';

export async function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: 'No autenticado' });

    const result = await db.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.userId]
    );

    const userRoles = result.rows.map((r: any) => r.role);
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    next();
  };
}

export function requireAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'No autenticado' });

  db.query('SELECT role FROM user_roles WHERE user_id = $1 AND role IN ($2, $3)', [req.userId, 'admin', 'superadmin'])
    .then(result => {
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos de administrador' });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'Error verificando permisos' }));
}

export async function isAdminOrSuperadmin(userId: string): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('admin', 'superadmin') LIMIT 1",
    [userId]
  );
  return result.rows.length > 0;
}

export async function isCoordinator(userId: string): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'coordinador' LIMIT 1",
    [userId]
  );
  return result.rows.length > 0;
}

export async function getCoordinatorTeamIds(userId: string): Promise<string[]> {
  const result = await db.query(
    'SELECT team_id FROM coordinator_teams WHERE user_id = $1',
    [userId]
  );
  return result.rows.map((r: any) => r.team_id);
}
