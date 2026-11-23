import test from 'node:test';
import assert from 'node:assert/strict';
import { newTeam, SLOTS, checklist } from '../shared/game.js';
import { mutator } from '../server/core.js';

test('student can repeat an unchanged project, submit a numeric conclusion and become ready', () => {
  const student = 'student-id';
  const team = newTeam('team-id', student, 'Equipe Teste', '#44b6d7', 1);
  team.pilot = 'PILOT_1';
  team.mechanic = 'MECH_1';
  team.parts = Object.fromEntries(SLOTS.map((slot, index) => [slot, ['MOTOR_ECO', 'CHASSIS_REINFORCED', 'TIRE_STANDARD', 'SUSP_BASIC', 'AERO_LOWDRAG', 'BRAKE_BASIC'][index]]));
  team.lots = [{ kind: 'fuel', quantity: 1 }, { kind: 'tires', quantity: 1 }];
  const room = { id: 'room-id', teacher_user_id: 'teacher-id' };
  const data = { phase: 'TESTING', circuitId: 'balance', teams: { [team.id]: team }, events: [] };

  const first = mutator(room, data, 'run-test', {}, student).result.test;
  assert.equal(first.number, 1);
  mutator(room, data, 'submit-analysis', { target: 'C', change: 'manter o projeto', reason: 'confirmar o tempo' }, student);
  const second = mutator(room, data, 'run-test', {}, student).result;
  assert.equal(second.test.number, 2);
  assert.deepEqual(second.test.snapshot, first.snapshot);
  assert.deepEqual(second.comparison.changed, []);
  assert.equal(second.comparison.delta, 0);

  assert.throws(() => mutator(room, data, 'submit-analysis', { evaluation: '', evidence: 'Setor 2: 8,2 s' }, student), error => error.message === 'Escolha o resultado da comparação.');
  assert.throws(() => mutator(room, data, 'submit-analysis', { evaluation: 'unchanged', evidence: 'Tempos iguais' }, student), error => error.message.includes('Digite um número do relatório'));
  mutator(room, data, 'submit-analysis', { evaluation: 'unchanged', evidence: 'Setor 2: 8,2 s nos dois testes' }, student);
  assert.deepEqual(checklist(team), []);
  assert.equal(mutator(room, data, 'set-ready', { ready: true }, student).result.ready, true);
});
