import test from 'node:test';
import assert from 'node:assert/strict';
import { newTeam, SLOTS, inventory } from '../shared/game.js';
import { mutator, publicState, racePrize } from '../server/core.js';
import { raceView, carProgress, raceElapsed } from '../src/race-view.js';

const parts = ['MOTOR_ECO', 'CHASSIS_REINFORCED', 'TIRE_STANDARD', 'SUSP_BASIC', 'AERO_LOWDRAG', 'BRAKE_BASIC'];
function fixture(raceCount = 2, lapsPerRace = 2) {
  const teacher = 'teacher', room = { id: 'room', teacher_user_id: teacher, version: 1, name: 'Turma', code_display: 'ABCDEFGH' };
  const teams = Object.fromEntries(['a', 'b'].map((id, i) => {
    const team = newTeam(id, `student-${id}`, `Equipe ${id}`, i ? '#44b6d7' : '#edbb4f', i + 1);
    team.pilot = 'PILOT_1'; team.mechanic = 'MECH_1'; team.parts = Object.fromEntries(SLOTS.map((slot, index) => [slot, parts[index]]));
    team.lots = [{ id: `${id}-fuel`, kind: 'fuel', quantity: 4, paid: 15 }, { id: `${id}-tires`, kind: 'tires', quantity: 4, paid: 25 }];
    team.ready = true;
    return [id, team];
  }));
  const data = { phase: 'LOCK_IN', circuitId: 'balance', mode: 'standard', market: 'M1', qteEnabled: true, raceSpeed: 1, maxPlayers: 2, carsPerHeat: 2, raceCount, lapsPerRace, teams, heats: [], events: [], awards: {} };
  room.data = data;
  return { room, data, teacher, teams };
}

test('reaction duel is visible long enough and first valid server reaction wins', async () => {
  const { room, data, teacher } = fixture();
  mutator(room, data, 'build-heats', {}, teacher);
  const heat = data.heats[0];
  mutator(room, data, 'race-action', { heatId: heat.id, command: 'start' }, teacher);
  assert.equal(heat.laps, 2);
  heat.incidents = [];
  heat.startAt = Date.now() - heat.duration * 0.13;
  mutator(room, data, 'sync-race', { heatId: heat.id, activeTeamIds: ['a', 'b'] }, 'student-a');
  assert.equal(heat.event.type, 'reaction');
  assert.equal(heat.event.closesAt - heat.event.opensAt, 4000);
  assert.equal(heat.status, 'qte_paused');
  heat.event.opensAt = Date.now() - 100;
  heat.event.closesAt = Date.now() + 4000;
  const first = heat.event.front, second = heat.event.behind;
  mutator(room, data, 'submit-qte', { eventId: heat.event.id, key: 'SPACE' }, `student-${first}`);
  await new Promise(resolve => setTimeout(resolve, 70));
  mutator(room, data, 'submit-qte', { eventId: heat.event.id, key: 'SPACE' }, `student-${second}`);
  assert.equal(heat.event.result.winner, first);
  assert.equal(heat.status, 'running');
});

test('one-lap race delivers ten distinct duels and at least one visible incident at 8× speed', () => {
  const { room, data, teacher } = fixture(1, 1);
  assert.throws(() => mutator(room, data, 'race-speed', { speed: 8 }, 'student-a'), e => e.code === 'NOT_AUTHORIZED');
  mutator(room, data, 'race-speed', { speed: 8 }, teacher);
  mutator(room, data, 'build-heats', {}, teacher);
  const heat = data.heats[0];
  mutator(room, data, 'race-action', { heatId: heat.id, command: 'start' }, teacher);
  assert.equal(heat.speed, 8);
  assert.equal(heat.incidents.length, 3);
  const displayHeat = publicState(room, 'student-a').heats[0];
  assert.equal(displayHeat.speed, 8);
  assert.ok(raceElapsed({ startAt: Date.now() - 1000, pauseTotal: 0, speed: 8 }) >= 8000);
  heat.startAt = Date.now() - heat.duration;
  for (let i = 0; i < 20 && heat.status !== 'finished'; i++) {
    mutator(room, data, 'sync-race', { heatId: heat.id }, teacher);
    if (heat.status === 'qte_paused') {
      heat.event.closesAt = Date.now() - 1;
      mutator(room, data, 'sync-race', { heatId: heat.id }, teacher);
    }
  }
  const opens = heat.history.filter(x => x.type === 'qte_open');
  assert.equal(opens.length, 10);
  assert.equal(new Set(opens.map(x => x.title)).size, 10);
  assert.equal(heat.history.filter(x => x.type === 'qte').length, 10);
  assert.ok(heat.history.filter(x => x.type === 'incident').length >= 1);
  assert.equal(heat.status, 'finished');
});

test('student leaving releases the slot and can enter again while registration is open', () => {
  const { room, data } = fixture();
  data.phase = 'LOBBY';
  const result = mutator(room, data, 'leave-room', {}, 'student-a');
  assert.equal(result.result.left, true);
  assert.equal(publicState(room, 'student-a').own, undefined);
  assert.equal(publicState(room, 'teacher').roster.length, 1);
  const rejoined = mutator(room, data, 'join-room', { teamName: 'Nova Equipe' }, 'student-a');
  assert.notEqual(rejoined.result.teamId, 'a');
  assert.equal(publicState(room, 'teacher').roster.length, 2);
});

test('incidents, prizes and purchases are applied once between races', () => {
  const { room, data, teacher, teams } = fixture();
  mutator(room, data, 'build-heats', {}, teacher);
  const heat = data.heats[0];
  mutator(room, data, 'race-action', { heatId: heat.id, command: 'start' }, teacher);
  heat.incidents = [{ fraction: .23, teamId: 'a', type: 'spin', applied: false }, { fraction: .51, teamId: 'b', type: 'crash', applied: false }];
  data.qteEnabled = false;
  heat.startAt = Date.now() - heat.duration - 100;
  mutator(room, data, 'sync-race', { heatId: heat.id, activeTeamIds: ['a', 'b'] }, 'student-a');
  assert.equal(heat.status, 'running');
  assert.ok(heat.duration > heat.clockDuration);
  heat.startAt = Date.now() - heat.duration - 100;
  const result = mutator(room, data, 'sync-race', { heatId: heat.id, activeTeamIds: ['a', 'b'] }, 'student-a');
  assert.equal(heat.status, 'finished');
  assert.equal(heat.participants.find(p => p.teamId === 'a').incidentPenalty, 1300);
  assert.ok(heat.participants.find(p => p.teamId === 'a').incidentStopAt > 0);
  assert.equal(heat.participants.find(p => p.teamId === 'b').dnf, true);
  assert.equal(heat.prizes.a, 300);
  assert.equal(heat.prizes.b, 60);
  assert.equal(teams.a.wallet, 1500);
  assert.equal(teams.b.wallet, 1260);
  assert.equal(result.finances.length, 2);
  assert.equal(mutator(room, data, 'sync-race', { heatId: heat.id }, 'student-a').finances.length, 0);
  assert.equal(teams.a.wallet, 1500);
  assert.equal(publicState(room, 'student-a').heats[0].history.filter(x => x.type === 'incident').length, 2);
  mutator(room, data, 'equip-part', { slot: 'tires', partId: 'TIRE_SPORT' }, 'student-a');
  assert.equal(teams.a.parts.tires, 'TIRE_SPORT');
  mutator(room, data, 'build-final', {}, teacher);
  const final = data.heats.at(-1);
  assert.equal(final.laps, 2);
  mutator(room, data, 'equip-part', { slot: 'engine', partId: 'MOTOR_ECO' }, 'student-a');
  mutator(room, data, 'race-action', { heatId: final.id, command: 'start' }, teacher);
  assert.equal(final.participants.find(p => p.teamId === 'a').snapshot.parts.tires, 'TIRE_SPORT');
  assert.throws(() => mutator(room, data, 'equip-part', { slot: 'tires', partId: 'TIRE_STANDARD' }, 'student-a'), e => e.code === 'INVALID_ROOM_STATE');
  assert.equal(racePrize(1), 300);
  assert.equal(racePrize(5), 100);
  assert.equal(racePrize(1, true), 60);
});

test('repair kit applies to one race and a prior assignment without stock does not block the next start', () => {
  const { room, data, teacher, teams } = fixture(3, 1);
  teams.a.lots.push({ id: 'a-repair', kind: 'repair', quantity: 1, paid: 20 });
  teams.a.repairAssigned = true;
  mutator(room, data, 'build-heats', {}, teacher);
  const first = data.heats[0];
  mutator(room, data, 'race-action', { heatId: first.id, command: 'start' }, teacher);
  assert.equal(first.participants.find(p => p.teamId === 'a').repair, true);
  assert.equal(inventory(teams.a, 'repair'), 0);
  assert.equal(teams.a.repairAssigned, false);
  first.status = 'finished';
  teams.a.repairAssigned = true; // State persisted by the previous version.
  mutator(room, data, 'build-heats', {}, teacher);
  const second = data.heats.at(-1);
  mutator(room, data, 'race-action', { heatId: second.id, command: 'start' }, teacher);
  assert.equal(second.participants.find(p => p.teamId === 'a').repair, false);
  assert.equal(teams.a.repairAssigned, false);
});

test('technical repeat preserves the repair benefit without consuming another kit', () => {
  const { room, data, teacher, teams } = fixture();
  teams.a.lots.push({ id: 'a-repair', kind: 'repair', quantity: 1, paid: 20 });
  teams.a.repairAssigned = true;
  mutator(room, data, 'build-heats', {}, teacher);
  const first = data.heats[0];
  mutator(room, data, 'race-action', { heatId: first.id, command: 'start' }, teacher);
  first.startAt = Date.now() - 1;
  first.status = 'running';
  mutator(room, data, 'race-action', { heatId: first.id, command: 'cancel' }, teacher);
  mutator(room, data, 'race-action', { heatId: first.id, command: 'repeat' }, teacher);
  const repeated = data.heats.at(-1);
  assert.equal(publicState(room, teacher).heats.at(-1).freeSupplies, true);
  mutator(room, data, 'race-action', { heatId: repeated.id, command: 'start' }, teacher);
  assert.equal(repeated.participants.find(p => p.teamId === 'a').repair, true);
  assert.equal(inventory(teams.a, 'repair'), 0);
});

test('cancelling before the start restores the repair assignment for a repeat', () => {
  const { room, data, teacher, teams } = fixture();
  teams.a.lots.push({ id: 'a-repair', kind: 'repair', quantity: 1, paid: 20 });
  teams.a.repairAssigned = true;
  mutator(room, data, 'build-heats', {}, teacher);
  const first = data.heats[0];
  mutator(room, data, 'race-action', { heatId: first.id, command: 'start' }, teacher);
  mutator(room, data, 'race-action', { heatId: first.id, command: 'cancel' }, teacher);
  assert.equal(inventory(teams.a, 'repair'), 1);
  assert.equal(teams.a.repairAssigned, true);
  mutator(room, data, 'race-action', { heatId: first.id, command: 'repeat' }, teacher);
  const repeated = data.heats.at(-1);
  assert.equal(repeated.freeSupplies, false);
  mutator(room, data, 'race-action', { heatId: repeated.id, command: 'start' }, teacher);
  assert.equal(repeated.participants.find(p => p.teamId === 'a').repair, true);
  assert.equal(inventory(teams.a, 'repair'), 0);
});

test('teacher can create configured rounds before the final', () => {
  const { room, data, teacher } = fixture(3, 4);
  mutator(room, data, 'build-heats', {}, teacher);
  assert.equal(data.heats[0].round, 1);
  assert.equal(data.heats[0].laps, 4);
  assert.throws(() => mutator(room, data, 'build-heats', {}, teacher), e => e.code === 'INVALID_ROOM_STATE');
  data.heats[0].status = 'finished';
  data.heats[0].participants.forEach(p => { p.final = 100000; p.rank = 1; });
  mutator(room, data, 'build-heats', {}, teacher);
  assert.equal(data.heats[1].round, 2);
  assert.equal(data.heats[0].round, 1);
  assert.throws(() => mutator(room, data, 'build-final', {}, teacher), e => e.code === 'INVALID_ROOM_STATE');
  data.heats[1].status = 'finished';
  data.heats[1].participants.forEach(p => { p.final = 95000; p.rank = 1; });
  mutator(room, data, 'build-final', {}, teacher);
  assert.equal(data.heats.at(-1).round, 3);
  assert.equal(data.heats.at(-1).type, 'final');
});

test('one-round room can show results without creating a final', () => {
  const { room, data, teacher } = fixture(1, 5);
  mutator(room, data, 'build-heats', {}, teacher);
  assert.equal(data.heats[0].laps, 5);
  data.heats[0].status = 'finished';
  assert.equal(mutator(room, data, 'room-transition', { phase: 'RESULTS' }, teacher).result.phase, 'RESULTS');
  assert.throws(() => mutator(room, data, 'build-final', {}, teacher), e => e.code === 'INVALID_ROOM_STATE');
});

test('race screen exposes lap, sector, incidents, standings and a stable reaction control', () => {
  const { room, data, teacher } = fixture(2, 4);
  mutator(room, data, 'build-heats', {}, teacher);
  const heat = data.heats[0];
  mutator(room, data, 'race-action', { heatId: heat.id, command: 'start' }, teacher);
  const snapshot = publicState(room, 'student-a');
  const html = raceView({ state: snapshot, heat: snapshot.heats[0], serverOffset: 0, esc: x => String(x), sec: x => `${x} s`, button: label => `<button>${label}</button>`, canUpgrade: () => false });
  assert.match(html, /4 VOLTAS/);
  assert.match(html, /Rádio da corrida/);
  assert.match(html, /Telemetria/);
  assert.match(html, /Classificação/);
  assert.match(html, /SETOR 01/);
  assert.equal(heat.participants[0].sectorTimes.length, 24);
  assert.ok(carProgress(snapshot.heats[0].participants[0], 0) <= carProgress(snapshot.heats[0].participants[0], 2000));
  const spinning = { sectorTimes: Array(6).fill(1000), incidentStopAt: 2000, incidentPenalty: 1300 };
  assert.equal(carProgress(spinning, 2500), carProgress(spinning, 2000));
  heat.event = { id: 'event-id', type: 'reaction', checkpoint: 1, front: 'a', behind: 'b', opensAt: Date.now() + 500, closesAt: Date.now() + 4500, status: 'open', inputs: {} };
  const duelState = publicState(room, 'student-a');
  const duel = raceView({ state: duelState, heat: duelState.heats[0], serverOffset: 0, esc: x => String(x), sec: x => `${x} s`, button: () => '', canUpgrade: () => false });
  assert.match(duel, /data-event-id="event-id"/);
  assert.match(duel, /AGUARDE/);
  assert.match(duel, /data-action="qte-touch" disabled/);
});
