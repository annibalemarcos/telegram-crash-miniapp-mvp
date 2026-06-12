const $ = sel => document.querySelector(sel);
let token = localStorage.getItem('sky_admin_token') || '';
let cache = { players: [], bets: [], tickets: [], staff: [], me: null };

function money(v){ return Number(v || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function x(v){ return v ? `${Number(v).toFixed(2)}x` : '-'; }
function date(v){ return v ? new Date(v).toLocaleString('pt-BR') : '-'; }
function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', 'x-admin-token': token, ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function showApp(show) {
  $('#loginPanel').classList.toggle('hidden', show);
  $('#appPanel').classList.toggle('hidden', !show);
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const username = $('#adminUsername')?.value || 'admin';
    const password = $('#adminPassword').value || 'admin123';
    const data = await fetch('/api/admin/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ username, password }) }).then(r => r.json());
    if (!data.ok) throw new Error(data.error || 'Falha no login');
    token = data.token;
    localStorage.setItem('sky_admin_token', token);
    showApp(true);
    await refreshAll();
  } catch (err) { $('#loginError').textContent = err.message; }
});

$('#logoutBtn').addEventListener('click', () => { localStorage.removeItem('sky_admin_token'); token=''; showApp(false); });
$('#refreshBtn').addEventListener('click', refreshAll);
$('#playerSearch').addEventListener('input', renderPlayers);
$('#betSearch').addEventListener('input', renderBets);
$('#ticketSearch')?.addEventListener('input', renderTickets);
$('#ticketStatusFilter')?.addEventListener('change', refreshTickets);
$('#staffForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  $('#staffMsg').textContent = '';
  try {
    await adminAction('/api/admin/staff/create', {
      username: $('#staffUsername').value,
      displayName: $('#staffDisplayName').value,
      role: $('#staffRole').value,
      password: $('#staffPassword').value
    });
    $('#staffMsg').textContent = 'Staff criado.';
    $('#staffUsername').value = ''; $('#staffDisplayName').value = ''; $('#staffPassword').value = '';
  } catch (err) { $('#staffMsg').textContent = err.message; }
});

$('#startNowBtn').addEventListener('click', () => adminAction('/api/admin/round/start-now'));
$('#forceCrashBtn').addEventListener('click', () => adminAction('/api/admin/round/force-crash'));
$('#saveHouseEdgeBtn').addEventListener('click', async () => {
  await adminAction('/api/admin/settings/house-edge', { houseEdge: Number($('#houseEdgeInput').value) });
});

$('#configForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#configMsg').textContent = '';
  try {
    const body = readConfigForm();
    const data = await api('/api/admin/config', { method:'POST', body: JSON.stringify(body) });
    if (data.token) {
      token = data.token;
      localStorage.setItem('sky_admin_token', token);
    }
    $('#configMsg').textContent = data.message || 'Configurações salvas.';
    await refreshAll();
  } catch (err) {
    $('#configMsg').textContent = err.message;
  }
});

$('#reloadConfigBtn').addEventListener('click', refreshAll);

$('#walletForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#walletMsg').textContent = '';
  try {
    const body = { userId: $('#walletUserId').value, amount: Number($('#walletAmount').value), reason: $('#walletReason').value };
    await adminAction('/api/admin/wallet/adjust', body);
    $('#walletMsg').textContent = 'Carteira fake ajustada.';
    $('#walletAmount').value = '';
  } catch (err) { $('#walletMsg').textContent = err.message; }
});

async function adminAction(path, body = {}) {
  const opts = { method:'POST', body: JSON.stringify(body) };
  await api(path, opts);
  await refreshAll();
}

async function refreshAll() {
  const [summary, players, bets, rounds, audit, tickets, staff] = await Promise.all([
    api('/api/admin/summary'), api('/api/admin/players'), api('/api/admin/bets'), api('/api/admin/rounds'), api('/api/admin/audit'), api('/api/admin/tickets'), api('/api/admin/staff')
  ]);
  cache.players = players.players || [];
  cache.bets = bets.bets || [];
  cache.tickets = tickets.tickets || [];
  cache.staff = staff.staff || [];
  cache.me = staff.me || summary.staffMe || null;
  renderSummary(summary);
  renderPlayers();
  renderBets();
  renderRounds(rounds.rounds || []);
  renderAudit(audit.events || []);
  renderTickets();
  renderStaff();
}

function readConfigForm() {
  return {
    adminPassword: $('#cfgAdminPassword').value,
    appName: $('#cfgAppName').value,
    webappUrl: $('#cfgWebappUrl').value,
    houseEdge: Number($('#cfgHouseEdge').value),
    startingBalance: Number($('#cfgStartingBalance').value),
    minBet: Number($('#cfgMinBet').value),
    maxBet: Number($('#cfgMaxBet').value),
    roundTickMs: Number($('#cfgRoundTickMs').value)
  };
}

function fillConfigForm(c = {}) {
  $('#cfgAdminPassword').value = c.adminPassword ?? '';
  $('#cfgAppName').value = c.appName ?? '';
  $('#cfgWebappUrl').value = c.webappUrl ?? '';
  $('#cfgHouseEdge').value = c.houseEdge ?? 0;
  $('#cfgStartingBalance').value = c.startingBalance ?? 0;
  $('#cfgMinBet').value = c.minBet ?? 0;
  $('#cfgMaxBet').value = c.maxBet ?? 0;
  $('#cfgRoundTickMs').value = c.roundTickMs ?? 90;
}

function renderSummary(data) {
  const t = data.totals || {};
  $('#mPlayers').textContent = t.players ?? '-';
  $('#mGuests').textContent = t.guests ?? '-';
  $('#mPayoutReady').textContent = t.payoutReady ?? '-';
  $('#mBalance').textContent = money(t.totalBalance);
  $('#mStaked').textContent = money(t.totalStaked);
  $('#mPaid').textContent = money(t.totalPaidOut);
  $('#mHouse').textContent = money(t.houseDemoNet);
  $('#mOpenBets').textContent = t.openBets ?? '-';
  $('#mOpenTickets').textContent = data.support?.openTickets ?? '-';
  $('#mStaffCount').textContent = data.support?.staff ?? '-';
  const g = data.game || {};
  $('#gameMult').textContent = x(g.multiplier || 1);
  $('#gamePhase').textContent = g.phase || '-';
  $('#roundId').textContent = g.roundId || '-';
  $('#crashAt').textContent = g.crashAt ? x(g.crashAt) : 'oculto';
  $('#nextRound').textContent = `${Math.ceil((g.nextRoundInMs || 0) / 1000)}s`;
  const c = data.config || {};
  $('#houseEdgeInput').value = c.houseEdge ?? 0;
  fillConfigForm(c);
}

function renderPlayers() {
  const q = ($('#playerSearch').value || '').toLowerCase();
  const rows = cache.players.filter(p => JSON.stringify(p).toLowerCase().includes(q));
  $('#playersTable').innerHTML = `
    <thead><tr><th>User</th><th>Tipo</th><th>Payout</th><th>Carteira fake</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${rows.map(p => {
      const payout = p.payout ? `${esc(p.payout.label)}<br><span class="tiny">${esc(p.payout.pixKeyMasked || p.payout.walletMasked || '')}</span>` : '<span class="tag warn">sem payout</span>';
      return `<tr>
        <td><b>${esc(p.displayName || 'Visitante')}</b><br><span class="tiny">${esc(p.userId)}</span></td>
        <td>${p.accountCreated ? '<span class="tag ok">conta demo</span>' : '<span class="tag">guest</span>'}</td>
        <td>${payout}</td>
        <td>Saldo: <b>${money(p.wallet?.balance)}</b><br><span class="tiny">Apostou ${money(p.wallet?.totalBets)} · ganhou ${money(p.wallet?.totalWins)}</span></td>
        <td>${p.blocked ? `<span class="tag bad">bloqueado</span><br><span class="tiny">${esc(p.blockReason)}</span>` : '<span class="tag ok">ativo</span>'}</td>
        <td><div class="row-actions">
          <button onclick="fillWallet('${esc(p.userId)}')">saldo</button>
          ${p.blocked ? `<button onclick="unblockPlayer('${esc(p.userId)}')">desbloquear</button>` : `<button class="danger" onclick="blockPlayer('${esc(p.userId)}')">bloquear</button>`}
        </div></td>
      </tr>`;
    }).join('')}</tbody>`;
}

function renderBets() {
  const q = ($('#betSearch').value || '').toLowerCase();
  const rows = cache.bets.filter(b => JSON.stringify(b).toLowerCase().includes(q));
  $('#betsTable').innerHTML = `
    <thead><tr><th>Quando</th><th>User</th><th>Round</th><th>Slot</th><th>Valor</th><th>Auto</th><th>Status</th><th>Payout</th></tr></thead>
    <tbody>${rows.map(b => `<tr>
      <td>${date(b.createdAt)}</td><td>${esc(b.userId)}</td><td>#${esc(b.roundId)}</td><td>${esc(b.slot)}</td>
      <td>${money(b.amount)}</td><td>${b.autoCashoutAt ? x(b.autoCashoutAt) : 'manual'}</td>
      <td><span class="tag ${b.status === 'cashed_out' ? 'ok' : b.status === 'lost' ? 'bad' : 'warn'}">${esc(b.status)}</span>${b.multiplier ? `<br><span class="tiny">em ${x(b.multiplier)}</span>` : ''}</td>
      <td>${money(b.payout)}</td>
    </tr>`).join('')}</tbody>`;
}

function renderRounds(rounds) {
  $('#roundHistory').innerHTML = rounds.slice(0, 30).map(r => {
    const cls = r.crashAt < 1.5 ? 'crash-low' : r.crashAt < 3 ? 'crash-mid' : 'crash-high';
    return `<div class="hist-item"><div><b>#${esc(r.roundId)}</b><br><span class="tiny">${date(r.endedAt)}</span></div><strong class="${cls}">${x(r.crashAt)}</strong></div>`;
  }).join('') || '<p class="muted">Sem rodadas encerradas ainda.</p>';
}

function renderAudit(events) {
  $('#auditList').innerHTML = events.slice(0, 60).map(e => `<div class="audit-item"><div><b>${esc(e.action)}</b><br><span class="tiny">${date(e.at)}</span></div><span class="tiny">${esc(JSON.stringify(e.details || {}))}</span></div>`).join('') || '<p class="muted">Sem eventos admin.</p>';
}


async function refreshTickets() {
  const status = $('#ticketStatusFilter')?.value || '';
  const data = await api(`/api/admin/tickets?status=${encodeURIComponent(status)}`);
  cache.tickets = data.tickets || [];
  renderTickets();
}

function statusLabel(status) {
  return ({ open:'aberto', waiting_staff:'aguardando staff', waiting_user:'aguardando usuário', closed:'fechado' })[status] || status;
}
function priorityLabel(priority) {
  return ({ low:'baixa', normal:'normal', high:'alta', urgent:'urgente' })[priority] || priority;
}

function renderTickets() {
  const q = ($('#ticketSearch')?.value || '').toLowerCase();
  const rows = cache.tickets.filter(t => JSON.stringify(t).toLowerCase().includes(q));
  $('#ticketsList').innerHTML = rows.map(t => {
    const messages = (t.messages || []).slice(-4).map(m => `<div class="ticket-message ${esc(m.authorType)}"><b>${esc(m.authorName || m.authorType)}</b><span>${date(m.createdAt)}</span><p>${esc(m.body)}</p></div>`).join('');
    const staffOptions = ['<option value="">Sem responsável</option>'].concat(cache.staff.map(s => `<option value="${esc(s.id)}" ${t.assignedTo === s.id ? 'selected' : ''}>${esc(s.displayName || s.username)} · ${esc(s.role)}</option>`)).join('');
    return `<article class="ticket-card ${esc(t.status)}">
      <div class="ticket-head">
        <div><b>${esc(t.number)} · ${esc(t.subject)}</b><br><span class="tiny">${esc(t.playerName)} · ${esc(t.userId)} · ${date(t.updatedAt)}</span></div>
        <div class="ticket-tags"><span class="tag ${t.status === 'closed' ? '' : 'warn'}">${statusLabel(t.status)}</span><span class="tag">${esc(t.category)}</span><span class="tag ${t.priority === 'urgent' ? 'bad' : t.priority === 'high' ? 'warn' : ''}">${priorityLabel(t.priority)}</span></div>
      </div>
      <div class="ticket-messages">${messages}</div>
      <div class="ticket-actions">
        <select onchange="setTicketStatus('${esc(t.id)}', this.value)">
          ${['open','waiting_staff','waiting_user','closed'].map(st => `<option value="${st}" ${t.status === st ? 'selected' : ''}>${statusLabel(st)}</option>`).join('')}
        </select>
        <select onchange="setTicketPriority('${esc(t.id)}', this.value)">
          ${['low','normal','high','urgent'].map(pr => `<option value="${pr}" ${t.priority === pr ? 'selected' : ''}>${priorityLabel(pr)}</option>`).join('')}
        </select>
        <select onchange="assignTicket('${esc(t.id)}', this.value)">${staffOptions}</select>
      </div>
      <div class="reply-box">
        <textarea id="reply_${esc(t.id)}" placeholder="Responder ao usuário..."></textarea>
        <div class="button-row"><button onclick="replyTicket('${esc(t.id)}', false)">Responder</button><button class="ghost" onclick="replyTicket('${esc(t.id)}', true)">Nota interna</button></div>
      </div>
    </article>`;
  }).join('') || '<p class="muted">Nenhum ticket encontrado.</p>';
}

function renderStaff() {
  $('#staffMe').textContent = cache.me ? `${cache.me.displayName || cache.me.username} · ${cache.me.role}` : '-';
  $('#staffTable').innerHTML = `<thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Criado</th><th>Ações</th></tr></thead><tbody>${cache.staff.map(s => `<tr>
    <td><b>${esc(s.displayName || s.username)}</b><br><span class="tiny">${esc(s.username)}</span></td>
    <td><span class="tag">${esc(s.role)}</span></td>
    <td>${s.active ? '<span class="tag ok">ativo</span>' : '<span class="tag bad">inativo</span>'}</td>
    <td>${date(s.createdAt)}</td>
    <td><div class="row-actions"><button onclick="toggleStaff('${esc(s.id)}', ${!s.active})">${s.active ? 'desativar' : 'ativar'}</button><button class="ghost" onclick="changeStaffPassword('${esc(s.id)}')">senha</button>${s.role !== 'owner' ? `<button class="danger" onclick="deleteStaff('${esc(s.id)}')">remover</button>` : ''}</div></td>
  </tr>`).join('')}</tbody>`;
}

window.replyTicket = async (ticketId, internal) => {
  const el = document.getElementById(`reply_${ticketId}`);
  await adminAction('/api/admin/ticket/reply', { ticketId, message: el.value, internal });
  el.value = '';
};
window.setTicketStatus = async (ticketId, status) => { await adminAction('/api/admin/ticket/status', { ticketId, status }); };
window.setTicketPriority = async (ticketId, priority) => { await adminAction('/api/admin/ticket/priority', { ticketId, priority }); };
window.assignTicket = async (ticketId, staffId) => { await adminAction('/api/admin/ticket/assign', { ticketId, staffId }); };
window.toggleStaff = async (id, active) => { await adminAction('/api/admin/staff/update', { id, active }); };
window.changeStaffPassword = async id => { const password = prompt('Nova senha para este staff:'); if (password) await adminAction('/api/admin/staff/update', { id, password }); };
window.deleteStaff = async id => { if (confirm('Remover staff?')) await adminAction('/api/admin/staff/delete', { id }); };

window.fillWallet = userId => { $('#walletUserId').value = userId; $('#walletAmount').focus(); };
window.blockPlayer = async userId => { const reason = prompt('Motivo do bloqueio?', 'Bloqueado pelo admin') || 'Bloqueado pelo admin'; await adminAction('/api/admin/player/block', { userId, reason }); };
window.unblockPlayer = async userId => { await adminAction('/api/admin/player/unblock', { userId }); };

if (token) { showApp(true); refreshAll().catch(() => { localStorage.removeItem('sky_admin_token'); token=''; showApp(false); }); }
