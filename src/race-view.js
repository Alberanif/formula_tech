import { CIRCUITS } from '../shared/game.js';

export function raceElapsed(heat, serverOffset = 0) {
  if (!heat?.startAt) return 0;
  const time = Date.now() + serverOffset;
  return Math.max(0, time - heat.startAt - (heat.pauseTotal || 0) - (heat.pausedAt ? time - heat.pausedAt : 0));
}

export function carProgress(participant, elapsed) {
  const sectors = participant.sectorTimes || [];
  if (!sectors.length) return 0;
  let remaining = elapsed;
  for (let i = 0; i < sectors.length; i++) {
    const duration = Math.max(1, sectors[i]);
    if (remaining < duration) return Math.min(participant.dnfProgress ?? 1, (i + remaining / duration) / sectors.length);
    remaining -= duration;
  }
  return Math.min(participant.dnfProgress ?? 1, 1);
}

const incidentLabels = { spin: 'Rodada na pista', breakdown: 'Falha mecânica', crash: 'Batida — abandono' };

export function raceView({ state, heat, serverOffset, esc, sec, button, canUpgrade }) {
  if (!heat) return '<section class="content narrow"><div class="eyebrow">Corrida</div><h1>Os carros ainda estão na garagem.</h1><p>O professor iniciará as baterias após todas as equipes ficarem prontas.</p></section>';
  const elapsed = raceElapsed(heat, serverOffset);
  const progress = heat.duration ? Math.min(1, elapsed / heat.duration) : 0;
  const participants = [...heat.participants].sort((a, b) => Number(a.dnf) - Number(b.dnf) || (a.final ?? a.base + a.adjust) - (b.final ?? b.base + b.adjust));
  const event = heat.event?.status === 'open' ? heat.event : null;
  const mine = state.own?.id;
  const eligible = event && [event.front, event.behind].includes(mine);
  const first = heat.participants.find(p => p.teamId === event?.front);
  const second = heat.participants.find(p => p.teamId === event?.behind);
  const open = event && Date.now() + serverOffset >= event.opensAt;
  const totalDuels = Math.max(4, heat.laps * 3 + 1);
  const status = heat.status === 'finished' ? 'BANDEIRADA' : heat.status === 'countdown' ? 'LARGADA EM BREVE' : heat.status === 'admin_paused' ? 'CORRIDA PAUSADA' : heat.status === 'qte_paused' ? 'DUELO AO VIVO' : 'CORRIDA AO VIVO';
  const latest = heat.history.slice(-7).reverse();
  const feed = latest.map(item => {
    const name = heat.participants.find(p => p.teamId === item.teamId)?.name || 'Escuderia';
    const winner = heat.participants.find(p => p.teamId === item.result?.winner)?.name;
    const reaction = item.result?.winner ? item.result.winner === item.result.front ? item.result.frontMs : item.result.behindMs : null;
    const label = item.type === 'incident' ? `${name}: ${incidentLabels[item.incidentType] || 'Incidente'}` : item.type === 'qte' ? winner ? `${winner} venceu o duelo de reação${reaction != null ? ` em ${reaction} ms` : ''}` : 'Duelo sem vencedor' : item.type === 'qte_open' ? `Duelo de reação ${item.checkpoint}/${totalDuels}` : 'Largada autorizada';
    return `<li class="${item.type === 'incident' ? 'race-alert' : ''}"><span>${esc(label)}</span><time>${new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>`;
  }).join('');
  return `<section class="content race-content">
    <div class="race-broadcast"><span class="live-light"></span><strong>${status}</strong><span>RODADA ${heat.round} / ${state.room.raceCount}</span><span>${heat.laps} ${heat.laps === 1 ? 'VOLTA' : 'VOLTAS'}</span></div>
    <div class="page-head race-heading"><div><div class="eyebrow">${heat.type === 'final' ? 'Grande final' : `Rodada ${heat.round} · Bateria ${heat.number}`}</div><h1>${esc(CIRCUITS[state.room.circuitId].name)}</h1><p>${heat.status === 'countdown' ? 'Prepare-se para a largada.' : heat.status === 'finished' ? 'Resultado oficial publicado. Créditos creditados às equipes.' : heat.status === 'admin_paused' ? 'O professor pausou a corrida.' : 'Acompanhe os setores, os incidentes e os duelos de reação.'}</p></div><strong class="race-lap" id="race-lap">${Math.min(heat.laps, Math.floor(progress * heat.laps) + 1)} / ${heat.laps} VOLTAS</strong></div>
    <div class="race-meter"><div id="race-meter-fill" style="width:${Math.round(progress * 100)}%"></div></div>
    <div class="race-layout"><div class="track-panel"><div class="track-grid"></div><svg id="race-svg" viewBox="0 0 760 460" role="img" aria-label="Pista com carros em movimento"><path id="track-path" d="M160 130 C85 130 45 190 70 290 C90 380 250 404 370 373 C465 350 585 410 680 330 C745 272 720 160 635 117 C535 67 450 92 370 130 C290 165 250 125 160 130Z" fill="none" stroke="#263947" stroke-width="69" stroke-linecap="round"/><path d="M160 130 C85 130 45 190 70 290 C90 380 250 404 370 373 C465 350 585 410 680 330 C745 272 720 160 635 117 C535 67 450 92 370 130 C290 165 250 125 160 130Z" fill="none" stroke="#638196" stroke-width="57" stroke-linecap="round"/><path d="M160 130 C85 130 45 190 70 290 C90 380 250 404 370 373 C465 350 585 410 680 330 C745 272 720 160 635 117 C535 67 450 92 370 130 C290 165 250 125 160 130Z" fill="none" stroke="#c0d8df" stroke-width="2" stroke-dasharray="14 16"/><path d="M145 99 L145 162" stroke="white" stroke-width="7" stroke-dasharray="8 7"/>${heat.participants.map(p => `<g class="race-car ${p.dnf ? 'out' : ''}" data-car="${p.teamId}" transform="translate(150 130)"><rect x="-18" y="-12" width="36" height="8" rx="2" fill="#e8f2f7"/><rect x="-15" y="9" width="30" height="7" rx="2" fill="#e8f2f7"/><rect x="-15" y="-9" width="6" height="10" rx="2" fill="#111a20"/><rect x="9" y="-9" width="6" height="10" rx="2" fill="#111a20"/><rect x="-15" y="7" width="6" height="10" rx="2" fill="#111a20"/><rect x="9" y="7" width="6" height="10" rx="2" fill="#111a20"/><rect x="-9" y="-16" width="18" height="34" rx="7" fill="${p.color}" stroke="#fff" stroke-width="2"/><rect x="-5" y="-3" width="10" height="12" rx="4" fill="#182637"/><text y="-5" text-anchor="middle" fill="#fff" font-size="9" font-weight="900">${p.number}</text></g>`).join('')}</svg><div class="track-overlay"><span>${status}</span><strong id="race-progress">${Math.round(progress * 100)}%</strong></div><div class="track-sector" id="race-sector">SETOR 01 / 06</div></div>
    <aside class="leaderboard"><div class="leader-head"><h2>Classificação</h2><small>AO VIVO</small></div><div class="leader-list">${participants.map((p, i) => `<div class="leader-row ${p.teamId === mine ? 'mine' : ''} ${p.dnf ? 'out' : ''}" data-entry="${p.teamId}" style="order:${i}"><span class="place">${i + 1}</span><span class="team-dot" style="background:${p.color}"></span><strong>${esc(p.name)}</strong><span class="leader-time">${p.dnf ? 'FORA' : p.final != null ? sec(p.final / 1000) : `${Math.round(carProgress(p, elapsed) * 100)}%`}</span></div>`).join('')}</div><p class="leader-note">A pista mostra o andamento. O servidor confirma tempos, duelos e incidentes.</p></aside></div>
    ${event && !eligible ? `<div class="race-duel-banner"><span>⚡ DUELO ${event.checkpoint}/${totalDuels}</span><strong>${esc(first?.name)} × ${esc(second?.name)}</strong><small>Os pilotos estão reagindo agora</small></div>` : ''}
    ${eligible ? `<div class="qte-overlay" data-event-id="${event.id}"><div class="qte-card"><small>DUELO DE REAÇÃO · ${event.checkpoint}/${totalDuels}</small><h2>${esc(first?.name)} × ${esc(second?.name)}</h2><p>Prepare-se. Quando aparecer <b>AGORA</b>, pressione ESPAÇO ou toque no botão. A reação válida mais rápida vence; até 50 ms de diferença é empate.</p><div class="qte-signal ${open ? 'now' : ''}" id="qte-signal">${open ? 'AGORA!' : 'AGUARDE'}</div><div class="qte-countdown"><div id="qte-countdown-fill"></div></div><p class="qte-hint" id="qte-hint">${open ? 'Reaja agora!' : 'Espere o sinal verde'}</p><button type="button" class="primary qte-button" data-action="qte-touch" ${open ? '' : 'disabled'}>REAGIR</button><small>Barra de espaço ou botão</small></div></div>` : ''}
    <div class="race-lower"><article class="race-feed"><h2>Rádio da corrida</h2><ol>${feed || '<li>Aguardando a largada.</li>'}</ol></article><article class="race-telemetry"><h2>Telemetria</h2><div><span>Volta</span><strong id="telemetry-lap">${Math.min(heat.laps, Math.floor(progress * heat.laps) + 1)} / ${heat.laps}</strong></div><div><span>Setor</span><strong id="telemetry-sector">01 / 06</strong></div><div><span>Duelos realizados</span><strong>${heat.history.filter(x => x.type === 'qte').length} / ${totalDuels}</strong></div><div><span>Incidentes</span><strong>${heat.history.filter(x => x.type === 'incident').length}</strong></div></article></div>
    ${heat.status === 'finished' && mine && heat.prizes[mine] != null ? `<div class="race-reward"><strong>+ ${heat.prizes[mine]} Cr</strong><span>Prêmio da sua colocação creditado no saldo.</span>${canUpgrade() ? `${button('Melhorar meu carro', 'nav', 'data-screen="garage" class="primary"')}${button('Comprar suprimentos', 'nav', 'data-screen="market"')}` : ''}</div>` : ''}
  </section>`;
}
