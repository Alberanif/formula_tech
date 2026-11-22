import { config } from 'dotenv';
import { Pool } from 'pg';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada no servidor.');
if (!process.env.ROOM_CODE_PEPPER || process.env.ROOM_CODE_PEPPER.length < 32) throw new Error('ROOM_CODE_PEPPER precisa de pelo menos 32 caracteres.');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
