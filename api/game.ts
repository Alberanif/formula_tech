import { randomUUID } from 'node:crypto';
import { pool } from '../server/db.ts';
import { createSession, currentUser, verifyPassword } from '../server/session.ts';
import { mutator, publicState, hash, code, clean, err, now } from '../server/core.ts';
import { VERSION, CIRCUITS, fixedCost } from '../shared/game.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (res: any, status: number, body: any) => res.status(status).json(body);

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, {ok:false,code:'METHOD_NOT_ALLOWED'});
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== host) return json(res, 403, {ok:false,code:'NOT_AUTHORIZED',message:'Origem não autorizada.'}); }
    catch { return json(res, 403, {ok:false,code:'NOT_AUTHORIZED',message:'Origem não autorizada.'}); }
  }
  try {
    const p = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const action = String(p.action || '');
    const actor = await currentUser(req.headers.cookie);
    let user: string | null = actor?.id || null;

    if (action === 'session') return json(res, 200, {ok:true,data:{user:actor}});
    if (action === 'student-auth') {
      if (actor?.role === 'student') return json(res, 200, {ok:true,data:{user:actor}});
      if (actor?.role === 'teacher') err('NOT_AUTHORIZED','Abra uma janela privada para entrar como aluno.');
      const result = await pool.query(`insert into public.app_users(role) values('student') returning id,role`);
      const student = result.rows[0];
      res.setHeader('Set-Cookie', await createSession(student.id, req.headers.cookie));
      return json(res, 200, {ok:true,data:{user:student}});
    }
    if (action === 'teacher-login') {
      const email = clean(p.email, 200).toLowerCase();
      const password = String(p.password || '');
      if (!email || password.length > 1024) err('INVALID_LOGIN','Credenciais inválidas.');
      const recent = await pool.query(`select count(*)::int as total from public.teacher_login_attempts
        where email=$1 and attempted_at>now()-interval '15 minutes'`, [email]);
      if (recent.rows[0].total >= 10) err('RATE_LIMITED','Muitas tentativas. Aguarde 15 minutos.');
      const result = await pool.query(`select a.user_id,a.salt,a.password_hash from public.teacher_accounts a where a.email=$1`, [email]);
      const record = result.rows[0];
      const valid = record && await verifyPassword(password, record.salt, record.password_hash);
      if (!valid) {
        await pool.query('insert into public.teacher_login_attempts(email) values($1)', [email]);
        err('INVALID_LOGIN','E-mail ou senha incorretos.');
      }
      await pool.query('delete from public.teacher_login_attempts where email=$1', [email]);
      res.setHeader('Set-Cookie', await createSession(record.user_id, req.headers.cookie));
      return json(res, 200, {ok:true,data:{user:{id:record.user_id,role:'teacher'}}});
    }

    const projection = action === 'state' && Boolean(p.projectionToken);
    if (!user && !projection) err('NOT_AUTHORIZED','Entre na sala para continuar.');
    if (action === 'create-room') {
      if (actor?.role !== 'teacher') err('NOT_AUTHORIZED','Entre como professor.');
      const name = clean(p.name,80);
      if (name.length < 3) err('INVALID_NAME','Informe o nome da atividade.');
      const circuitId = CIRCUITS[p.circuitId] ? p.circuitId : 'balance';
      const maxPlayers = Number(p.maxPlayers) || 10, carsPerHeat = Number(p.carsPerHeat) || 5;
      if (!Number.isInteger(maxPlayers) || !Number.isInteger(carsPerHeat) || maxPlayers < 1 || maxPlayers > 20 || carsPerHeat < 1 || carsPerHeat > 5 || Math.ceil(maxPlayers/carsPerHeat)>5) err('INVALID_HEAT_SIZE','Use 1 a 20 equipes, 1 a 5 carros por bateria e no máximo cinco classificatórias.');
      const roomCode=code(),projectionToken=code(16);
      const data={phase:'LOBBY',circuitId,mode:p.mode==='extended'?'extended':'standard',market:'M0',qteEnabled:p.qteEnabled!==false,maxPlayers,carsPerHeat,teams:{},heats:[],events:[],awards:{},configVersion:VERSION};
      const result=await pool.query(`insert into public.game_rooms(teacher_user_id,code_hash,code_display,projection_hash,name,data)
        values($1,$2,$3,$4,$5,$6::jsonb) returning id`,[user,await hash(roomCode),roomCode,await hash(projectionToken),name,JSON.stringify(data)]);
      return json(res,200,{ok:true,data:{roomId:result.rows[0].id,code:roomCode,projectionToken}});
    }

    let room: any;
    if (action === 'join-room') {
      if (actor?.role !== 'student') err('NOT_AUTHORIZED','Use uma sessão de aluno para entrar.');
      const attempts=await pool.query(`select count(*)::int as total from public.game_join_attempts
        where user_id=$1 and attempted_at>now()-interval '1 minute'`,[user]);
      if (attempts.rows[0].total>=8) err('RATE_LIMITED','Muitas tentativas de entrada. Aguarde um minuto.');
      await pool.query('insert into public.game_join_attempts(user_id) values($1)',[user]);
      const value=clean(p.code,12).toUpperCase();
      if (!/^[A-Z2-9]{8}$/.test(value)) err('ROOM_NOT_FOUND','Código inválido.');
      room=(await pool.query('select * from public.game_rooms where code_hash=$1',[await hash(value)])).rows[0];
    } else {
      if (!uuid.test(String(p.roomId||''))) err('ROOM_NOT_FOUND','Sala não encontrada.');
      room=(await pool.query('select * from public.game_rooms where id=$1',[p.roomId])).rows[0];
    }
    if (!room) err('ROOM_NOT_FOUND','Sala não encontrada.');
    room.version=Number(room.version);
    if (action==='join-room' && new Date(room.code_expires_at).getTime()<now()) err('ROOM_CLOSED','O código desta sala expirou.');
    if (projection) {
      if (await hash(String(p.projectionToken)) !== room.projection_hash) err('NOT_AUTHORIZED','Link de projeção inválido.');
      return json(res,200,{ok:true,data:publicState(room,null,true)});
    }
    const isTeacher=room.teacher_user_id===user;
    const member=Object.values(room.data.teams).some((t:any)=>t.owner===user&&!t.removed);
    if (action!=='join-room' && !isTeacher && !member) err('NOT_AUTHORIZED','Você não pertence a esta sala.');
    if (member) await pool.query(`insert into public.game_presence(room_id,user_id,last_seen_at) values($1,$2,now())
      on conflict(room_id,user_id) do update set last_seen_at=now()`,[room.id,user]);
    if (action==='state') return json(res,200,{ok:true,data:publicState(room,user)});
    if (action==='rotate-access') {
      if (!isTeacher) err('NOT_AUTHORIZED','Apenas o professor pode fazer isso.');
      if (!['code','projection'].includes(p.kind)) err('INVALID_ACTION','Tipo de acesso inválido.');
      const token=code(p.kind==='code'?8:16);
      const rotated=await pool.query('select public.rotate_game_access($1,$2,$3,$4,$5) as result',[room.id,user,p.kind,await hash(token),p.kind==='code'?token:null]);
      if (!rotated.rows[0].result) err('NOT_AUTHORIZED','Não foi possível renovar o acesso.');
      return json(res,200,{ok:true,data:{kind:p.kind,token}});
    }
    if (action==='export-session') {
      if (!isTeacher) err('NOT_AUTHORIZED','Apenas o professor pode fazer isso.');
      const rows=[['Escuderia','Saldo','Investimento fixo','Teste 1 (s)','Teste 2 (s)','Hipótese','Conclusão','Classificatória (s)','Final (s)']];
      for (const t of Object.values(room.data.teams) as any[]) {
        const q=room.data.heats.flatMap((h:any)=>h.type==='qualifier'?h.participants.filter((x:any)=>x.teamId===t.id).map((x:any)=>x.final/1000):[])[0]||'';
        const f=room.data.heats.flatMap((h:any)=>h.type==='final'?h.participants.filter((x:any)=>x.teamId===t.id).map((x:any)=>x.final/1000):[])[0]||'';
        rows.push([t.name,t.wallet,fixedCost(t),t.tests[0]?.result.total||'',t.tests[1]?.result.total||'',`${t.analysis.target||''} ${t.analysis.change||''} ${t.analysis.reason||''}`,t.analysis.evidence||'',q,f]);
      }
      const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
      return json(res,200,{ok:true,data:{csv}});
    }
    if (!uuid.test(String(p.requestId||''))) err('INVALID_REQUEST','Identificador de ação inválido.');
    const prior=await pool.query('select response,actor_user_id from public.game_requests where room_id=$1 and request_id=$2',[room.id,p.requestId]);
    if (prior.rows[0]) {
      if (prior.rows[0].actor_user_id!==user) err('NOT_AUTHORIZED','Esta ação pertence a outra sessão.');
      return json(res,200,prior.rows[0].response);
    }
    if (action==='sync-race') {
      const presence=await pool.query(`select user_id from public.game_presence where room_id=$1 and last_seen_at>now()-interval '10 seconds'`,[room.id]);
      p.activeTeamIds=Object.values(room.data.teams).filter((t:any)=>presence.rows.some(x=>x.user_id===t.owner)).map((t:any)=>t.id);
    }
    const copy=structuredClone(room.data),beforeVersion=room.version;
    const mutation=mutator(room,copy,action,p,user!);
    if (action==='sync-race' && JSON.stringify(copy)===JSON.stringify(room.data)) return json(res,200,{ok:true,code:'OK',data:mutation.result,current_version:room.version});
    const response={ok:true,code:'OK',message:'Ação concluída.',data:mutation.result};
    const committed=await pool.query(`select public.commit_game_room($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) as result`,
      [room.id,beforeVersion,p.requestId,user,action,JSON.stringify(mutation.data),JSON.stringify(response),JSON.stringify(mutation.audit),JSON.stringify(mutation.finances)]);
    const result=committed.rows[0].result;
    return json(res,result.code==='CONFLICT_RELOAD_REQUIRED'?409:200,result);
  } catch (e:any) {
    const known = ['NOT_AUTHORIZED','INVALID_LOGIN','RATE_LIMITED','ROOM_NOT_FOUND','ROOM_CLOSED','INVALID_NAME','INVALID_HEAT_SIZE','INVALID_REQUEST','INVALID_ACTION','INVALID_ROOM_STATE','INSUFFICIENT_FUNDS','MISSING_SUPPLIES','INVALID_TEAM_NAME','INVALID_COLOR','ROOM_FULL'];
    if (!known.includes(e?.code) && e?.code) console.error('Game API:', e.code);
    if (!e?.code) console.error('Game API:', e);
    const code=known.includes(e?.code)?e.code:'SERVER_ERROR';
    return json(res,code==='NOT_AUTHORIZED'?403:code==='RATE_LIMITED'?429:code==='SERVER_ERROR'?500:400,
      {ok:false,code,message:code==='SERVER_ERROR'?'Falha temporária. Tente novamente.':e.message,details:code==='SERVER_ERROR'?{}:e?.details||{}});
  }
}
