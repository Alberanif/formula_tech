import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db.js";
const scrypt = promisify(scryptCallback);
const COOKIE = "ft_session";
const DAYS = 30;
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
async function passwordHash(password, salt) {
  return (await scrypt(password, salt, 64)).toString("hex");
}
async function verifyPassword(password, salt, stored) {
  const candidate = Buffer.from(await passwordHash(password, salt), "hex");
  const expected = Buffer.from(stored, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
function readCookie(header) {
  return header?.split(";").map((item) => item.trim()).find((item) => item.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || null;
}
async function currentUser(cookieHeader) {
  const token = readCookie(cookieHeader);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const result = await pool.query(`select u.id,u.role from public.app_sessions s join public.app_users u on u.id=s.user_id
    where s.token_hash=$1 and s.expires_at>now()`, [tokenHash(token)]);
  return result.rows[0] || null;
}
async function createSession(userId, oldCookie) {
  const old = readCookie(oldCookie);
  if (old) await pool.query("delete from public.app_sessions where token_hash=$1", [tokenHash(old)]);
  const token = randomBytes(32).toString("hex");
  await pool.query(`insert into public.app_sessions(token_hash,user_id,expires_at)
    values($1,$2,now()+interval '30 days')`, [tokenHash(token), userId]);
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DAYS * 86400}${process.env.VERCEL ? "; Secure" : ""}`;
}
export {
  createSession,
  currentUser,
  passwordHash,
  readCookie,
  verifyPassword
};
