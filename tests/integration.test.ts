import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import handler from '../api/game.ts';
import { pool } from '../server/db.ts';
import { passwordHash } from '../server/session.ts';

test('Neon: sessão, autorização, sala, inscrição e idempotência', async () => {
  const email=`smoke-${randomUUID()}@example.invalid`;
  const password=randomBytes(20).toString('hex');
  const salt=randomBytes(32).toString('hex');
  const teacher=(await pool.query(`insert into public.app_users(role) values('teacher') returning id`)).rows[0].id;
  let student: string|undefined, roomId: string|undefined;
  const request=async (action:string, payload:any={}, cookie='') => {
    const headers:any={host:'localhost:8787',origin:'http://localhost:8787',cookie};
    const req:any={method:'POST',headers,body:{action,...payload}};
    const res:any={headers:{},statusCode:200,setHeader(key:string,value:string){this.headers[key]=value;},status(code:number){this.statusCode=code;return this;},json(value:any){this.body=value;return this;}};
    await handler(req,res);
    return res;
  };
  try {
    await pool.query('insert into public.teacher_accounts(user_id,email,password_hash,salt) values($1,$2,$3,$4)',[teacher,email,await passwordHash(password,salt),salt]);
    const denied=await request('create-room',{name:'Teste Neon'});
    assert.equal(denied.statusCode,403);
    const login=await request('teacher-login',{email,password});
    assert.equal(login.body.ok,true,JSON.stringify(login.body));
    const teacherCookie=login.headers['Set-Cookie'].split(';')[0];
    const created=await request('create-room',{name:'Teste Neon',maxPlayers:2,carsPerHeat:2},teacherCookie);
    assert.equal(created.body.ok,true,JSON.stringify(created.body));
    roomId=created.body.data.roomId;
    const studentAuth=await request('student-auth');
    assert.equal(studentAuth.body.ok,true,JSON.stringify(studentAuth.body));
    student=studentAuth.body.data.user.id;
    const studentCookie=studentAuth.headers['Set-Cookie'].split(';')[0];
    const requestId=randomUUID();
    const joined=await request('join-room',{code:created.body.data.code,teamName:'Equipe Teste',color:'#44b6d7',requestId},studentCookie);
    assert.equal(joined.body.ok,true,JSON.stringify(joined.body));
    const repeated=await request('join-room',{code:created.body.data.code,teamName:'Equipe Teste',color:'#44b6d7',requestId},studentCookie);
    assert.deepEqual(repeated.body,joined.body);
    const state=await request('state',{roomId},studentCookie);
    assert.equal(state.body.data.roster.length,1);
    assert.equal(state.body.data.own.name,'Equipe Teste');
    const projection=await request('state',{roomId,projectionToken:created.body.data.projectionToken});
    assert.equal(projection.body.data.own,undefined);
    const blocked=await request('rotate-access',{roomId,kind:'code'},studentCookie);
    assert.equal(blocked.statusCode,403);
    const count=await pool.query('select count(*)::int as total from public.game_audit where room_id=$1',[roomId]);
    assert.equal(count.rows[0].total,1);
  } finally {
    if (roomId) await pool.query('delete from public.game_rooms where id=$1',[roomId]);
    if (student) await pool.query('delete from public.app_users where id=$1',[student]);
    await pool.query('delete from public.app_users where id=$1',[teacher]);
    await pool.end();
  }
});
