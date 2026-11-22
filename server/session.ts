import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.ts';

const scrypt = promisify(scryptCallback);
const COOKIE = 'ft_session';
const DAYS = 30;
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function passwordHash(password: string, salt: string) {
  return (await scrypt(password, salt, 64) as Buffer).toString('hex');
}

export async function verifyPassword(password: string, salt: string, stored: string) {
  const candidate = Buffer.from(await passwordHash(password, salt), 'hex');
  const expected = Buffer.from(stored, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function readCookie(header: string | undefined) {
  return header?.split(';').map(item => item.trim()).find(item => item.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || null;
}

export async function currentUser(cookieHeader: string | undefined) {
  const token = readCookie(cookieHeader);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const result = await pool.query(`select u.id,u.role from public.app_sessions s join public.app_users u on u.id=s.user_id
    where s.token_hash=$1 and s.expires_at>now()`, [tokenHash(token)]);
  return result.rows[0] || null;
}

export async function createSession(userId: string, oldCookie?: string) {
  const old = readCookie(oldCookie);
  if (old) await pool.query('delete from public.app_sessions where token_hash=$1', [tokenHash(old)]);
  const token = randomBytes(32).toString('hex');
  await pool.query(`insert into public.app_sessions(token_hash,user_id,expires_at)
    values($1,$2,now()+interval '30 days')`, [tokenHash(token), userId]);
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}${process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : ''}`;
}
