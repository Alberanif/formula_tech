// Fórmula Tech v1: official numeric rules shared by browser and server.
export const VERSION = 'ft-1.0.0';
export const SLOTS = ['engine','chassis','tires','suspension','aero','brakes'];
export const ATTR = ['V','A','C','S','R','E'];
export const LABELS = {V:'Velocidade',A:'Aceleração',C:'Controle',S:'Estabilidade',R:'Confiabilidade',E:'Eficiência'};
const part = (id,name,price,level,vector,description) => ({id,name,price,level,vector,description});
export const PARTS = {
  engine:[part('MOTOR_ECO','Econômico',140,1,[10,8,0,0,8,10],'Consome pouco e resiste ao desgaste.'),part('MOTOR_BAL','Equilibrado',190,2,[20,17,0,-2,2,3],'Boa aceleração com consumo contido.'),part('MOTOR_TURBO','Turbo',290,3,[36,28,-5,-8,-9,-16],'Potência máxima; consome mais e perde confiabilidade.')],
  chassis:[part('CHASSIS_REINFORCED','Reforçado',110,1,[-4,-5,3,14,12,-5],'Robusto, porém pesado.'),part('CHASSIS_BALANCED','Equilibrado',130,1,[0,0,8,11,7,0],'Equilíbrio entre controle e massa.'),part('CHASSIS_LIGHT','Leve',170,2,[7,12,4,-11,-4,3],'Acelera mais; perde estabilidade.')],
  tires:[part('TIRE_STANDARD','Convencionais',60,1,[0,0,6,3,8,0],'Duram mais; aderência básica.'),part('TIRE_SPORT','Esportivos',110,1,[0,2,17,8,1,-2],'Mais aderência por custo moderado.'),part('TIRE_RACE','Competição',190,2,[1,4,27,10,-12,-7],'Máxima aderência; consome dois kits por corrida.')],
  suspension:[part('SUSP_BASIC','Básica',60,1,[0,0,6,6,3,0],'Solução econômica.'),part('SUSP_SPORT','Esportiva',110,2,[0,0,14,12,1,0],'Melhora curvas sem grande risco.'),part('SUSP_PRO','Profissional',170,3,[0,0,21,19,-5,-2],'Mais controle; reduz confiabilidade.')],
  aero:[part('AERO_LOWDRAG','Baixo arrasto',50,1,[9,3,-3,-5,0,4],'Favorece retas; prejudica curvas.'),part('AERO_BALANCED','Equilibrada',100,2,[4,0,10,8,0,0],'Equilíbrio entre reta e curva.'),part('AERO_DOWNFORCE','Alta pressão',160,3,[-5,-3,20,16,0,-5],'Favorece curvas; perde velocidade máxima.')],
  brakes:[part('BRAKE_BASIC','Básicos',50,1,[0,0,5,3,3,0],'Frenagem econômica.'),part('BRAKE_SPORT','Esportivos',90,2,[0,0,11,9,2,0],'Melhora controle e estabilidade.'),part('BRAKE_RACE','Competição',140,3,[0,0,17,13,-4,0],'Frenagem forte; menor confiabilidade.')]
};
export const SLOT_NAMES = {engine:'Motor',chassis:'Chassi',tires:'Pneus',suspension:'Suspensão',aero:'Aerodinâmica',brakes:'Freios'};
export const PILOTS = [part('PILOT_1','Iniciante',100,0,[0,0,0,0,0,0],'Sem bônus; preserva orçamento.'),part('PILOT_2','Experiente',170,0,[0,0,3,2,3,0],'Controle +3, estabilidade +2, confiabilidade +3.'),part('PILOT_3','Profissional',250,0,[0,0,6,4,5,0],'Controle +6, estabilidade +4, confiabilidade +5.')];
export const MECHANICS = [{id:'MECH_1',name:'Aprendiz',price:100,level:1},{id:'MECH_2',name:'Experiente',price:170,level:2},{id:'MECH_3',name:'Especialista',price:260,level:3}];
export const CIRCUITS = {balance:{name:'Circuito Equilibrado',sectors:['R','C','M','R','C','M'],description:'Duas retas, duas curvas e dois trechos mistos.'},technical:{name:'Circuito Técnico',sectors:['C','C','C','M','C','C'],description:'Cinco curvas fechadas e um trecho misto.'},speed:{name:'Alta Velocidade',sectors:['R','R','M','R','R','M'],description:'Quatro retas e dois trechos mistos.'}};
export const SUPPLIES = {fuel:{name:'Combustível',base:15},tires:{name:'Kit de pneus',base:25},repair:{name:'Kit de reparos',base:20}};
export const MARKET = {M0:{fuel:1,tires:1,repair:1},M1:{fuel:1.2,tires:.8,repair:1},M2:{fuel:.8,tires:1.2,repair:1.2}};
export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
export const findPart = (slot,id) => PARTS[slot]?.find(p=>p.id===id);
export const findPilot = id => PILOTS.find(p=>p.id===id);
export const findMechanic = id => MECHANICS.find(m=>m.id===id);
export function newTeam(id,owner,name,color,number) { return {id,owner,name,color,number,wallet:1200,pilot:null,mechanic:null,aux:false,parts:{},receipts:{},lots:[],tests:[],analysis:{},ready:false,repairAssigned:false,ledger:[{kind:'initial_credit',amount:1200,balance:1200,at:new Date().toISOString()}],reflections:{}}; }
export function attributes(team) {
  const values=[35,35,30,30,40,40];
  const vectors=[...SLOTS.map(s=>findPart(s,team.parts[s])?.vector).filter(Boolean),findPilot(team.pilot)?.vector];
  if(team.aux) vectors.push([0,0,0,0,5,0]);
  for(const vector of vectors) vector.forEach((v,i)=>values[i]+=v);
  return Object.fromEntries(ATTR.map((a,i)=>[a,clamp(values[i],10,100)]));
}
export function scores(a) {return {R:.45*a.V+.35*a.A+.1*a.S+.1*a.E,C:.48*a.C+.32*a.S+.1*a.A+.1*a.R,M:.25*a.V+.25*a.A+.25*a.C+.15*a.S+.1*a.R};}
export function supplyNeeds(team) {const a=attributes(team);return {fuel:(team.parts.engine==='MOTOR_TURBO'?2:1)+(a.E<35?1:0),tires:team.parts.tires==='TIRE_RACE'?2:1,repair:team.repairAssigned?1:0};}
export function marketPrice(kind,phase,aux=false) {const global=Math.round(SUPPLIES[kind].base*MARKET[phase][kind]);return kind==='repair'&&aux?Math.ceil(global*.7):global;}
export function fixedCost(team) {return (findPilot(team.pilot)?.price||0)+(findMechanic(team.mechanic)?.price||0)+(team.aux?80:0)+SLOTS.reduce((sum,s)=>sum+(findPart(s,team.parts[s])?.price||0),0);}
export function inventory(team,kind) {return team.lots.filter(l=>l.kind===kind).reduce((n,l)=>n+l.quantity,0);}
export function operating(team,phase) {const need=supplyNeeds(team);return {need,minimum:need.fuel*marketPrice('fuel',phase,team.aux)+need.tires*marketPrice('tires',phase,team.aux),additional:Math.max(0,need.fuel-inventory(team,'fuel'))*marketPrice('fuel',phase,team.aux)+Math.max(0,need.tires-inventory(team,'tires'))*marketPrice('tires',phase,team.aux)};}
export function completeCar(team) {return !!(team.pilot&&team.mechanic&&SLOTS.every(s=>team.parts[s]));}
export function simulate(team,circuitId,laps=1,repair=false) {
  const circuit=CIRCUITS[circuitId];if(!circuit) throw Error('Circuito inválido.');
  const a=attributes(team), sc=scores(a), refs={R:6,C:8,M:7};
  const criticalIndex=circuit.sectors.lastIndexOf('M')>=0?circuit.sectors.lastIndexOf('M'):5;
  const sectors=[];let total=0;
  for(let lap=0;lap<laps;lap++) for(let i=0;i<6;i++) {
    const type=circuit.sectors[i],base=refs[type]*clamp(1.2-.004*sc[type],.82,1.2);
    const wear=base*Math.max(0,60-a.R)/1000*lap*(repair?.6:1);
    const corrective=a.R<25&&i===criticalIndex?(repair?.5:1):0;
    const seconds=base+wear+corrective; total+=seconds;
    sectors.push({lap:lap+1,index:i+1,type,score:sc[type],reference:refs[type],base,wear,corrective,seconds,delta:seconds-refs[type]});
  }
  const alerts=[];
  if(sc.C<50)alerts.push('Curvas lentas: revise controle e estabilidade.');
  if(sc.R<50)alerts.push('Retas lentas: avalie motor, chassi e aerodinâmica.');
  if(sc.M<50)alerts.push('Trecho misto sem equilíbrio.');
  if(a.R<45)alerts.push('Confiabilidade baixa: haverá desgaste nas voltas seguintes.');
  if(a.E<35)alerts.push('Eficiência baixa: +1 combustível por corrida.');
  if(team.parts.tires==='TIRE_RACE')alerts.push('Pneu de competição exige 2 kits por corrida.');
  const worst=sectors.slice(0,6).reduce((x,y)=>x.delta>y.delta?x:y);
  return {version:VERSION,circuitId,laps,attributes:a,scores:sc,sectors,total,alerts,bottleneck:{sector:worst.index,type:worst.type,delta:worst.delta}};
}
export function changedItems(before,after) {return ['pilot','mechanic','aux',...SLOTS.map(s=>'parts.'+s)].filter(k=>k.startsWith('parts.')?before.parts[k.slice(6)]!==after.parts[k.slice(6)]:before[k]!==after[k]);}
export function checklist(team) {
  const missing=[];
  if(!team.pilot)missing.push('Contrate um piloto');if(!team.mechanic)missing.push('Contrate um mecânico');
  for(const s of SLOTS)if(!team.parts[s])missing.push('Instale '+SLOT_NAMES[s].toLowerCase());
  const n=supplyNeeds(team);for(const k of ['fuel','tires'])if(inventory(team,k)<n[k])missing.push('Compre '+(n[k]-inventory(team,k))+' '+SUPPLIES[k].name.toLowerCase());
  if(team.tests.length<2)missing.push('Faça dois testes');
  if(!team.analysis.target||!team.analysis.change||!team.analysis.reason)missing.push('Registre a hipótese');
  if(team.tests.length>=2&&!changedItems(team.tests[0].snapshot,team.tests[1].snapshot).length)missing.push('Altere o projeto entre os dois primeiros testes');
  if(!team.analysis.evaluation||!team.analysis.evidence)missing.push('Registre a conclusão com uma métrica');
  return missing;
}
export function compareTests(a,b) {if(!a||!b)return null;const delta=a.result.total-b.result.total,cost=b.fixedCost-a.fixedCost;return {delta,percent:delta/a.result.total*100,cost,changed:changedItems(a.snapshot,b.snapshot),marginal:cost>0?delta/(cost/100):null};}
