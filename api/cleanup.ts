import { pool, assertServerConfig } from '../server/db.js';

export async function cleanup() {
  const rooms=await pool.query(`delete from public.game_rooms where closed_at<now()-interval '30 days'`);
  const sessions=await pool.query(`delete from public.app_sessions where expires_at<now()`);
  await pool.query(`delete from public.game_join_attempts where attempted_at<now()-interval '1 day'`);
  await pool.query(`delete from public.teacher_login_attempts where attempted_at<now()-interval '1 day'`);
  await pool.query(`delete from public.app_users u where u.role='student' and u.created_at<now()-interval '30 days'
    and not exists(select 1 from public.game_presence p where p.user_id=u.id)
    and not exists(select 1 from public.app_sessions s where s.user_id=u.id)`);
  return {rooms:rooms.rowCount,sessions:sessions.rowCount};
}

export default async function handler(req:any,res:any) {
  if (req.method!=='GET') return res.status(405).json({ok:false});
  if (!process.env.CRON_SECRET || req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ok:false});
  try { assertServerConfig(); return res.status(200).json({ok:true,data:await cleanup()}); }
  catch (error) { console.error('Cleanup:',error);return res.status(500).json({ok:false}); }
}
