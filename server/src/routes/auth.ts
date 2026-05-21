import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { User } from '@devflow/shared';

export const authRouter = new Hono();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'devflow-local-secret-change-me'
);

function parseUser(row: Record<string, unknown>): Omit<User, 'passwordHash'> {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: (row.display_name as string | null) ?? null,
    role: row.role as User['role'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function requireAdminIfRbacEnabled(c: Context): Response | null {
  const rbacEnabledRow = db.prepare("SELECT value FROM settings WHERE key='security.rbacEnabled'").get() as { value: string } | undefined;
  if (rbacEnabledRow?.value !== 'true') return null;
  const user = c.get('user') as { role?: string } | null;
  if (!user) return c.json({ error: 'Unauthorized', requiredRoles: ['admin'], currentRole: null }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden', requiredRoles: ['admin'], currentRole: user.role }, 403);
  return null;
}

export async function createToken(user: { id: string; username: string; role: string }): Promise<string> {
  return new SignJWT({ sub: user.id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ sub: string; username: string; role: string }> {
  const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
  return {
    sub: payload.sub as string,
    username: payload.username as string,
    role: payload.role as string,
  };
}

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// POST /auth/login
authRouter.post('/login', async (c) => {
  const body = LoginSchema.parse(await c.req.json());

  const row = db.prepare('SELECT * FROM users WHERE username=?').get(body.username) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'invalid credentials' }, 401);

  const valid = bcrypt.compareSync(body.password, row.password_hash as string);
  if (!valid) return c.json({ error: 'invalid credentials' }, 401);

  const token = await createToken({
    id: row.id as string,
    username: row.username as string,
    role: row.role as string,
  });

  return c.json({ token, user: parseUser(row) });
});

// POST /auth/logout
authRouter.post('/logout', (c) => {
  return c.json({ ok: true });
});

// GET /auth/me
authRouter.get('/me', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);

  try {
    const payload = await verifyToken(auth.slice(7));
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(payload.sub) as Record<string, unknown> | undefined;
    if (!row) return c.json({ error: 'user not found' }, 401);
    return c.json(parseUser(row));
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
});

// POST /auth/users — admin only, create user
const CreateUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().nullable().optional(),
  role: z.enum(['admin', 'dev', 'qa', 'pm', 'viewer']).optional().default('viewer'),
});

authRouter.post('/users', async (c) => {
  const blocked = requireAdminIfRbacEnabled(c);
  if (blocked) return blocked;

  const body = CreateUserSchema.parse(await c.req.json());
  const existing = db.prepare('SELECT id FROM users WHERE username=?').get(body.username);
  if (existing) return c.json({ error: 'username already exists' }, 409);

  const id = newId('usr');
  const hash = bcrypt.hashSync(body.password, 10);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.username, body.displayName ?? null, body.role, hash, now, now);

  const row = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseUser(row), 201);
});

// GET /auth/users
authRouter.get('/users', (c) => {
  const blocked = requireAdminIfRbacEnabled(c);
  if (blocked) return blocked;

  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return c.json(rows.map(parseUser));
});

// PATCH /auth/users/:id
const PatchUserSchema = z.object({
  displayName: z.string().nullable().optional(),
  role: z.enum(['admin', 'dev', 'qa', 'pm', 'viewer']).optional(),
  password: z.string().min(1).optional(),
});

authRouter.patch('/users/:id', async (c) => {
  const blocked = requireAdminIfRbacEnabled(c);
  if (blocked) return blocked;

  const { id } = c.req.param();
  const body = PatchUserSchema.parse(await c.req.json());

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.displayName !== undefined) { updates.push('display_name=?'); params.push(body.displayName); }
  if (body.role !== undefined) { updates.push('role=?'); params.push(body.role); }
  if (body.password !== undefined) { updates.push('password_hash=?'); params.push(bcrypt.hashSync(body.password, 10)); }

  if (updates.length === 0) {
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, unknown>;
    return c.json(parseUser(row));
  }

  updates.push('updated_at=?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...params);
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseUser(row));
});

// DELETE /auth/users/:id
authRouter.delete('/users/:id', (c) => {
  const blocked = requireAdminIfRbacEnabled(c);
  if (blocked) return blocked;

  const { id } = c.req.param();
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  return c.json({ ok: true });
});
