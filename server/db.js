import { config } from "dotenv";
import { Pool } from "pg";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
function assertServerConfig() {
  if (!process.env.DATABASE_URL) throw { code: "SERVER_CONFIG_MISSING", message: "DATABASE_URL não configurada no servidor." };
  if (!process.env.ROOM_CODE_PEPPER || process.env.ROOM_CODE_PEPPER.length < 32) throw { code: "SERVER_CONFIG_MISSING", message: "ROOM_CODE_PEPPER precisa de pelo menos 32 caracteres." };
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4
});
export {
  assertServerConfig,
  pool
};
