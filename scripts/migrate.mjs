import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import pg from 'pg';

config({path:'.env.local',quiet:true});
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL não configurada.');
const client = new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
try {
  await client.connect();
  const sql = await readFile(new URL('../db/001_foundation.sql',import.meta.url),'utf8');
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  const result=await client.query(`select count(*)::int as tables from information_schema.tables where table_schema='public' and table_name in ('app_users','app_sessions','teacher_accounts','game_rooms','game_requests','game_audit','financial_events')`);
  console.log(`Migração Neon aplicada; ${result.rows[0].tables} tabelas principais verificadas.`);
} catch (error) {
  await client.query('rollback').catch(()=>{});
  console.error('Falha na migração:',error.message);
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
