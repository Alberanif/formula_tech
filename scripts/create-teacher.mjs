import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';
import pg from 'pg';

config({path:'.env.local',quiet:true});
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL não configurada.');
const rl=createInterface({input:stdin,output:stdout});
const email=(process.env.TEACHER_EMAIL||await rl.question('E-mail do professor: ')).trim().toLowerCase();
rl.close();
async function secretPrompt() {
  if (!stdin.isTTY) throw Error('Terminal interativo necessário para digitar a senha.');
  stdout.write('Senha (mínimo 10 caracteres): ');
  emitKeypressEvents(stdin);stdin.setRawMode(true);stdin.resume();
  return await new Promise((resolve,reject)=>{
    let value='';
    const finish=(error)=>{stdin.off('keypress',onKey);stdin.setRawMode(false);stdin.pause();stdout.write('\n');error?reject(error):resolve(value);};
    const onKey=(character,key)=>{
      if(key.ctrl&&key.name==='c')return finish(Error('Operação cancelada.'));
      if(key.name==='return'||key.name==='enter')return finish();
      if(key.name==='backspace')value=value.slice(0,-1);
      else if(character&&!key.ctrl&&!key.meta&&character.charCodeAt(0)>=32)value+=character;
    };
    stdin.on('keypress',onKey);
  });
}
const password=process.env.TEACHER_PASSWORD||await secretPrompt();
if (!/^\S+@\S+\.\S+$/.test(email) || password.length<10) throw Error('Informe um e-mail válido e senha de pelo menos 10 caracteres.');
const {scrypt}=await import('node:crypto');
const {promisify}=await import('node:util');
const salt=randomBytes(32).toString('hex');
const passwordHash=(await promisify(scrypt)(password,salt,64)).toString('hex');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await client.connect();
  await client.query('begin');
  const existing=await client.query('select user_id from public.teacher_accounts where email=$1',[email]);
  let userId=existing.rows[0]?.user_id;
  if (!userId) userId=(await client.query(`insert into public.app_users(role) values('teacher') returning id`)).rows[0].id;
  await client.query(`insert into public.teacher_accounts(user_id,email,password_hash,salt) values($1,$2,$3,$4)
    on conflict(email) do update set password_hash=excluded.password_hash,salt=excluded.salt`,[userId,email,passwordHash,salt]);
  await client.query('commit');
  console.log(`Conta docente pronta: ${email}`);
} catch(error) { await client.query('rollback').catch(()=>{}); console.error(error.message);process.exitCode=1; }
finally { await client.end().catch(()=>{}); }
