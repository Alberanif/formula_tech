// Use only with a disposable classroom. Creates real student sessions and teams.
const base=process.env.BASE_URL||'http://localhost:5173';
const roomCode=process.env.ROOM_CODE;
const count=Math.min(20,Math.max(1,Number(process.env.STUDENTS||10)));
if(!roomCode)throw Error('Defina ROOM_CODE para uma sala descartável.');
const started=Date.now();
const clients=[];
const request=async(action,payload={},cookie='')=>{
  const response=await fetch(base+'/api/game',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({action,...payload})});
  const body=await response.json();
  if(!body.ok)throw Error(body.message||body.code);
  return {body,cookie:response.headers.get('set-cookie')?.split(';')[0]};
};
const results=await Promise.allSettled(Array.from({length:count},async(_,i)=>{
  const session=await request('student-auth');
  const joined=await request('join-room',{code:roomCode,teamName:`Carga ${String(i+1).padStart(2,'0')}`,color:'#44b6d7',requestId:crypto.randomUUID()},session.cookie);
  clients.push({roomId:joined.body.data.roomId,cookie:session.cookie});
}));
const reads=await Promise.allSettled(clients.map(x=>request('state',{roomId:x.roomId},x.cookie)));
const joined=results.filter(x=>x.status==='fulfilled').length,stateOk=reads.filter(x=>x.status==='fulfilled').length;
console.log(JSON.stringify({studentsRequested:count,joined,stateOk,elapsedMs:Date.now()-started,errors:results.filter(x=>x.status==='rejected').map(x=>String(x.reason))},null,2));
if(joined!==count||stateOk!==count)process.exitCode=1;
