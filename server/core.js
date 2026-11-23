import { VERSION, PARTS, PILOTS, MECHANICS, CIRCUITS, SUPPLIES, MARKET, SLOTS, findPart, findPilot, findMechanic, newTeam, attributes, supplyNeeds, marketPrice, fixedCost, inventory, completeCar, simulate, checklist, compareTests } from "../shared/game.js";
import { randomBytes, randomUUID, randomInt, createHash } from "node:crypto";
const err = (code2, message, details = {}) => {
  throw { code: code2, message, details };
};
const now = () => Date.now();
const uid = () => randomUUID();
const clean = (value, max = 160) => String(value ?? "").replace(/[<>\x00-\x1f]/g, "").trim().slice(0, max);
const banned = /\b(porra|caralho|foda|puta|merda)\b/i;
const hash = async (value) => createHash("sha256").update(value + (process.env.ROOM_CODE_PEPPER || "")).digest("hex");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RACE_SPEEDS = [1, 2, 4, 6, 8];
const QTE_SCENARIOS = ["Largada lado a lado", "Disputa na primeira curva", "Ataque na reta", "Defesa na freada", "Saída de curva", "Vácuo na reta oposta", "Disputa no setor técnico", "Ultrapassagem por fora", "Pressão na última curva", "Sprint para a linha"];
const qteCount = (laps) => Math.max(10, (laps || 3) * 3 + 1);
function code(length = 8) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
function respond(origin, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": origin, "vary": "Origin", "access-control-allow-headers": "authorization,apikey,content-type", "access-control-allow-methods": "POST,OPTIONS" } });
}
function publicState(room, user, projection = false) {
  const data = room.data, own = Object.values(data.teams).find((t) => t.owner === user && !t.removed);
  const roster = Object.values(data.teams).filter((t) => !t.removed).map((t) => ({ id: t.id, name: t.name, color: t.color, number: t.number, ready: t.ready, tests: t.tests.length, complete: completeCar(t) }));
  const heats = data.heats.map((h) => ({ id: h.id, type: h.type, round: h.round || 1, laps: h.laps || 3, number: h.number, status: h.status, speed: h.speed || 1, startAt: h.startAt, pauseTotal: h.pauseTotal, pausedAt: h.status === "admin_paused" ? h.adminPausedAt : h.pausedAt, checkpoint: h.checkpoint, duration: h.duration, prizes: h.prizes || {}, history: h.history, participants: h.participants.map((p) => ({ teamId: p.teamId, name: p.name, color: p.color, number: p.number, base: p.base, adjust: p.adjust, final: p.final, rank: p.rank, sectorTimes: p.sectorTimes, dnf: !!p.dnf, dnfProgress: p.dnfProgress, incidentPenalty: p.incidentPenalty || 0, incidentStopAt: p.incidentStopAt })), event: h.event ? { id: h.event.id, type: h.event.type, title: h.event.title, front: h.event.front, behind: h.event.behind, opensAt: h.event.opensAt, closesAt: h.event.closesAt, sequence: h.event.sequence, precision: h.event.precision, status: h.event.status, result: h.event.result } : null }));
  return { room: { id: room.id, name: room.name, phase: data.phase, circuitId: data.circuitId, mode: data.mode, market: data.market, qteEnabled: data.qteEnabled, raceSpeed: data.raceSpeed || 4, maxPlayers: data.maxPlayers, carsPerHeat: data.carsPerHeat, raceCount: data.raceCount || 2, lapsPerRace: data.lapsPerRace || 3, teacherId: room.teacher_user_id, version: room.version, code: user === room.teacher_user_id ? room.code_display : void 0 }, roster, own: projection ? void 0 : own, teacherTeams: user === room.teacher_user_id ? Object.values(data.teams) : void 0, heats, awards: data.awards, events: data.events.slice(-30), serverTime: now(), catalog: { parts: PARTS, pilots: PILOTS, mechanics: MECHANICS, circuits: CIRCUITS, supplies: SUPPLIES, market: MARKET }, configVersion: VERSION };
}
function getTeam(data, user) {
  const team = Object.values(data.teams).find((t) => t.owner === user && !t.removed);
  if (!team) err("NOT_AUTHORIZED", "Voc\xEA n\xE3o pertence a esta sala.");
  return team;
}
function requireTeacher(room, user) {
  if (room.teacher_user_id !== user) err("NOT_AUTHORIZED", "Apenas o professor pode fazer isso.");
}
function editable(data, team) {
  if (["TEAM_BUILD", "TESTING"].includes(data.phase)) return;
  if (data.heats.some((h) => ["countdown", "running", "qte_paused", "admin_paused"].includes(h.status) && h.participants.some((p) => p.teamId === team?.id))) err("INVALID_ROOM_STATE", "Aguarde sua corrida terminar para fazer melhorias.");
  const qualifier = data.heats.find((h) => h.type === "qualifier" && h.status === "finished" && h.participants.some((p) => p.teamId === team?.id));
  const final = data.heats.find((h) => h.type === "final" && h.participants.some((p) => p.teamId === team?.id));
  if (data.phase === "QUALIFYING" && (data.raceCount || 2) > 1 && qualifier && !final) return;
  if (data.phase === "FINAL" && final?.status === "created") return;
  err("INVALID_ROOM_STATE", "Melhorias disponíveis após sua classificatória e antes da largada da final.");
}
function spend(team, amount, kind) {
  if (team.wallet < amount) err("INSUFFICIENT_FUNDS", `Saldo insuficiente: faltam ${amount - team.wallet} cr\xE9ditos.`, { required: amount, available: team.wallet });
  team.wallet -= amount;
  team.ledger.push({ kind, amount: -amount, balance: team.wallet, at: (/* @__PURE__ */ new Date()).toISOString() });
}
function refund(team, amount, kind) {
  team.wallet += amount;
  team.ledger.push({ kind, amount, balance: team.wallet, at: (/* @__PURE__ */ new Date()).toISOString() });
}
function event(data, type, detail = {}) {
  data.events.push({ id: uid(), type, detail, at: (/* @__PURE__ */ new Date()).toISOString() });
}
function snapshot(team) {
  return { pilot: team.pilot, mechanic: team.mechanic, aux: team.aux, parts: { ...team.parts } };
}
function consume(team, kind, count) {
  let remaining = count;
  for (const lot of team.lots.filter((l) => l.kind === kind)) {
    const n = Math.min(lot.quantity, remaining);
    lot.quantity -= n;
    remaining -= n;
    if (!remaining) break;
  }
  if (remaining) err("MISSING_SUPPLIES", "Faltam suprimentos para a corrida.");
  team.lots = team.lots.filter((l) => l.quantity > 0);
}
function financial(team, previous, action) {
  return previous === team.wallet ? [] : [{ team_id: team.id, action, amount: team.wallet - previous, balance: team.wallet }];
}
function withRoster(data, ids) {
  return ids.map((id) => {
    const t = data.teams[id];
    return { teamId: t.id, name: t.name, color: t.color, number: t.number, base: null, adjust: 0, final: null, rank: null, snapshot: snapshot(t), sectorTimes: [], repair: t.repairAssigned, dnf: false, incidentPenalty: 0 };
  });
}
function rank(h) {
  h.participants.sort((a, b) => Number(a.dnf) - Number(b.dnf) || (a.final ?? a.base + a.adjust) - (b.final ?? b.base + b.adjust) || a.base - b.base || b.mixedScore - a.mixedScore);
  h.participants.forEach((p, i) => {
    const prior = h.participants[i - 1];
    p.rank = prior && p.final === prior.final && p.base === prior.base && p.mixedScore === prior.mixedScore ? prior.rank : i + 1;
  });
}
function projected(h, fraction) {
  return [...h.participants].map((p) => ({ ...p, projected: p.base * fraction + p.adjust })).sort((a, b) => a.projected - b.projected);
}
export function racePrize(rank, dnf = false, withdrawn = false) {
  return withdrawn ? 0 : dnf ? 60 : [300, 240, 180, 140, 100][Math.min(Math.max(rank, 1), 5) - 1];
}
function scheduleIncidents(h) {
  const targets = [...h.participants];
  h.incidents = [0.18, 0.45, 0.96].map((fraction, incidentIndex) => {
    if (!targets.length) targets.push(...h.participants);
    const total = targets.reduce((sum, p) => sum + Math.max(10, 110 - p.reliability), 0);
    let draw = randomInt(total), index = 0;
    for (; index < targets.length - 1; index++) { draw -= Math.max(10, 110 - targets[index].reliability); if (draw < 0) break; }
    const [target] = targets.splice(index, 1);
    const roll = randomInt(100), crashChance = incidentIndex === 2 ? (target.reliability < 35 ? 10 : 4) : 0;
    return { fraction, teamId: target.teamId, type: roll < crashChance ? "crash" : roll < 47 ? "breakdown" : "spin", applied: false };
  });
}
function applyIncidents(h, logical) {
  for (const incident of h.incidents || []) {
    if (incident.applied || logical < (h.clockDuration || h.duration) * incident.fraction) continue;
    incident.applied = true;
    const p = h.participants.find((x) => x.teamId === incident.teamId);
    if (!p || p.dnf) continue;
    const penalty = incident.type === "spin" ? 1300 : incident.type === "breakdown" ? 2600 : 0;
    if (incident.type === "crash") { p.dnf = true; p.dnfProgress = incident.fraction; }
    else { p.adjust += penalty; p.incidentPenalty = (p.incidentPenalty || 0) + penalty; p.incidentStopAt = (h.clockDuration || h.duration) * incident.fraction; }
    h.history.push({ type: "incident", teamId: p.teamId, incidentType: incident.type, penalty, at: new Date().toISOString() });
  }
}
function resolveQte(h) {
  const e = h.event;
  if (!e || e.status !== "open") return;
  const a = e.inputs[e.front], b = e.inputs[e.behind];
  let winner = null;
  if (a?.valid && b?.valid && Math.abs(a.at - b.at) > 50) winner = a.at < b.at ? e.front : e.behind;
  else if (a?.valid && !b?.valid) winner = e.front;
  else if (b?.valid && !a?.valid) winner = e.behind;
  e.status = "resolved";
  e.result = { winner, front: e.front, behind: e.behind, frontValid: !!a?.valid, behindValid: !!b?.valid, frontMs: a?.valid ? a.at - e.opensAt : null, behindMs: b?.valid ? b.at - e.opensAt : null };
  const front = h.participants.find((p) => p.teamId === e.front), behind = h.participants.find((p) => p.teamId === e.behind);
  if (winner === e.behind) {
    behind.adjust -= 700;
    front.adjust += 150;
  } else if (winner === e.front) {
    front.adjust -= 350;
    behind.adjust += 200;
  }
  h.pauseTotal += now() - h.pausedAt;
  h.pausedAt = null;
  h.status = "running";
  h.history.push({ type: "qte", checkpoint: e.checkpoint, result: e.result, at: (/* @__PURE__ */ new Date()).toISOString() });
}
function advanceRace(h, data) {
  const t = now();
  if (h.status === "countdown" && t >= h.startAt) h.status = "running";
  if (h.status === "qte_paused") {
    if (t >= h.event.closesAt) {
      resolveQte(h);
    } else return [];
  }
  if (h.status !== "running") return [];
  const logical = Math.max(0, (t - h.startAt - h.pauseTotal) * (h.speed || 1)), baseDuration = h.clockDuration || h.duration, count = qteCount(h.laps), thresholds = Array.from({ length: count }, (_, i) => (i + 1) / (count + 1));
  while (h.checkpoint < thresholds.length && logical >= baseDuration * thresholds[h.checkpoint]) {
    const cp = h.checkpoint++;
    applyIncidents(h, baseDuration * thresholds[cp]);
    if (!data.qteEnabled) continue;
    const positions = projected(h, thresholds[cp]).filter((p) => !p.dnf);
    const pairs = positions.slice(0, -1).map((front, i) => [front, positions[i + 1]]);
    const pair = pairs.length ? pairs[cp % pairs.length] : null;
    if (pair) {
      const [front, behind] = pair;
      const opensAt = t + 1600;
      h.event = { id: uid(), checkpoint: cp + 1, type: "reaction", title: QTE_SCENARIOS[cp % QTE_SCENARIOS.length], front: front.teamId, behind: behind.teamId, opensAt, closesAt: opensAt + 4e3, status: "open", inputs: {} };
      h.status = "qte_paused";
      h.pausedAt = t;
      h.history.push({ type: "qte_open", checkpoint: cp + 1, title: h.event.title, at: (/* @__PURE__ */ new Date()).toISOString() });
      break;
    }
  }
  if (h.status === "running") applyIncidents(h, logical);
  h.duration = Math.max(h.duration, ...h.participants.filter((p) => !p.dnf).map((p) => p.base + Math.max(0, p.adjust)));
  if (h.status === "running" && logical >= h.duration) {
    h.status = "finished";
    h.finishedAt = t;
    h.participants.forEach((p) => p.final = p.dnf ? null : p.base + p.adjust);
    rank(h);
    const prizes = h.participants.flatMap((p) => {
      const team = data.teams[p.teamId], amount = racePrize(p.rank, p.dnf, p.withdrawn);
      if (!amount) return [];
      refund(team, amount, "race_prize");
      return [{ team_id: team.id, action: "race_prize", amount, balance: team.wallet }];
    });
    h.prizes = Object.fromEntries(h.participants.map((p) => [p.teamId, racePrize(p.rank, p.dnf, p.withdrawn)]));
    if (h.type === "final") data.awards.champion = h.participants.find((p) => !p.dnf)?.teamId || null;
    const improved = Object.values(data.teams).map((team) => ({ teamId: team.id, comparison: compareTests(team.tests[0], team.tests[1]) })).filter((x) => x.comparison?.changed.length && x.comparison.percent > 0).sort((a, b) => b.comparison.percent - a.comparison.percent);
    if (improved.length) data.awards.evolution = improved[0].teamId;
    event(data, "heat.finished", { heatId: h.id, type: h.type });
    return prizes;
  }
  return [];
}
function mutator(room, data, action, p, user) {
  const audit = {};
  let finances = [];
  let result = {};
  if (["team-action", "equip-part", "unequip-part", "purchase-supply", "refund-supply", "assign-repair", "run-test"].includes(action) || action === "submit-analysis" && data.phase === "TESTING") {
    const team = getTeam(data, user);
    if (team.ready && ["TEAM_BUILD", "TESTING"].includes(data.phase)) {
      team.ready = false;
      event(data, "team.ready", { teamId: team.id, ready: false });
    }
  }
  if (action === "join-room") {
    const existing = Object.values(data.teams).find((t) => t.owner === user && !t.removed);
    if (existing) {
      return { data, result: { teamId: existing.id, roomId: room.id, reconnected: true }, audit, finances };
    }
    if (Object.values(data.teams).some((t) => t.owner === user && t.removed && !t.left)) err("TEAM_REMOVED", "Sua escuderia foi excluída desta sala pelo professor.");
    if (!["LOBBY", "TEAM_BUILD", "TESTING"].includes(data.phase)) err("ROOM_CLOSED", "Esta sala n\xE3o aceita novas equipes.");
    if (Object.values(data.teams).filter((t) => !t.removed).length >= data.maxPlayers) err("ROOM_FULL", "A sala est\xE1 cheia.");
    const name = clean(p.teamName, 20);
    if (name.length < 3 || banned.test(name)) err("INVALID_NAME", "Escolha um nome fict\xEDcio de 3 a 20 caracteres.");
    if (Object.values(data.teams).some((t) => !t.removed && t.name.toLowerCase() === name.toLowerCase())) err("DUPLICATE_NAME", "J\xE1 existe uma escuderia com este nome.");
    const colors = ["#f05d5e", "#44b6d7", "#edbb4f", "#c48bec", "#6ed0a4", "#ff8d53", "#8caaed", "#f38cb2"];
    const color = colors.includes(p.color) ? p.color : colors[Object.keys(data.teams).length % colors.length];
    const id = uid(), number = Object.keys(data.teams).length + 1;
    data.teams[id] = newTeam(id, user, name, color, number);
    event(data, "team.joined", { teamId: id, name });
    finances = [{ team_id: id, action: "initial_credit", amount: 1200, balance: 1200 }];
    result = { teamId: id, roomId: room.id };
  } else if (action === "team-action") {
    const t = getTeam(data, user), old = t.wallet, kind = p.kind, item = p.itemId;
    editable(data, t);
    if (kind === "pilot") {
      const candidate = item ? findPilot(item) : null;
      if (item && !candidate) err("INVALID_ITEM", "Piloto inv\xE1lido.");
      const paid = t.receipts.pilot || 0, price = candidate?.price || 0;
      if (old + paid < price) err("INSUFFICIENT_FUNDS", `Saldo insuficiente: faltam ${price - old - paid} cr\xE9ditos.`);
      t.wallet += paid - price;
      t.pilot = item || null;
      t.receipts.pilot = price;
    } else if (kind === "mechanic") {
      const candidate = item ? findMechanic(item) : null;
      if (item && !candidate) err("INVALID_ITEM", "Mec\xE2nico inv\xE1lido.");
      const invalid = SLOTS.filter((s) => findPart(s, t.parts[s])?.level > (candidate?.level || 0));
      if (invalid.length) err("PART_REQUIREMENT_NOT_MET", `Troque antes as pe\xE7as incompat\xEDveis: ${invalid.join(", ")}.`, { slots: invalid });
      const paid = t.receipts.mechanic || 0, price = candidate?.price || 0;
      if (old + paid < price) err("INSUFFICIENT_FUNDS", `Saldo insuficiente: faltam ${price - old - paid} cr\xE9ditos.`);
      t.wallet += paid - price;
      t.mechanic = item || null;
      t.receipts.mechanic = price;
    } else if (kind === "aux") {
      const enabled = !!p.enabled, price = enabled ? 80 : 0, paid = t.receipts.aux || 0;
      if (old + paid < price) err("INSUFFICIENT_FUNDS", `Saldo insuficiente: faltam ${price - old - paid} cr\xE9ditos.`);
      t.wallet += paid - price;
      t.aux = enabled;
      t.receipts.aux = price;
    } else err("INVALID_ACTION", "A\xE7\xE3o de equipe inv\xE1lida.");
    t.ledger.push({ kind: "staff_change", amount: t.wallet - old, balance: t.wallet, at: (/* @__PURE__ */ new Date()).toISOString() });
    finances = financial(t, old, "staff_change");
    result = { team: t };
  } else if (action === "equip-part") {
    const t = getTeam(data, user), part = findPart(p.slot, p.partId);
    editable(data, t);
    if (!part) err("INVALID_ITEM", "Pe\xE7a inv\xE1lida.");
    const level = findMechanic(t.mechanic)?.level || 0;
    if (part.level > level) err("PART_REQUIREMENT_NOT_MET", `Esta pe\xE7a exige mec\xE2nico n\xEDvel ${part.level}. Seu mec\xE2nico atual \xE9 n\xEDvel ${level}.`);
    const old = t.wallet, paid = t.receipts[p.slot] || 0;
    if (old + paid < part.price) err("INSUFFICIENT_FUNDS", `Saldo insuficiente: faltam ${part.price - old - paid} cr\xE9ditos.`);
    t.wallet += paid - part.price;
    t.parts[p.slot] = part.id;
    t.receipts[p.slot] = part.price;
    t.ledger.push({ kind: "part_change", amount: t.wallet - old, balance: t.wallet, at: (/* @__PURE__ */ new Date()).toISOString() });
    finances = financial(t, old, "part_change");
    result = { team: t, attributes: attributes(t) };
  } else if (action === "unequip-part") {
    const t = getTeam(data, user), slot = p.slot;
    editable(data, t);
    if (!SLOTS.includes(slot) || !t.parts[slot]) err("INVALID_ITEM", "Nenhuma pe\xE7a instalada neste slot.");
    const old = t.wallet, paid = t.receipts[slot] || 0;
    delete t.parts[slot];
    delete t.receipts[slot];
    refund(t, paid, "part_refund");
    finances = financial(t, old, "part_refund");
    result = { team: t };
  } else if (action === "purchase-supply") {
    const t = getTeam(data, user), kind = p.kind, quantity = Number(p.quantity);
    editable(data, t);
    if (!SUPPLIES[kind] || !Number.isInteger(quantity) || quantity < 1 || quantity > 8) err("INVALID_QUANTITY", "Quantidade inv\xE1lida.");
    if (inventory(t, kind) + quantity > 8) err("STOCK_LIMIT", "O limite \xE9 8 unidades por suprimento.");
    if (p.marketPhase !== data.market) err("PURCHASE_QUOTE_EXPIRED", "O pre\xE7o mudou. Confira a nova cota\xE7\xE3o.");
    const price = marketPrice(kind, data.market, t.aux), old = t.wallet;
    spend(t, price * quantity, "supply_buy");
    t.lots.push({ id: uid(), kind, quantity, paid: price, phase: data.market });
    finances = financial(t, old, "supply_buy");
    result = { team: t, unitPrice: price };
  } else if (action === "refund-supply") {
    const t = getTeam(data, user), lot = t.lots.find((l) => l.id === p.lotId), quantity = Number(p.quantity);
    editable(data, t);
    if (!lot || !Number.isInteger(quantity) || quantity < 1 || quantity > lot.quantity) err("INVALID_QUANTITY", "Lote ou quantidade inv\xE1lida.");
    const old = t.wallet;
    lot.quantity -= quantity;
    refund(t, lot.paid * quantity, "supply_refund");
    t.lots = t.lots.filter((l) => l.quantity > 0);
    finances = financial(t, old, "supply_refund");
    result = { team: t };
  } else if (action === "assign-repair") {
    const t = getTeam(data, user);
    editable(data, t);
    if (p.enabled && inventory(t, "repair") < 1) err("MISSING_SUPPLIES", "Compre um kit de reparos primeiro.");
    t.repairAssigned = !!p.enabled;
    result = { team: t };
  } else if (action === "run-test") {
    if (data.phase !== "TESTING") err("INVALID_ROOM_STATE", "O professor ainda n\xE3o abriu o Centro de Testes.");
    const t = getTeam(data, user);
    if (!completeCar(t)) err("TEAM_INCOMPLETE", "Complete o carro e a equipe antes de testar.");
    if (t.tests.length === 1 && (!t.analysis.target || !t.analysis.change || !t.analysis.reason)) err("ANALYSIS_INCOMPLETE", "Registre a hip\xF3tese antes do segundo teste.");
    const old = t.wallet, fee = t.tests.length >= 2 ? 12 : 0;
    if (fee) spend(t, fee, "test_fee");
    const resultSim = simulate(t, data.circuitId, 1, false), test = { id: uid(), number: t.tests.length + 1, at: (/* @__PURE__ */ new Date()).toISOString(), snapshot: snapshot(t), fixedCost: fixedCost(t), result: resultSim, fee };
    t.tests.push(test);
    finances = financial(t, old, "test_fee");
    result = { test, comparison: compareTests(t.tests.at(-2), test), team: t };
  } else if (action === "submit-analysis") {
    if (!["TESTING", "RESULTS"].includes(data.phase)) err("INVALID_ROOM_STATE", "An\xE1lise indispon\xEDvel nesta etapa.");
    const t = getTeam(data, user), a = t.analysis;
    if (data.phase === "RESULTS" && p.keep === void 0) err("INVALID_ROOM_STATE", "Ap\xF3s a corrida, apenas a reflex\xE3o final pode mudar.");
    if (p.target !== void 0) {
      if (t.tests.length < 1) err("ANALYSIS_INCOMPLETE", "Fa\xE7a o primeiro teste.");
      if (!["R", "C", "M"].includes(p.target) || !clean(p.change, 80) || !clean(p.reason, 160)) err("INVALID_ANALYSIS", "Preencha gargalo, decis\xE3o e motivo.");
      a.target = p.target;
      a.change = clean(p.change, 80);
      a.reason = clean(p.reason, 160);
    }
    if (p.evaluation !== void 0) {
      if (t.tests.length < 2) err("ANALYSIS_INCOMPLETE", "Fa\xE7a o segundo teste.");
      if (!["improved", "partially", "not_improved", "unchanged"].includes(p.evaluation)) err("INVALID_ANALYSIS", "Escolha o resultado da compara\xE7\xE3o.");
      if (!/[0-9]/.test(clean(p.evidence, 240))) err("INVALID_ANALYSIS", "Digite um n\xFAmero do relat\xF3rio no campo da conclus\xE3o (ex.: 8,2 s).");
      a.evaluation = p.evaluation;
      a.evidence = clean(p.evidence, 240);
    }
    if (p.keep !== void 0) {
      a.keep = clean(p.keep, 240);
      a.next = clean(p.next, 240);
    }
    result = { analysis: a, missing: checklist(t) };
  } else if (action === "set-ready") {
    if (data.phase !== "TESTING") err("INVALID_ROOM_STATE", "Prontid\xE3o indispon\xEDvel nesta etapa.");
    const t = getTeam(data, user);
    if (p.ready) {
      const missing = checklist(t);
      if (missing.length) err("ANALYSIS_INCOMPLETE", "Ainda faltam: " + missing.join("; "), { missing });
    }
    t.ready = !!p.ready;
    event(data, "team.ready", { teamId: t.id, ready: t.ready });
    result = { ready: t.ready };
  } else if (action === "market-action") {
    requireTeacher(room, user);
    if (!["TEAM_BUILD", "TESTING"].includes(data.phase)) err("INVALID_ROOM_STATE", "Mercado fechado.");
    const expected = data.market === "M0" ? "M1" : data.market === "M1" ? "M2" : null;
    if (p.phase !== expected) err("INVALID_MARKET_PHASE", "Fase de mercado inv\xE1lida.");
    data.market = expected;
    event(data, "market.changed", { phase: expected });
    result = { market: expected };
  } else if (action === "room-transition") {
    requireTeacher(room, user);
    const next = { LOBBY: "TEAM_BUILD", TEAM_BUILD: "TESTING", TESTING: "LOCK_IN", QUALIFYING: "RESULTS", FINAL: "RESULTS", RESULTS: "CLOSED" };
    if (p.phase !== next[data.phase]) err("INVALID_ROOM_STATE", "Transi\xE7\xE3o de etapa inv\xE1lida.");
    if (p.phase === "LOCK_IN") {
      const teams = Object.values(data.teams).filter((t) => !t.removed);
      if (!teams.length || teams.some((t) => !t.ready || checklist(t).length)) err("TEAMS_NOT_READY", "Todas as escuderias precisam estar prontas e v\xE1lidas.");
    }
    if (p.phase === "LOCK_IN" && data.mode === "standard" && data.market === "M0") err("INVALID_MARKET_PHASE", "Anuncie o evento de mercado M1 antes de travar as equipes.");
    if (p.phase === "RESULTS" && data.phase === "QUALIFYING" && (data.raceCount || 2) !== 1) err("INVALID_ROOM_STATE", "Crie a grande final antes dos resultados.");
    if (p.phase === "RESULTS" && data.phase === "QUALIFYING" && !data.heats.some((h) => h.type === "qualifier" && h.status === "finished")) err("INVALID_ROOM_STATE", "Conclua uma bateria antes dos resultados.");
    if (p.phase === "RESULTS" && data.heats.some((h) => h.status === "created" || h.status === "countdown" || h.status === "running" || h.status === "qte_paused")) err("RACE_IN_PROGRESS", "Conclua as baterias antes de mostrar resultados.");
    if (p.phase === "RESULTS" && data.phase === "FINAL" && !data.heats.some((h) => h.type === "final" && h.status === "finished")) err("RACE_IN_PROGRESS", "Conclua a grande final antes de mostrar resultados.");
    data.phase = p.phase;
    event(data, "room.phase", { phase: p.phase });
    result = { phase: p.phase };
  } else if (action === "build-heats") {
    requireTeacher(room, user);
    const previousRound = Math.max(0, ...data.heats.filter((h) => h.type === "qualifier").map((h) => h.round || 1));
    const previous = data.heats.filter((h) => h.type === "qualifier" && (h.round || 1) === previousRound);
    const nextRound = previousRound + 1;
    if (!(data.phase === "LOCK_IN" && previousRound === 0 || data.phase === "QUALIFYING" && previousRound > 0 && previous.some((h) => h.status === "finished") && previous.every((h) => ["finished", "cancelled"].includes(h.status)) && nextRound <= (data.raceCount || 2) - 1)) err("INVALID_ROOM_STATE", "Conclua a rodada atual antes de criar a próxima.");
    const ids = Object.keys(data.teams).filter((id) => data.teams[id].ready && !data.teams[id].removed), size = data.carsPerHeat;
    if (!ids.length) err("TEAMS_NOT_READY", "Nenhuma equipe pronta.");
    let groups = [];
    if (Array.isArray(p.assignments)) {
      if (p.assignments.length < 1 || p.assignments.length > 5) err("INVALID_ASSIGNMENTS", "Use de uma a cinco baterias.");
      groups = p.assignments.map((g) => Array.isArray(g) ? g : []);
      const flattened = groups.flat();
      if (groups.some((g) => g.length < 1 || g.length > size) || flattened.length !== ids.length || new Set(flattened).size !== ids.length || flattened.some((x) => !ids.includes(x))) err("INVALID_ASSIGNMENTS", "Cada equipe pronta deve aparecer uma vez, respeitando o limite de carros.");
    } else for (let i = 0; i < ids.length; i += size) groups.push(ids.slice(i, i + size));
    const heats = groups.map((group, i) => ({ id: uid(), type: "qualifier", round: nextRound, laps: data.lapsPerRace || 3, number: i + 1, status: "created", participants: withRoster(data, group), startAt: null, pauseTotal: 0, pausedAt: null, checkpoint: 0, event: null, history: [], cooldowns: {}, duration: 0 }));
    data.heats.push(...heats);
    data.phase = "QUALIFYING";
    event(data, "heats.built", { round: nextRound, count: heats.length, manual: Array.isArray(p.assignments) });
    result = { heats };
  } else if (action === "race-speed") {
    requireTeacher(room, user);
    const speed = Number(p.speed);
    if (!RACE_SPEEDS.includes(speed)) err("INVALID_RACE_SPEED", "Escolha 1×, 2×, 4×, 6× ou 8×.");
    data.raceSpeed = speed;
    event(data, "race.speed_changed", { speed });
    result = { speed };
  } else if (action === "race-action") {
    requireTeacher(room, user);
    const h = data.heats.find((x) => x.id === p.heatId);
    if (!h) err("HEAT_NOT_FOUND", "Bateria inv\xE1lida.");
    if (p.command === "start") {
      if (h.status !== "created") err("INVALID_RACE_STATE", "Esta bateria j\xE1 foi iniciada.");
      if (data.heats.some((x) => x.id !== h.id && ["countdown", "running", "qte_paused", "admin_paused"].includes(x.status))) err("RACE_IN_PROGRESS", "Outra bateria est\xE1 em andamento.");
      for (const participant of h.participants) {
        const t = data.teams[participant.teamId];
        if (!completeCar(t)) err("TEAM_INCOMPLETE", `${t.name} precisa completar o carro antes da largada.`);
        participant.snapshot = snapshot(t);
        const need = supplyNeeds(t);
        if (!h.freeSupplies) {
          if (inventory(t, "fuel") < need.fuel || inventory(t, "tires") < need.tires) err("MISSING_SUPPLIES", `${t.name} precisa de mais suprimentos.`);
          consume(t, "fuel", need.fuel);
          consume(t, "tires", need.tires);
          if (t.repairAssigned) consume(t, "repair", 1);
        }
        const sim = simulate(t, data.circuitId, h.laps || 3, t.repairAssigned);
        participant.base = Math.round(sim.total * 1e3);
        participant.reliability = sim.attributes.R;
        participant.mixedScore = sim.scores.M;
        participant.sectorTimes = sim.sectors.map((s) => Math.round(s.seconds * 1e3));
        participant.consumed = !h.freeSupplies ? need : { fuel: 0, tires: 0, repair: 0 };
      }
      h.duration = Math.max(...h.participants.map((x) => x.base));
      h.clockDuration = h.duration;
      h.speed = data.raceSpeed || 4;
      scheduleIncidents(h);
      h.startAt = now() + 3e3;
      h.status = "countdown";
      h.history.push({ type: "start", at: (/* @__PURE__ */ new Date()).toISOString() });
      event(data, "heat.started", { heatId: h.id });
      result = { heatId: h.id, startAt: h.startAt };
    } else if (p.command === "pause") {
      if (!["running", "countdown", "qte_paused"].includes(h.status)) err("INVALID_RACE_STATE", "Corrida n\xE3o est\xE1 ativa.");
      h.previousStatus = h.status;
      h.status = "admin_paused";
      h.adminPausedAt = now();
      if (h.event?.status === "open") {
        h.pauseTotal += h.adminPausedAt - h.pausedAt;
        h.pausedAt = null;
        h.event.status = "cancelled";
        h.event = null;
      }
      result = { status: h.status };
    } else if (p.command === "resume") {
      if (h.status !== "admin_paused") err("INVALID_RACE_STATE", "Corrida n\xE3o est\xE1 pausada.");
      const dt = now() - h.adminPausedAt;
      if (h.previousStatus === "countdown") h.startAt += dt;
      else h.pauseTotal += dt;
      h.status = h.previousStatus === "countdown" ? "countdown" : "running";
      h.pausedAt = null;
      result = { status: h.status };
    } else if (p.command === "cancel") {
      if (h.status === "finished") err("INVALID_RACE_STATE", "Resultado oficial j\xE1 conclu\xEDdo.");
      const beforeStart = h.status === "created" || h.status === "countdown" && now() < h.startAt;
      if (beforeStart) {
        for (const part of h.participants) {
          if (part.consumed) {
            const t = data.teams[part.teamId];
            for (const kind of ["fuel", "tires", "repair"]) if (part.consumed[kind]) t.lots.push({ id: uid(), kind, quantity: part.consumed[kind], paid: 0, phase: "return" });
          }
        }
      }
      h.hadStarted = !beforeStart;
      h.status = "cancelled";
      event(data, "heat.cancelled", { heatId: h.id });
      result = { status: h.status };
    } else if (p.command === "repeat") {
      if (h.status !== "cancelled" || data.heats.some((x) => x.repeatOf === h.id)) err("INVALID_RACE_STATE", "Esta bateria n\xE3o pode ser repetida.");
      const repeatIds = h.participants.map((x) => x.teamId).filter((id) => data.teams[id] && !data.teams[id].removed);
      if (!repeatIds.length) err("TEAM_NOT_FOUND", "Nenhuma equipe permanece nesta bateria.");
      const repeated = { id: uid(), type: h.type, round: h.round || 1, laps: h.laps || 3, number: h.number, status: "created", participants: withRoster(data, repeatIds), startAt: null, pauseTotal: 0, pausedAt: null, checkpoint: 0, event: null, history: [], cooldowns: {}, duration: 0, repeatOf: h.id, freeSupplies: h.hadStarted };
      data.heats.push(repeated);
      event(data, "heat.repeated", { oldHeatId: h.id, newHeatId: repeated.id });
      result = { heat: repeated };
    } else err("INVALID_ACTION", "Comando de corrida inv\xE1lido.");
  } else if (action === "sync-race") {
    const h = data.heats.find((x) => x.id === p.heatId);
    if (!h) err("HEAT_NOT_FOUND", "Bateria inv\xE1lida.");
    finances = advanceRace(h, data);
    result = { heatId: h.id, status: h.status };
  } else if (action === "submit-qte") {
    const t = getTeam(data, user), h = data.heats.find((x) => x.event?.id === p.eventId), e = h?.event;
    if (!e || h.status !== "qte_paused" || e.status !== "open") err("QTE_NOT_OPEN", "Este duelo n\xE3o est\xE1 aberto.");
    if (![e.front, e.behind].includes(t.id)) err("QTE_NOT_ELIGIBLE", "Sua equipe n\xE3o participa deste duelo.");
    if (e.inputs[t.id]?.final) err("QTE_ALREADY_SUBMITTED", "Voc\xEA j\xE1 respondeu a este duelo.");
    const timestamp = now();
    let input = e.inputs[t.id] || { progress: 0 };
    if (timestamp < e.opensAt) {
      input = { valid: false, final: true, reason: "false_start", at: timestamp };
    } else if (timestamp > e.closesAt) {
      input = { valid: false, final: true, reason: "expired", at: timestamp };
    } else if (e.type === "reaction") {
      input = { valid: p.key === "SPACE", final: true, reason: p.key === "SPACE" ? null : "wrong_key", at: timestamp };
    } else if (e.type === "precision") {
      const fraction = (timestamp - e.opensAt) / e.precision.duration;
      const valid = fraction >= e.precision.zoneStart && fraction <= e.precision.zoneEnd;
      input = { valid, final: true, reason: valid ? null : "outside_zone", at: timestamp };
    } else {
      const expected = e.sequence[input.progress];
      if (p.key !== expected) input = { valid: false, final: true, reason: "wrong_key", at: timestamp };
      else {
        input.progress++;
        if (input.progress === e.sequence.length) input = { valid: true, final: true, at: timestamp };
      }
    }
    e.inputs[t.id] = input;
    if (e.inputs[e.front]?.final && e.inputs[e.behind]?.final) resolveQte(h);
    result = { accepted: true, input: { valid: input.valid, final: input.final, progress: input.progress, reason: input.reason } };
  } else if (action === "build-final") {
    requireTeacher(room, user);
    if (data.phase !== "QUALIFYING" || (data.raceCount || 2) < 2 || Math.max(...data.heats.filter((h2) => h2.type === "qualifier").map((h2) => h2.round || 1)) < (data.raceCount || 2) - 1 || data.heats.some((h2) => h2.type === "qualifier" && h2.status !== "finished" && h2.status !== "cancelled")) err("INVALID_ROOM_STATE", "Conclua todas as rodadas classificat\xF3rias primeiro.");
    const qualifiers = data.heats.filter((h2) => h2.type === "qualifier" && h2.status === "finished");
    const standings = new Map();
    for (const heat of qualifiers) for (const participant of heat.participants) {
      if (data.teams[participant.teamId]?.removed) continue;
      const entry = standings.get(participant.teamId) || { total: 0, count: 0 };
      entry.total += participant.dnf ? 1e6 : participant.final;
      entry.count++;
      standings.set(participant.teamId, entry);
    }
    const required = (data.raceCount || 2) - 1;
    const qualified = [...standings].sort((a, b) => a[1].total + (required - a[1].count) * 1e6 - b[1].total - (required - b[1].count) * 1e6).slice(0, Math.min(5, data.carsPerHeat || 5)).map(([teamId]) => teamId);
    if (!qualified.length) err("INVALID_ROOM_STATE", "Nenhuma bateria conclu\xEDda para montar a final.");
    const h = { id: uid(), type: "final", round: data.raceCount || 2, laps: data.lapsPerRace || 3, number: 1, status: "created", participants: withRoster(data, qualified), startAt: null, pauseTotal: 0, pausedAt: null, checkpoint: 0, event: null, history: [], cooldowns: {}, duration: 0 };
    data.heats.push(h);
    data.phase = "FINAL";
    event(data, "final.built", { teams: qualified });
    result = { heat: h };
  } else if (action === "award") {
    requireTeacher(room, user);
    if (!["FINAL", "RESULTS"].includes(data.phase)) err("INVALID_ROOM_STATE", "Premia\xE7\xF5es ainda indispon\xEDveis.");
    if (!["strategist", "analyst"].includes(p.kind) || !data.teams[p.teamId] || data.teams[p.teamId].removed) err("INVALID_AWARD", "Premia\xE7\xE3o inv\xE1lida.");
    data.awards[p.kind] = p.teamId;
    result = { awards: data.awards };
  } else if (action === "remove-team") {
    requireTeacher(room, user);
    if (!["LOBBY", "TEAM_BUILD", "TESTING"].includes(data.phase)) err("INVALID_ROOM_STATE", "A remo\xE7\xE3o deve ocorrer antes da trava.");
    const t = data.teams[p.teamId];
    if (!t || t.removed) err("TEAM_NOT_FOUND", "Equipe n\xE3o encontrada.");
    t.removed = true;
    t.ready = false;
    event(data, "team.removed", { teamId: t.id, name: t.name });
    result = { teamId: t.id, removed: true };
  } else if (action === "leave-room") {
    const t = getTeam(data, user);
    t.removed = true;
    t.left = true;
    t.ready = false;
    for (const h of data.heats) {
      const participant = h.participants.find((x) => x.teamId === t.id);
      if (!participant || ["finished", "cancelled"].includes(h.status)) continue;
      if (h.status === "created") {
        h.participants = h.participants.filter((x) => x.teamId !== t.id);
        if (!h.participants.length) h.status = "finished";
      } else {
        participant.dnf = true;
        participant.withdrawn = true;
        participant.dnfProgress = h.duration ? Math.min(1, Math.max(0, (now() - h.startAt - h.pauseTotal) * (h.speed || 1) / h.duration)) : 0;
        if (h.event?.status === "open" && [h.event.front, h.event.behind].includes(t.id)) h.event.inputs[t.id] = { valid: false, final: true, reason: "left", at: now() };
        if (h.status === "qte_paused" && h.event?.inputs[h.event.front]?.final && h.event?.inputs[h.event.behind]?.final) resolveQte(h);
      }
      h.history.push({ type: "team_left", teamId: t.id, at: new Date().toISOString() });
    }
    event(data, "team.left", { teamId: t.id, name: t.name });
    result = { teamId: t.id, left: true };
  } else if (action === "delete-room") {
    requireTeacher(room, user);
    if (data.deleted) err("ROOM_NOT_FOUND", "Sala não encontrada.");
    data.deleted = true;
    data.phase = "CLOSED";
    event(data, "room.deleted");
    result = { roomId: room.id, deleted: true };
  } else err("INVALID_ACTION", "A\xE7\xE3o n\xE3o reconhecida.");
  for (const key of ["kind", "itemId", "slot", "partId", "quantity", "marketPhase", "phase", "heatId", "command", "eventId", "teamId", "speed"]) if (p[key] !== void 0) audit[key] = p[key];
  if (action === "run-test") audit.testNumber = result.test?.number;
  if (action === "join-room") audit.teamId = result.teamId;
  return { data, result, audit, finances };
}
export {
  clean,
  code,
  err,
  hash,
  mutator,
  now,
  publicState,
  uid
};
