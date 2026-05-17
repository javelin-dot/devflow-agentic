import type { Context, Next } from 'hono';
import { verifyToken } from '../routes/auth.js';
import { db } from '../db/index.js';
import type { Role } from '@devflow/shared';

export async function authGuard(c: Context, next: Next): Promise<void> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    c.set('user', null);
    return next();
  }

  try {
    const payload = await verifyToken(auth.slice(7));
    c.set('user', payload);
  } catch {
    c.set('user', null);
  }

  return next();
}

export function requireAuth(c: Context): { id: string; username: string; role: Role } {
  const user = c.get('user');
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export function rbacGuard(...allowedRoles: Role[]) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const rbacEnabledRow = db.prepare("SELECT value FROM settings WHERE key='security.rbacEnabled'").get() as { value: string } | undefined;
    const rbacEnabled = rbacEnabledRow?.value === 'true';
    if (!rbacEnabled) {
      return next();
    }

    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized', requiredRoles: allowedRoles, currentRole: null }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: 'Forbidden', requiredRoles: allowedRoles, currentRole: user.role }, 403);
    }

    return next();
  };
}
