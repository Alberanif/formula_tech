import { VERSION, PARTS, PILOTS, MECHANICS, CIRCUITS, SUPPLIES, MARKET, SLOTS, findPart, findPilot, findMechanic, newTeam, attributes, scores, supplyNeeds, marketPrice, fixedCost, inventory, operating, completeCar, simulate, checklist, compareTests } from '../shared/game.js';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

const err=(code:string,message:string,details:any={})=>{throw {code,message,details};};
const now=()=>Date.now();
const uid=()=>randomUUID();
const clean=(value:any,max=160)=>String(value??'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,max);
const banned=/\b(porra|caralho|foda|puta|merda)\b/i;
const hash=async(value:string)=>createHash('sha256').update(value+(process.env.ROOM_CODE_PEPPER||'')).digest('hex');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(length=8){const bytes=randomBytes(length);return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');}
function respond(origin:string,body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS'}});}
function publicState(room:any,user:string|null,projection=false){
  const data=room.data,own=Object.values(data.teams).find((t:any)=>t.owner===user&&!t.removed);
  const roster=Object.values(data.teams).filter((t:any)=>!t.removed).map((t:any)=>({id:t.id,name:t.name,color:t.color,number:t.number,ready:t.ready,tests:t.tests.length,complete:completeCar(t)}));
  const heats=data.heats.map((h:any)=>({id:h.id,type:h.type,number:h.number,status:h.status,startAt:h.startAt,pauseTotal:h.pauseTotal,pausedAt:h.status==='admin_paused'?h.adminPausedAt:h.pausedAt,checkpoint:h.checkpoint,duration:h.duration,history:h.history,participants:h.participants.map((p:any)=>({teamId:p.teamId,name:p.name,color:p.color,number:p.number,base:p.base,adjust:p.adjust,final:p.final,rank:p.rank,sectorTimes:p.sectorTimes})),event:h.event?{id:h.event.id,type:h.event.type,front:h.event.front,behind:h.event.behind,opensAt:h.event.opensAt,closesAt:h.event.closesAt,sequence:h.event.sequence,precision:h.event.precision,status:h.event.status,result:h.event.result}:null}));
  return {room:{id:room.id,name:room.name,phase:data.phase,circuitId:data.circuitId,mode:data.mode,market:data.market,qteEnabled:data.qteEnabled,maxPlayers:data.maxPlayers,carsPerHeat:data.carsPerHeat,teacherId:room.teacher_user_id,version:room.version,code:user===room.teacher_user_id?room.code_display:undefined},roster,own:projection?undefined:own,teacherTeams:user===room.teacher_user_id?Object.values(data.teams):undefined,heats,awards:data.awards,events:data.events.slice(-30),serverTime:now(),catalog:{parts:PARTS,pilots:PILOTS,mechanics:MECHANICS,circuits:CIRCUITS,supplies:SUPPLIES,market:MARKET},configVersion:VERSION};
}
function getTeam(data:any,user:string){const team=Object.values(data.teams).find((t:any)=>t.owner===user&&!t.removed) as any;if(!team)err('NOT_AUTHORIZED','Você não pertence a esta sala.');return team;}
function requireTeacher(room:any,user:string){if(room.teacher_user_id!==user)err('NOT_AUTHORIZED','Apenas o professor pode fazer isso.');}
function editable(data:any){if(!['TEAM_BUILD','TESTING'].includes(data.phase))err('INVALID_ROOM_STATE','As equipes estão travadas nesta etapa.');}
function spend(team:any,amount:number,kind:string){if(team.wallet<amount)err('INSUFFICIENT_FUNDS',`Saldo insuficiente: faltam ${amount-team.wallet} créditos.`,{required:amount,available:team.wallet});team.wallet-=amount;team.ledger.push({kind,amount:-amount,balance:team.wallet,at:new Date().toISOString()});}
function refund(team:any,amount:number,kind:string){team.wallet+=amount;team.ledger.push({kind,amount,balance:team.wallet,at:new Date().toISOString()});}
function event(data:any,type:string,detail:any={}){data.events.push({id:uid(),type,detail,at:new Date().toISOString()});}
function snapshot(team:any){return {pilot:team.pilot,mechanic:team.mechanic,aux:team.aux,parts:{...team.parts}};}
function consume(team:any,kind:string,count:number){let remaining=count;for(const lot of team.lots.filter((l:any)=>l.kind===kind)){const n=Math.min(lot.quantity,remaining);lot.quantity-=n;remaining-=n;if(!remaining)break;}if(remaining)err('MISSING_SUPPLIES','Faltam suprimentos para a corrida.');team.lots=team.lots.filter((l:any)=>l.quantity>0);}
function financial(team:any,previous:number,action:string){return previous===team.wallet?[]:[{team_id:team.id,action,amount:team.wallet-previous,balance:team.wallet}];}
function withRoster(data:any,ids:string[]){return ids.map(id=>{const t=data.teams[id];return {teamId:t.id,name:t.name,color:t.color,number:t.number,base:null,adjust:0,final:null,rank:null,snapshot:snapshot(t),sectorTimes:[],repair:t.repairAssigned};});}
function rank(h:any){h.participants.sort((a:any,b:any)=>(a.final??a.base+a.adjust)-(b.final??b.base+b.adjust)||(a.base-b.base)||(b.mixedScore-a.mixedScore));h.participants.forEach((p:any,i:number)=>{const prior=h.participants[i-1];p.rank=prior&&p.final===prior.final&&p.base===prior.base&&p.mixedScore===prior.mixedScore?prior.rank:i+1;});}
function projected(h:any,fraction:number){return [...h.participants].map((p:any)=>({...p,projected:p.base*fraction+p.adjust})).sort((a:any,b:any)=>a.projected-b.projected);}
function resolveQte(h:any){const e=h.event;if(!e||e.status!=='open')return;const a=e.inputs[e.front],b=e.inputs[e.behind];let winner:string|null=null;
  if(a?.valid&&b?.valid&&Math.abs(a.at-b.at)>50)winner=a.at<b.at?e.front:e.behind;
  else if(a?.valid&&!b?.valid)winner=e.front;else if(b?.valid&&!a?.valid)winner=e.behind;
  e.status='resolved';e.result={winner,frontValid:!!a?.valid,behindValid:!!b?.valid};
  const front=h.participants.find((p:any)=>p.teamId===e.front),behind=h.participants.find((p:any)=>p.teamId===e.behind);
  if(winner===e.behind){behind.adjust-=700;front.adjust+=150;}else if(winner===e.front){front.adjust-=350;behind.adjust+=200;}
  h.pauseTotal+=now()-h.pausedAt;h.pausedAt=null;h.status='running';h.history.push({type:'qte',checkpoint:e.checkpoint,result:e.result,at:new Date().toISOString()});
}
function advanceRace(h:any,data:any,activeTeamIds:string[]){
  const t=now();if(h.status==='countdown'&&t>=h.startAt)h.status='running';
  if(h.status==='qte_paused'){if(t>=h.event.closesAt){resolveQte(h);}else return;}
  if(h.status!=='running')return;
  const logical=Math.max(0,t-h.startAt-h.pauseTotal),thresholds=[.3,.5,.7,.88];
  while(h.checkpoint<4&&logical>=h.duration*thresholds[h.checkpoint]){
    const cp=h.checkpoint++;if(!data.qteEnabled||logical-h.duration*thresholds[cp]>2000)continue;
    const positions=projected(h,thresholds[cp]);let pair=null;
    for(let i=0;i<positions.length-1;i++){const f=positions[i],b=positions[i+1];if(b.projected-f.projected<=600&&activeTeamIds.includes(f.teamId)&&activeTeamIds.includes(b.teamId)&&!h.cooldowns[f.teamId]&&!h.cooldowns[b.teamId]){pair=[f,b];break;}}
    for(const key of Object.keys(h.cooldowns))h.cooldowns[key]=Math.max(0,h.cooldowns[key]-1);
    if(pair){const [front,behind]=pair;h.cooldowns[front.teamId]=2;h.cooldowns[behind.teamId]=2;
      const type=['reaction','precision','sequence','reaction'][cp],opensAt=t+1000;
      h.event={id:uid(),checkpoint:cp+1,type,front:front.teamId,behind:behind.teamId,opensAt,closesAt:opensAt+2000,status:'open',sequence:type==='sequence'?['A','D','SPACE']:undefined,precision:type==='precision'?{duration:2000,zoneStart:.38,zoneEnd:.62}:undefined,inputs:{}};
      h.status='qte_paused';h.pausedAt=t;h.history.push({type:'qte_open',checkpoint:cp+1,at:new Date().toISOString()});break;
    }
  }
  if(h.status==='running'&&logical>=h.duration){h.status='finished';h.finishedAt=t;h.participants.forEach((p:any)=>p.final=p.base+p.adjust);rank(h);
    if(h.type==='final')data.awards.champion=h.participants[0]?.teamId;
    const improved=Object.values(data.teams).map((team:any)=>({teamId:team.id,comparison:compareTests(team.tests[0],team.tests[1])})).filter(x=>x.comparison?.changed.length&&x.comparison.percent>0).sort((a,b)=>b.comparison.percent-a.comparison.percent);
    if(improved.length)data.awards.evolution=improved[0].teamId;
    event(data,'heat.finished',{heatId:h.id,type:h.type});}
}
function mutator(room:any,data:any,action:string,p:any,user:string){
  const audit:any={};let finances:any[]=[];let result:any={};
  if(['team-action','equip-part','unequip-part','purchase-supply','refund-supply','assign-repair','run-test'].includes(action)||(action==='submit-analysis'&&data.phase==='TESTING')){
    const team=getTeam(data,user);if(team.ready){team.ready=false;event(data,'team.ready',{teamId:team.id,ready:false});}
  }
  if(action==='join-room'){
    if(!['LOBBY','TEAM_BUILD','TESTING'].includes(data.phase))err('ROOM_CLOSED','Esta sala não aceita novas equipes.');
    const existing=Object.values(data.teams).find((t:any)=>t.owner===user) as any;
    if(existing){if(existing.removed)err('NOT_AUTHORIZED','Esta equipe foi removida pelo professor.');return {data,result:{teamId:existing.id,roomId:room.id,reconnected:true},audit,finances};}
    if(Object.values(data.teams).filter((t:any)=>!t.removed).length>=data.maxPlayers)err('ROOM_FULL','A sala está cheia.');
    const name=clean(p.teamName,20);if(name.length<3||banned.test(name))err('INVALID_NAME','Escolha um nome fictício de 3 a 20 caracteres.');
    if(Object.values(data.teams).some((t:any)=>!t.removed&&t.name.toLowerCase()===name.toLowerCase()))err('DUPLICATE_NAME','Já existe uma escuderia com este nome.');
    const colors=['#f05d5e','#44b6d7','#edbb4f','#c48bec','#6ed0a4','#ff8d53','#8caaed','#f38cb2'];
    const color=colors.includes(p.color)?p.color:colors[Object.keys(data.teams).length%colors.length];
    const id=uid(),number=Object.keys(data.teams).length+1;data.teams[id]=newTeam(id,user,name,color,number);event(data,'team.joined',{teamId:id,name});finances=[{team_id:id,action:'initial_credit',amount:1200,balance:1200}];result={teamId:id,roomId:room.id};
  }else if(action==='team-action'){
    editable(data);const t=getTeam(data,user),old=t.wallet,kind=p.kind,item=p.itemId;
    if(kind==='pilot'){const candidate=item?findPilot(item):null;if(item&&!candidate)err('INVALID_ITEM','Piloto inválido.');const paid=t.receipts.pilot||0,price=candidate?.price||0;if(old+paid<price)err('INSUFFICIENT_FUNDS',`Saldo insuficiente: faltam ${price-old-paid} créditos.`);t.wallet+=paid-price;t.pilot=item||null;t.receipts.pilot=price;}
    else if(kind==='mechanic'){const candidate=item?findMechanic(item):null;if(item&&!candidate)err('INVALID_ITEM','Mecânico inválido.');const invalid=SLOTS.filter(s=>findPart(s,t.parts[s])?.level>(candidate?.level||0));if(invalid.length)err('PART_REQUIREMENT_NOT_MET',`Troque antes as peças incompatíveis: ${invalid.join(', ')}.`,{slots:invalid});const paid=t.receipts.mechanic||0,price=candidate?.price||0;if(old+paid<price)err('INSUFFICIENT_FUNDS',`Saldo insuficiente: faltam ${price-old-paid} créditos.`);t.wallet+=paid-price;t.mechanic=item||null;t.receipts.mechanic=price;}
    else if(kind==='aux'){const enabled=!!p.enabled,price=enabled?80:0,paid=t.receipts.aux||0;if(old+paid<price)err('INSUFFICIENT_FUNDS',`Saldo insuficiente: faltam ${price-old-paid} créditos.`);t.wallet+=paid-price;t.aux=enabled;t.receipts.aux=price;}
    else err('INVALID_ACTION','Ação de equipe inválida.');
    t.ledger.push({kind:'staff_change',amount:t.wallet-old,balance:t.wallet,at:new Date().toISOString()});finances=financial(t,old,'staff_change');result={team:t};
  }else if(action==='equip-part'){
    editable(data);const t=getTeam(data,user),part=findPart(p.slot,p.partId);if(!part)err('INVALID_ITEM','Peça inválida.');const level=findMechanic(t.mechanic)?.level||0;if(part.level>level)err('PART_REQUIREMENT_NOT_MET',`Esta peça exige mecânico nível ${part.level}. Seu mecânico atual é nível ${level}.`);
    const old=t.wallet,paid=t.receipts[p.slot]||0;if(old+paid<part.price)err('INSUFFICIENT_FUNDS',`Saldo insuficiente: faltam ${part.price-old-paid} créditos.`);
    t.wallet+=paid-part.price;t.parts[p.slot]=part.id;t.receipts[p.slot]=part.price;t.ledger.push({kind:'part_change',amount:t.wallet-old,balance:t.wallet,at:new Date().toISOString()});finances=financial(t,old,'part_change');result={team:t,attributes:attributes(t)};
  }else if(action==='unequip-part'){
    editable(data);const t=getTeam(data,user),slot=p.slot;if(!SLOTS.includes(slot)||!t.parts[slot])err('INVALID_ITEM','Nenhuma peça instalada neste slot.');const old=t.wallet,paid=t.receipts[slot]||0;delete t.parts[slot];delete t.receipts[slot];refund(t,paid,'part_refund');finances=financial(t,old,'part_refund');result={team:t};
  }else if(action==='purchase-supply'){
    editable(data);const t=getTeam(data,user),kind=p.kind,quantity=Number(p.quantity);if(!SUPPLIES[kind]||!Number.isInteger(quantity)||quantity<1||quantity>8)err('INVALID_QUANTITY','Quantidade inválida.');if(inventory(t,kind)+quantity>8)err('STOCK_LIMIT','O limite é 8 unidades por suprimento.');
    if(p.marketPhase!==data.market)err('PURCHASE_QUOTE_EXPIRED','O preço mudou. Confira a nova cotação.');const price=marketPrice(kind,data.market,t.aux),old=t.wallet;spend(t,price*quantity,'supply_buy');t.lots.push({id:uid(),kind,quantity,paid:price,phase:data.market});finances=financial(t,old,'supply_buy');result={team:t,unitPrice:price};
  }else if(action==='refund-supply'){
    editable(data);const t=getTeam(data,user),lot=t.lots.find((l:any)=>l.id===p.lotId),quantity=Number(p.quantity);if(!lot||!Number.isInteger(quantity)||quantity<1||quantity>lot.quantity)err('INVALID_QUANTITY','Lote ou quantidade inválida.');const old=t.wallet;lot.quantity-=quantity;refund(t,lot.paid*quantity,'supply_refund');t.lots=t.lots.filter((l:any)=>l.quantity>0);finances=financial(t,old,'supply_refund');result={team:t};
  }else if(action==='assign-repair'){
    editable(data);const t=getTeam(data,user);if(p.enabled&&inventory(t,'repair')<1)err('MISSING_SUPPLIES','Compre um kit de reparos primeiro.');t.repairAssigned=!!p.enabled;result={team:t};
  }else if(action==='run-test'){
    if(data.phase!=='TESTING')err('INVALID_ROOM_STATE','O professor ainda não abriu o Centro de Testes.');const t=getTeam(data,user);if(!completeCar(t))err('TEAM_INCOMPLETE','Complete o carro e a equipe antes de testar.');
    if(t.tests.length===1&&(!t.analysis.target||!t.analysis.change||!t.analysis.reason))err('ANALYSIS_INCOMPLETE','Registre a hipótese antes do segundo teste.');
    if(t.tests.length===1&&JSON.stringify(snapshot(t))===JSON.stringify(t.tests[0].snapshot))err('ANALYSIS_INCOMPLETE','Altere ao menos uma escolha antes do segundo teste.');
    const old=t.wallet,fee=t.tests.length>=2?12:0;if(fee)spend(t,fee,'test_fee');const resultSim=simulate(t,data.circuitId,1,false),test={id:uid(),number:t.tests.length+1,at:new Date().toISOString(),snapshot:snapshot(t),fixedCost:fixedCost(t),result:resultSim,fee};t.tests.push(test);finances=financial(t,old,'test_fee');result={test,comparison:compareTests(t.tests.at(-2),test),team:t};
  }else if(action==='submit-analysis'){
    if(!['TESTING','RESULTS'].includes(data.phase))err('INVALID_ROOM_STATE','Análise indisponível nesta etapa.');const t=getTeam(data,user),a=t.analysis;
    if(data.phase==='RESULTS'&&p.keep===undefined)err('INVALID_ROOM_STATE','Após a corrida, apenas a reflexão final pode mudar.');
    if(p.target!==undefined){if(t.tests.length<1)err('ANALYSIS_INCOMPLETE','Faça o primeiro teste.');if(!['R','C','M'].includes(p.target)||!clean(p.change,80)||!clean(p.reason,160))err('INVALID_ANALYSIS','Preencha gargalo, mudança e motivo.');a.target=p.target;a.change=clean(p.change,80);a.reason=clean(p.reason,160);}
    if(p.evaluation!==undefined){if(t.tests.length<2)err('ANALYSIS_INCOMPLETE','Faça o segundo teste.');if(!['improved','partially','not_improved'].includes(p.evaluation)||!/[0-9]/.test(clean(p.evidence,240)))err('INVALID_ANALYSIS','Escolha o resultado e cite uma métrica numérica.');a.evaluation=p.evaluation;a.evidence=clean(p.evidence,240);}
    if(p.keep!==undefined){a.keep=clean(p.keep,240);a.next=clean(p.next,240);}
    result={analysis:a,missing:checklist(t)};
  }else if(action==='set-ready'){
    if(data.phase!=='TESTING')err('INVALID_ROOM_STATE','Prontidão indisponível nesta etapa.');const t=getTeam(data,user);if(p.ready){const missing=checklist(t);if(missing.length)err('ANALYSIS_INCOMPLETE','Ainda faltam: '+missing.join('; '),{missing});}t.ready=!!p.ready;event(data,'team.ready',{teamId:t.id,ready:t.ready});result={ready:t.ready};
  }else if(action==='market-action'){
    requireTeacher(room,user);if(!['TEAM_BUILD','TESTING'].includes(data.phase))err('INVALID_ROOM_STATE','Mercado fechado.');const expected=data.market==='M0'?'M1':data.market==='M1'?'M2':null;if(p.phase!==expected)err('INVALID_MARKET_PHASE','Fase de mercado inválida.');data.market=expected;event(data,'market.changed',{phase:expected});result={market:expected};
  }else if(action==='room-transition'){
    requireTeacher(room,user);const next:any={LOBBY:'TEAM_BUILD',TEAM_BUILD:'TESTING',TESTING:'LOCK_IN',QUALIFYING:'RESULTS',FINAL:'RESULTS',RESULTS:'CLOSED'};
    if(p.phase!==next[data.phase])err('INVALID_ROOM_STATE','Transição de etapa inválida.');if(p.phase==='LOCK_IN'){const teams=Object.values(data.teams).filter((t:any)=>!t.removed) as any[];if(!teams.length||teams.some(t=>!t.ready||checklist(t).length))err('TEAMS_NOT_READY','Todas as escuderias precisam estar prontas e válidas.');}
    if(p.phase==='LOCK_IN'&&data.mode==='standard'&&data.market==='M0')err('INVALID_MARKET_PHASE','Anuncie o evento de mercado M1 antes de travar as equipes.');
    if(p.phase==='RESULTS'&&data.heats.some((h:any)=>h.status==='created'||h.status==='countdown'||h.status==='running'||h.status==='qte_paused'))err('RACE_IN_PROGRESS','Conclua as baterias antes de mostrar resultados.');
    if(p.phase==='RESULTS'&&data.phase==='FINAL'&&!data.heats.some((h:any)=>h.type==='final'&&h.status==='finished'))err('RACE_IN_PROGRESS','Conclua a grande final antes de mostrar resultados.');
    data.phase=p.phase;event(data,'room.phase',{phase:p.phase});result={phase:p.phase};
  }else if(action==='build-heats'){
    requireTeacher(room,user);if(data.phase!=='LOCK_IN')err('INVALID_ROOM_STATE','Tranque as equipes antes de criar baterias.');const ids=Object.keys(data.teams).filter(id=>data.teams[id].ready&&!data.teams[id].removed),size=data.carsPerHeat;
    if(!ids.length)err('TEAMS_NOT_READY','Nenhuma equipe pronta.');let groups:string[][]=[];
    if(Array.isArray(p.assignments)){
      if(p.assignments.length<1||p.assignments.length>5)err('INVALID_ASSIGNMENTS','Use de uma a cinco baterias.');
      groups=p.assignments.map((g:any)=>Array.isArray(g)?g:[]);
      const flattened=groups.flat();if(groups.some(g=>g.length<1||g.length>size)||flattened.length!==ids.length||new Set(flattened).size!==ids.length||flattened.some(x=>!ids.includes(x)))err('INVALID_ASSIGNMENTS','Cada equipe pronta deve aparecer uma vez, respeitando o limite de carros.');
    }else for(let i=0;i<ids.length;i+=size)groups.push(ids.slice(i,i+size));
    data.heats=groups.map((group,i)=>({id:uid(),type:'qualifier',number:i+1,status:'created',participants:withRoster(data,group),startAt:null,pauseTotal:0,pausedAt:null,checkpoint:0,event:null,history:[],cooldowns:{},duration:0}));data.phase='QUALIFYING';event(data,'heats.built',{count:data.heats.length,manual:Array.isArray(p.assignments)});result={heats:data.heats};
  }else if(action==='race-action'){
    requireTeacher(room,user);const h=data.heats.find((x:any)=>x.id===p.heatId);if(!h)err('HEAT_NOT_FOUND','Bateria inválida.');
    if(p.command==='start'){
      if(h.status!=='created')err('INVALID_RACE_STATE','Esta bateria já foi iniciada.');if(data.heats.some((x:any)=>x.id!==h.id&&['countdown','running','qte_paused','admin_paused'].includes(x.status)))err('RACE_IN_PROGRESS','Outra bateria está em andamento.');
      for(const participant of h.participants){const t=data.teams[participant.teamId];const need=supplyNeeds(t);if(h.type==='qualifier'&&!h.freeSupplies){if(inventory(t,'fuel')<need.fuel||inventory(t,'tires')<need.tires)err('MISSING_SUPPLIES',`${t.name} precisa de mais suprimentos.`);consume(t,'fuel',need.fuel);consume(t,'tires',need.tires);if(t.repairAssigned)consume(t,'repair',1);}const sim=simulate(t,data.circuitId,3,h.type==='qualifier'&&t.repairAssigned);participant.base=Math.round(sim.total*1000);participant.mixedScore=sim.scores.M;participant.sectorTimes=sim.sectors.map((s:any)=>Math.round(s.seconds*1000));participant.consumed=h.type==='qualifier'&&!h.freeSupplies?need:{fuel:0,tires:0,repair:0};}
      h.duration=Math.max(...h.participants.map((x:any)=>x.base));h.startAt=now()+3000;h.status='countdown';h.history.push({type:'start',at:new Date().toISOString()});event(data,'heat.started',{heatId:h.id});result={heatId:h.id,startAt:h.startAt};
    }else if(p.command==='pause'){if(!['running','countdown','qte_paused'].includes(h.status))err('INVALID_RACE_STATE','Corrida não está ativa.');h.previousStatus=h.status;h.status='admin_paused';h.adminPausedAt=now();if(h.event?.status==='open'){h.pauseTotal+=h.adminPausedAt-h.pausedAt;h.pausedAt=null;h.event.status='cancelled';h.event=null;}result={status:h.status};}
    else if(p.command==='resume'){if(h.status!=='admin_paused')err('INVALID_RACE_STATE','Corrida não está pausada.');const dt=now()-h.adminPausedAt;if(h.previousStatus==='countdown')h.startAt+=dt;else h.pauseTotal+=dt;h.status=h.previousStatus==='countdown'?'countdown':'running';h.pausedAt=null;result={status:h.status};}
    else if(p.command==='cancel'){if(h.status==='finished')err('INVALID_RACE_STATE','Resultado oficial já concluído.');const beforeStart=h.status==='created'||(h.status==='countdown'&&now()<h.startAt);if(beforeStart){for(const part of h.participants){if(part.consumed){const t=data.teams[part.teamId];for(const kind of ['fuel','tires','repair'])if(part.consumed[kind])t.lots.push({id:uid(),kind,quantity:part.consumed[kind],paid:0,phase:'return'});}}}h.hadStarted=!beforeStart;h.status='cancelled';event(data,'heat.cancelled',{heatId:h.id});result={status:h.status};}
    else if(p.command==='repeat'){if(h.status!=='cancelled'||data.heats.some((x:any)=>x.repeatOf===h.id))err('INVALID_RACE_STATE','Esta bateria não pode ser repetida.');const repeated={id:uid(),type:h.type,number:h.number,status:'created',participants:withRoster(data,h.participants.map((x:any)=>x.teamId)),startAt:null,pauseTotal:0,pausedAt:null,checkpoint:0,event:null,history:[],cooldowns:{},duration:0,repeatOf:h.id,freeSupplies:h.hadStarted};data.heats.push(repeated);event(data,'heat.repeated',{oldHeatId:h.id,newHeatId:repeated.id});result={heat:repeated};}
    else err('INVALID_ACTION','Comando de corrida inválido.');
  }else if(action==='sync-race'){
    const h=data.heats.find((x:any)=>x.id===p.heatId);if(!h)err('HEAT_NOT_FOUND','Bateria inválida.');advanceRace(h,data,p.activeTeamIds||[]);result={heatId:h.id,status:h.status};
  }else if(action==='submit-qte'){
    const t=getTeam(data,user),h=data.heats.find((x:any)=>x.event?.id===p.eventId),e=h?.event;
    if(!e||h.status!=='qte_paused'||e.status!=='open')err('QTE_NOT_OPEN','Este duelo não está aberto.');if(![e.front,e.behind].includes(t.id))err('QTE_NOT_ELIGIBLE','Sua equipe não participa deste duelo.');
    if(e.inputs[t.id]?.final)err('QTE_ALREADY_SUBMITTED','Você já respondeu a este duelo.');const timestamp=now();let input=e.inputs[t.id]||{progress:0};
    if(timestamp<e.opensAt){input={valid:false,final:true,reason:'false_start',at:timestamp};}
    else if(timestamp>e.closesAt){input={valid:false,final:true,reason:'expired',at:timestamp};}
    else if(e.type==='reaction'){input={valid:p.key==='SPACE',final:true,reason:p.key==='SPACE'?null:'wrong_key',at:timestamp};}
    else if(e.type==='precision'){const fraction=(timestamp-e.opensAt)/e.precision.duration;const valid=fraction>=e.precision.zoneStart&&fraction<=e.precision.zoneEnd;input={valid,final:true,reason:valid?null:'outside_zone',at:timestamp};}
    else {const expected=e.sequence[input.progress];if(p.key!==expected)input={valid:false,final:true,reason:'wrong_key',at:timestamp};else {input.progress++;if(input.progress===e.sequence.length)input={valid:true,final:true,at:timestamp};}}
    e.inputs[t.id]=input;if(e.inputs[e.front]?.final&&e.inputs[e.behind]?.final)resolveQte(h);result={accepted:true,input:{valid:input.valid,final:input.final,progress:input.progress,reason:input.reason}};
  }else if(action==='build-final'){
    requireTeacher(room,user);if(data.phase!=='QUALIFYING'||data.heats.some((h:any)=>h.type==='qualifier'&&h.status!=='finished'&&h.status!=='cancelled'))err('INVALID_ROOM_STATE','Conclua as classificatórias primeiro.');
    const qualifiers=data.heats.filter((h:any)=>h.type==='qualifier'&&h.status==='finished');
    const qualified=qualifiers.length<=2?qualifiers.flatMap((h:any)=>h.participants.slice(0,2).map((x:any)=>x.teamId)):[...qualifiers.map((h:any)=>h.participants[0]?.teamId).filter(Boolean),...qualifiers.flatMap((h:any)=>h.participants.slice(1)).sort((a:any,b:any)=>a.final-b.final).slice(0,Math.max(0,5-qualifiers.length)).map((x:any)=>x.teamId)];
    if(!qualified.length)err('INVALID_ROOM_STATE','Nenhuma bateria concluída para montar a final.');
    const h={id:uid(),type:'final',number:1,status:'created',participants:withRoster(data,qualified),startAt:null,pauseTotal:0,pausedAt:null,checkpoint:0,event:null,history:[],cooldowns:{},duration:0};data.heats.push(h);data.phase='FINAL';event(data,'final.built',{teams:qualified});result={heat:h};
  }else if(action==='award'){
    requireTeacher(room,user);if(!['FINAL','RESULTS'].includes(data.phase))err('INVALID_ROOM_STATE','Premiações ainda indisponíveis.');if(!['strategist','analyst'].includes(p.kind)||!data.teams[p.teamId]||data.teams[p.teamId].removed)err('INVALID_AWARD','Premiação inválida.');data.awards[p.kind]=p.teamId;result={awards:data.awards};
  }else if(action==='remove-team'){
    requireTeacher(room,user);if(!['LOBBY','TEAM_BUILD','TESTING'].includes(data.phase))err('INVALID_ROOM_STATE','A remoção deve ocorrer antes da trava.');const t=data.teams[p.teamId];if(!t||t.removed)err('TEAM_NOT_FOUND','Equipe não encontrada.');t.removed=true;t.ready=false;event(data,'team.removed',{teamId:t.id,name:t.name});result={teamId:t.id,removed:true};
  }else err('INVALID_ACTION','Ação não reconhecida.');
  for(const key of ['kind','itemId','slot','partId','quantity','marketPhase','phase','heatId','command','eventId','teamId'])if(p[key]!==undefined)audit[key]=p[key];
  if(action==='run-test')audit.testNumber=result.test?.number;
  if(action==='join-room')audit.teamId=result.teamId;
  return {data,result,audit,finances};
}


export { mutator, publicState, hash, code, clean, err, now, uid };
