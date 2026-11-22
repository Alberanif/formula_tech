import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as game from '../shared/game.js';
import { publicState } from '../server/core.js';

test('temporary state failure after a student joins keeps the teacher in the room', async () => {
  const teacherId = 'teacher-id';
  const roomId = 'room-id';
  const team = game.newTeam('team-id', 'student-id', 'Equipe Teste', '#44b6d7', 1);
  const room = {
    id: roomId,
    name: 'Turma A',
    teacher_user_id: teacherId,
    code_display: 'ABCD2345',
    version: 2,
    data: { phase: 'LOBBY', circuitId: 'balance', mode: 'standard', market: 'M0', qteEnabled: true, maxPlayers: 10, carsPerHeat: 5, teams: { [team.id]: team }, heats: [], events: [], awards: {} },
  };
  const saved = new Map([['ft_room', roomId]]);
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const app = { innerHTML: '', addEventListener() {} };
  const document = { getElementById: () => app, body: { classList: { toggle() {} } }, addEventListener() {}, activeElement: null };
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/boot\(\);\s*$/, '');
  let responseBody = { ok: false, code: 'SERVER_ERROR', message: 'Falha temporária.' };
  const context = {
    ...game,
    document,
    URLSearchParams,
    location: { search: '' },
    localStorage: storage,
    sessionStorage: { getItem: () => null },
    fetch: async () => ({ json: async () => responseBody }),
    setTimeout: () => 0,
    setInterval: () => 0,
  };
  runInNewContext(source + '\nglobalThis.testClient = { ui, load, render, openRoom, setTeacher(value, snapshot) { user = value; state = snapshot; ui.screen = "teacher"; }, setStudent(value, snapshot) { user = value; state = snapshot; ui.screen = "overview"; }, showCreate() { state = null; ui.screen = "create"; } };', context);
  context.testClient.setTeacher({ id: teacherId, role: 'teacher' }, publicState(room, teacherId));
  context.testClient.render();
  assert.match(app.innerHTML, /Equipe Teste/);
  assert.match(app.innerHTML, /<th>Ações<\/th>/);
  assert.match(app.innerHTML, /<td class="team-action-cell"><button[^>]*data-action="remove-team"[^>]*data-team="team-id"[^>]*>Excluir<\/button><\/td>/);

  await context.testClient.load();

  assert.equal(context.testClient.ui.roomId, roomId);
  assert.equal(storage.getItem('ft_room'), roomId);
  assert.match(app.innerHTML, /Equipe Teste/);
  assert.match(app.innerHTML, /Abrir construção/);
  assert.match(app.innerHTML, /Tentar novamente/);

  responseBody = { ok: true, data: publicState(room, teacherId) };
  await context.testClient.load();
  assert.equal(context.testClient.ui.connectionError, '');
  assert.equal(context.testClient.ui.roomId, roomId);
  assert.doesNotMatch(app.innerHTML, /Tentar novamente/);

  context.testClient.ui.teacherRooms = [{ id: roomId, name: room.name, phase: 'LOBBY', teamCount: 1, createdAt: new Date().toISOString() }];
  context.testClient.showCreate();
  context.testClient.render();
  assert.match(app.innerHTML, /Salas existentes/);
  assert.match(app.innerHTML, /Abrir sala/);
  await context.testClient.openRoom(roomId);
  assert.match(app.innerHTML, /Equipe Teste/);
  assert.equal(storage.getItem('ft_room'), roomId);

  context.testClient.setStudent({ id: 'student-id', role: 'student' }, publicState(room, 'student-id'));
  responseBody = { ok: false, code: 'TEAM_REMOVED', message: 'Sua escuderia foi excluída desta sala pelo professor.' };
  await context.testClient.load();
  assert.equal(context.testClient.ui.roomId, null);
  assert.equal(storage.getItem('ft_room'), null);
  assert.equal(context.testClient.ui.screen, 'welcome');
  assert.match(app.innerHTML, /Sua escuderia foi excluída/);
});
