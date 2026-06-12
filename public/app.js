const tg = window.Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const appName = $('#appName');
const balance = $('#balance');
const multiplier = $('#multiplier');
const phase = $('#phase');
const countdown = $('#countdown');
const sky = $('#sky');
const history = $('#history');
const seedHash = $('#seedHash');
const statusEl = $('#status');
const depositAmount = $('#depositAmount');
const provider = $('#provider');
const depositBtn = $('#depositBtn');
const depositBox = $('#depositBox');
const resetBtn = $('#resetBtn');
const roundId = $('#roundId');
const onlinePlayers = $('#onlinePlayers');
const roomBets = $('#roomBets');
const roomCashed = $('#roomCashed');
const liveFeed = $('#liveFeed');
const onboarding = $('#onboarding');
const appShell = $('#appShell');
const stepChoice = $('#stepChoice');
const stepAccount = $('#stepAccount');
const stepPayout = $('#stepPayout');
const onboardingStatus = $('#onboardingStatus');
const playerChip = $('#playerChip');
const payoutSummary = $('#payoutSummary');
const pixFields = $('#pixFields');
const cryptoFields = $('#cryptoFields');
const cryptoCoin = $('#cryptoCoin');
const resultCard = $('#resultCard');
const resultTitle = $('#resultTitle');
const resultSubtitle = $('#resultSubtitle');
const resultDetails = $('#resultDetails');
const pixKeyType = $('#pixKeyType');
const pixKey = $('#pixKey');
const pixKeyConfirm = $('#pixKeyConfirm');
const pixHelp = $('#pixHelp');

const user = tg?.initDataUnsafe?.user;
const demoUserId = user?.id ? String(user.id) : localStorage.getItem('demoUserId') || crypto.randomUUID();
localStorage.setItem('demoUserId', demoUserId);

let cfg = {};
let lastGame = null;
let currentPlayer = null;
let selectedPayoutMethod = 'pix';
const slots = {
  1: { autoCashoutAt: null, bet: null },
  2: { autoCashoutAt: null, bet: null }
};

function headers() {
  return {
    'content-type': 'application/json',
    'x-demo-user-id': demoUserId,
    'x-telegram-init-data': tg?.initData || ''
  };
}

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erro inesperado.');
  return json;
}

function money(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function payoutText(player = currentPlayer) {
  const payout = player?.payout;
  if (!payout?.method) return 'Recebimento não configurado.';
  if (payout.method === 'pix') return `Pix · ${payout.pixKeyMasked || mask(payout.pixKey)}`;
  return `${payout.coin || 'Cripto'} · ${payout.walletMasked || mask(payout.walletAddress)}`;
}


function renderLatestResult(result) {
  if (!result) {
    resultCard.hidden = true;
    return;
  }
  resultCard.hidden = false;
  const won = result.net > 0;
  resultCard.classList.toggle('win', won);
  resultCard.classList.toggle('lose', !won);
  resultTitle.textContent = won ? `Você saiu positivo: +${money(result.net)} créditos` : `Você perdeu ${money(Math.abs(result.net))} créditos`;
  resultSubtitle.textContent = `Rodada #${result.roundId} · apostado ${money(result.totalStake)} · recebido ${money(result.totalPayout)}.`;
  resultDetails.innerHTML = (result.bets || []).map(bet => {
    const label = bet.status === 'cashed_out'
      ? `Slot ${bet.slot}: sacou em ${Number(bet.multiplier || 0).toFixed(2)}x e recebeu ${money(bet.payout)}`
      : `Slot ${bet.slot}: caiu antes do saque e perdeu ${money(bet.amount)}`;
    return `<div class="result-line ${bet.status}">${label}</div>`;
  }).join('');
}

function renderPlayer(player) {
  currentPlayer = player;
  const mode = player?.accountCreated ? `Conta demo · ${player.displayName || 'Jogador'}` : 'Visitante';
  const payout = payoutText(player);
  if (playerChip) playerChip.textContent = `${mode} · ${payout}`;
  if (payoutSummary) payoutSummary.textContent = payout;

  const ready = Boolean(player?.payout?.method);
  onboarding.hidden = ready;
  appShell.hidden = !ready;
  if (ready) document.body.classList.add('ready');
}

function showOnboardingStep(step) {
  stepChoice.hidden = step !== 'choice';
  stepAccount.hidden = step !== 'account';
  stepPayout.hidden = step !== 'payout';
}

function setPayoutMethod(method) {
  selectedPayoutMethod = method;
  document.querySelectorAll('.method-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.method === method));
  pixFields.hidden = method !== 'pix';
  cryptoFields.hidden = method !== 'crypto';
  if (method === 'pix') {
    cryptoFields.querySelectorAll('input').forEach(input => input.value = '');
  } else {
    pixFields.querySelectorAll('input').forEach(input => input.value = '');
  }
  updatePixTypeUi();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 13);
  if (d.startsWith('55')) {
    const rest = d.slice(2);
    if (rest.length <= 2) return `+55 ${rest}`.trim();
    if (rest.length <= 7) return `+55 (${rest.slice(0,2)}) ${rest.slice(2)}`;
    return `+55 (${rest.slice(0,2)}) ${rest.slice(2,7)}-${rest.slice(7,11)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  d1 = d1 >= 10 ? 0 : d1;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  d2 = d2 >= 10 ? 0 : d2;
  return d2 === Number(cpf[10]);
}

function validatePixOnClient() {
  const type = pixKeyType?.value || 'cpf';
  const value = pixKey?.value?.trim() || '';
  const confirm = pixKeyConfirm?.value?.trim() || '';
  if (!value || !confirm) return 'Preencha e confirme a chave Pix.';
  if (value !== confirm) return 'As duas chaves Pix não conferem.';
  if (type === 'cpf' && !isValidCpf(value)) return 'CPF inválido. Use um CPF real com 11 dígitos.';
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'E-mail inválido.';
  if (type === 'phone') {
    const digits = onlyDigits(value);
    if (![10, 11, 12, 13].includes(digits.length)) return 'Telefone inválido. Use DDD + número. Ex: (11) 99999-9999.';
  }
  if (type === 'random' && !/^[a-zA-Z0-9_.@-]{20,120}$/.test(value)) return 'Chave aleatória inválida. Ela costuma ser uma sequência longa de letras, números e símbolos simples.';
  return '';
}

function updatePixTypeUi() {
  if (!pixKeyType || !pixKey || !pixHelp) return;
  const type = pixKeyType.value;
  const help = {
    cpf: 'CPF: use 11 números. Ex: 123.456.789-09',
    email: 'E-mail: precisa ter @ e domínio. Ex: nome@email.com',
    phone: 'Telefone: use DDD + número. Ex: (11) 99999-9999',
    random: 'Chave aleatória: cole a chave completa gerada pelo banco.'
  };
  const placeholders = {
    cpf: '123.456.789-09',
    email: 'voce@email.com',
    phone: '(11) 99999-9999',
    random: 'Cole a chave aleatória'
  };
  const modes = { cpf: 'numeric', email: 'email', phone: 'tel', random: 'text' };
  pixHelp.textContent = help[type] || help.cpf;
  pixKey.placeholder = placeholders[type] || placeholders.cpf;
  pixKeyConfirm.placeholder = placeholders[type] || placeholders.cpf;
  pixKey.inputMode = modes[type] || 'text';
  pixKeyConfirm.inputMode = modes[type] || 'text';
  pixKey.value = '';
  pixKeyConfirm.value = '';
}

function phaseLabel(game) {
  if (game.phase === 'waiting') return `Próxima rodada em ${(game.nextRoundInMs / 1000).toFixed(1)}s`;
  if (game.phase === 'running') return 'Voando... cash out antes do tombo';
  if (game.phase === 'crashed') return `Caiu em ${Number(game.crashAt || 0).toFixed(2)}x`;
  return game.phase;
}

function renderCountdown(game) {
  if (game.phase === 'waiting') {
    const seconds = Math.ceil(game.nextRoundInMs / 1000);
    countdown.hidden = false;
    countdown.textContent = seconds > 0 ? seconds : 'GO';
    return;
  }
  countdown.hidden = true;
}

function renderHistory(game) {
  history.innerHTML = (game.previous || []).map(item => {
    const crash = Number(item.crashAt || 0);
    const cls = crash >= 5 ? 'hot' : crash < 1.5 ? 'dead' : '';
    return `<span class="badge ${cls}">${crash.toFixed(2)}x</span>`;
  }).join('') || '<span class="muted small">Histórico aparece após a primeira queda.</span>';
}

function renderRoom(game) {
  const room = game.room || {};
  roundId.textContent = `#${game.roundId}`;
  onlinePlayers.textContent = room.onlinePlayers ?? '--';
  roomBets.textContent = room.fakeBetsTotal ?? '--';
  roomCashed.textContent = room.fakeCashedOut ?? '--';

  liveFeed.innerHTML = (room.feed || []).map(item => {
    const cls = item.type || 'bet';
    const detail = item.multiplier ? ` · ${Number(item.multiplier).toFixed(2)}x` : '';
    return `<div class="feed-item ${cls}"><span>${item.message || 'Evento da sala'}</span><strong>${detail}</strong></div>`;
  }).join('') || '<div class="feed-item"><span>Aguardando movimento da sala...</span></div>';
}

function renderGame(game) {
  lastGame = game;
  multiplier.textContent = `${Number(game.multiplier || 1).toFixed(2)}x`;
  phase.textContent = phaseLabel(game);
  seedHash.textContent = game.serverSeedHash;
  sky.classList.toggle('waiting', game.phase === 'waiting');
  sky.classList.toggle('running', game.phase === 'running');
  sky.classList.toggle('crashed', game.phase === 'crashed');
  renderCountdown(game);
  renderHistory(game);
  renderRoom(game);
  updateButtons();
}

function renderWallet(wallet) {
  balance.textContent = money(wallet.balance);
}

function betLabel(bet) {
  if (!bet) return 'Livre para próxima rodada.';
  const auto = bet.autoCashoutAt ? ` · auto ${Number(bet.autoCashoutAt).toFixed(2)}x` : ' · manual';
  const labels = {
    open: `Aberta: ${money(bet.amount)} créditos${auto}`,
    cashed_out: `Sacou em ${Number(bet.multiplier).toFixed(2)}x · recebeu ${money(bet.payout)}`,
    lost: `Perdeu ${money(bet.amount)} créditos${auto}`
  };
  return labels[bet.status] || bet.status;
}

function renderBets(bets = []) {
  if (cfg.cryptoCoins?.length) {
    cryptoCoin.innerHTML = cfg.cryptoCoins.map(coin => `<option value="${coin}">${coin.replace('_', ' ')}</option>`).join('');
  }
  [1, 2].forEach(slot => {
    const bet = bets[slot - 1] || null;
    slots[slot].bet = bet;
    $(`#myBet${slot}`).textContent = betLabel(bet);
    const status = $(`#slotStatus${slot}`);
    status.textContent = bet ? ({ open: 'Aberta', cashed_out: 'Sacou', lost: 'Perdeu' }[bet.status] || bet.status) : 'Livre';
    status.className = `slot-status ${bet?.status || ''}`;
  });
  updateButtons();
}

function setAutoCashout(slot, value) {
  const state = slots[slot];
  state.autoCashoutAt = value === null ? null : Number(value);
  $(`#selectedAutoCashout${slot}`).textContent = state.autoCashoutAt ? `${state.autoCashoutAt.toFixed(2)}x` : 'Manual';
  document.querySelectorAll(`.x-grid[data-slot="${slot}"] .x-btn`).forEach(btn => {
    const x = btn.dataset.x;
    btn.classList.toggle('active', (state.autoCashoutAt === null && x === 'manual') || Number(x) === state.autoCashoutAt);
  });
}

function updateButtons() {
  if (cfg.cryptoCoins?.length) {
    cryptoCoin.innerHTML = cfg.cryptoCoins.map(coin => `<option value="${coin}">${coin.replace('_', ' ')}</option>`).join('');
  }
  [1, 2].forEach(slot => {
    const bet = slots[slot].bet;
    const game = lastGame;
    const hasOpen = bet?.status === 'open';
    $(`#betBtn${slot}`).disabled = game?.phase !== 'waiting' || hasOpen;
    $(`#cashoutBtn${slot}`).disabled = !(game?.phase === 'running' && hasOpen);
  });
}

async function refresh() {
  const state = await api(`/api/state?userId=${encodeURIComponent(demoUserId)}`);
  renderGame(state.game);
  renderWallet(state.wallet);
  renderPlayer(state.player);
  renderBets(state.bets || [state.bet, null]);
  renderLatestResult(state.latestResult);
}

async function init() {
  cfg = await api('/api/config');
  appName.textContent = cfg.appName;
  if (cfg.cryptoCoins?.length) {
    cryptoCoin.innerHTML = cfg.cryptoCoins.map(coin => `<option value="${coin}">${coin.replace('_', ' ')}</option>`).join('');
  }
  [1, 2].forEach(slot => {
    $(`#betAmount${slot}`).min = cfg.minBet;
    $(`#betAmount${slot}`).max = cfg.maxBet;
  });
  await refresh();

  const events = new EventSource('/api/events');
  events.onmessage = (ev) => {
    const incoming = JSON.parse(ev.data);
    const previousRoundId = lastGame?.roundId;
    const previousPhase = lastGame?.phase;
    renderGame(incoming);
    if (!previousRoundId || incoming.roundId !== previousRoundId || incoming.phase === 'crashed' || previousPhase !== incoming.phase) {
      refresh().catch(() => {});
    }
  };
  events.onerror = () => { statusEl.textContent = 'Conexão em tempo real oscilou. Recarregue se travar.'; };
}

$$('.x-grid').forEach(grid => {
  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.x-btn');
    if (!btn) return;
    const slot = Number(grid.dataset.slot);
    if (btn.dataset.x === 'manual') {
      $(`#customAutoCashout${slot}`).value = '';
      setAutoCashout(slot, null);
    } else {
      $(`#customAutoCashout${slot}`).value = '';
      setAutoCashout(slot, Number(btn.dataset.x));
    }
    tg?.HapticFeedback?.selectionChanged?.();
  });
});

[1, 2].forEach(slot => {
  $(`#customAutoCashout${slot}`).addEventListener('input', () => {
    const val = Number(String($(`#customAutoCashout${slot}`).value).replace(',', '.'));
    if (Number.isFinite(val) && val >= 1.01) setAutoCashout(slot, val);
    else setAutoCashout(slot, null);
  });

  $(`#betBtn${slot}`).addEventListener('click', async () => {
    try {
      if (!currentPlayer?.payout?.method) {
        showOnboardingStep('payout');
        onboarding.hidden = false;
        appShell.hidden = true;
        throw new Error('Configure Pix ou cripto antes de apostar.');
      }
      const json = await api('/api/bet', {
        method: 'POST',
        body: JSON.stringify({ amount: Number($(`#betAmount${slot}`).value), autoCashoutAt: slots[slot].autoCashoutAt, slot, userId: demoUserId, initData: tg?.initData || '' })
      });
      slots[slot].bet = json.bet;
      renderBets([slots[1].bet, slots[2].bet]);
      renderWallet(json.wallet);
      statusEl.textContent = `Slot ${slot}: aposta fake confirmada para a rodada global.`;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });

  $(`#cashoutBtn${slot}`).addEventListener('click', async () => {
    try {
      const json = await api('/api/cashout', { method: 'POST', body: JSON.stringify({ slot, userId: demoUserId, initData: tg?.initData || '' }) });
      slots[slot].bet = json.bet;
      renderBets([slots[1].bet, slots[2].bet]);
      renderWallet(json.wallet);
      statusEl.textContent = `Slot ${slot}: cash out feito. Lucro fake, paz real.`;
      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (err) {
      statusEl.textContent = err.message;
      tg?.HapticFeedback?.notificationOccurred?.('error');
    }
  });
});

depositBtn.addEventListener('click', async () => {
  try {
    if (!currentPlayer?.payout?.method) {
      showOnboardingStep('payout');
      onboarding.hidden = false;
      appShell.hidden = true;
      throw new Error('Configure Pix ou cripto antes do depósito fake.');
    }
    const json = await api('/api/deposit/fake', {
      method: 'POST',
      body: JSON.stringify({ provider: provider.value, amount: Number(depositAmount.value), userId: demoUserId, initData: tg?.initData || '' })
    });
    renderWallet(json.wallet);
    depositBox.textContent = JSON.stringify(json.deposit, null, 2);
    statusEl.textContent = 'Depósito fake creditado automaticamente.';
  } catch (err) {
    depositBox.textContent = err.message;
  }
});

resetBtn.addEventListener('click', async () => {
  const json = await api('/api/wallet/reset', { method: 'POST', body: JSON.stringify({ userId: demoUserId, initData: tg?.initData || '' }) });
  renderWallet(json.wallet);
  statusEl.textContent = 'Saldo fake resetado.';
});


$('#guestBtn')?.addEventListener('click', async () => {
  try {
    const json = await api('/api/player/mode', { method: 'POST', body: JSON.stringify({ mode: 'guest', userId: demoUserId, initData: tg?.initData || '' }) });
    renderPlayer(json.player);
    showOnboardingStep('payout');
    onboardingStatus.textContent = 'Visitante criado. Agora escolha Pix ou cripto.';
  } catch (err) {
    onboardingStatus.textContent = err.message;
  }
});

$('#accountBtn')?.addEventListener('click', () => {
  showOnboardingStep('account');
});

$('#skipAccountBtn')?.addEventListener('click', async () => {
  try {
    const json = await api('/api/player/mode', { method: 'POST', body: JSON.stringify({ mode: 'guest', userId: demoUserId, initData: tg?.initData || '' }) });
    renderPlayer(json.player);
    showOnboardingStep('payout');
  } catch (err) {
    onboardingStatus.textContent = err.message;
  }
});

$('#saveAccountBtn')?.addEventListener('click', async () => {
  try {
    const json = await api('/api/player/account', {
      method: 'POST',
      body: JSON.stringify({ displayName: $('#accountName').value, email: $('#accountEmail').value, userId: demoUserId, initData: tg?.initData || '' })
    });
    renderPlayer(json.player);
    showOnboardingStep('payout');
    onboardingStatus.textContent = 'Conta demo criada. Falta só o método de pagamento/recebimento.';
  } catch (err) {
    onboardingStatus.textContent = err.message;
  }
});

$$('.method-btn').forEach(btn => {
  btn.addEventListener('click', () => setPayoutMethod(btn.dataset.method));
});

pixKeyType?.addEventListener('change', updatePixTypeUi);
[pixKey, pixKeyConfirm].forEach(input => input?.addEventListener('input', () => {
  const type = pixKeyType?.value || 'cpf';
  if (type === 'cpf') input.value = formatCpf(input.value);
  if (type === 'phone') input.value = formatPhone(input.value);
}));


$('#savePayoutBtn')?.addEventListener('click', async () => {
  try {
    if (selectedPayoutMethod === 'pix') {
      const pixError = validatePixOnClient();
      if (pixError) throw new Error(pixError);
    }
    const payload = selectedPayoutMethod === 'pix'
      ? { method: 'pix', pixKeyType: $('#pixKeyType').value, pixKey: $('#pixKey').value, pixKeyConfirm: $('#pixKeyConfirm').value }
      : { method: 'crypto', coin: $('#cryptoCoin').value, walletAddress: $('#walletAddress').value, walletAddressConfirm: $('#walletAddressConfirm').value };
    const json = await api('/api/player/payout', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userId: demoUserId, initData: tg?.initData || '' })
    });
    renderPlayer(json.player);
    onboardingStatus.textContent = 'Método salvo. Jogo liberado.';
    await refresh();
  } catch (err) {
    onboardingStatus.textContent = err.message;
    tg?.HapticFeedback?.notificationOccurred?.('error');
  }
});

setPayoutMethod('pix');

init().catch(err => {
  statusEl.textContent = err.message;
});

// ---- Suporte / Tickets ----
const supportCategory = document.querySelector('#supportCategory');
const supportSubject = document.querySelector('#supportSubject');
const supportMessage = document.querySelector('#supportMessage');
const supportStatus = document.querySelector('#supportStatus');
const supportTickets = document.querySelector('#supportTickets');
const openTicketBtn = document.querySelector('#openTicketBtn');
const refreshTicketsBtn = document.querySelector('#refreshTicketsBtn');

function ticketStatusLabel(status) {
  return ({ open: 'aberto', waiting_staff: 'aguardando suporte', waiting_user: 'aguardando você', closed: 'fechado' })[status] || status;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function localDate(v) { return v ? new Date(v).toLocaleString('pt-BR') : '-'; }

async function loadSupportTickets() {
  if (!supportTickets) return;
  try {
    const data = await api(`/api/support/tickets?userId=${encodeURIComponent(demoUserId)}`);
    renderSupportTickets(data.tickets || []);
    supportStatus.textContent = data.tickets?.length ? 'Tickets carregados.' : 'Você ainda não abriu tickets.';
  } catch (err) {
    supportStatus.textContent = err.message;
  }
}

function renderSupportTickets(tickets) {
  supportTickets.innerHTML = tickets.map(t => {
    const msgs = (t.messages || []).map(m => `<div class="support-msg ${escapeHtml(m.authorType)}"><b>${escapeHtml(m.authorName || m.authorType)}</b><span>${localDate(m.createdAt)}</span><p>${escapeHtml(m.body)}</p></div>`).join('');
    const reply = t.status !== 'closed' ? `<div class="support-reply"><textarea id="userReply_${escapeHtml(t.id)}" placeholder="Responder neste ticket..."></textarea><button type="button" onclick="replySupportTicket('${escapeHtml(t.id)}')">Enviar resposta</button></div>` : '<p class="muted small">Ticket fechado.</p>';
    return `<article class="support-ticket ${escapeHtml(t.status)}"><div class="ticket-title"><b>${escapeHtml(t.number)} · ${escapeHtml(t.subject)}</b><span>${ticketStatusLabel(t.status)}</span></div><p class="muted small">Categoria: ${escapeHtml(t.category)} · Atualizado: ${localDate(t.updatedAt)}</p>${msgs}${reply}</article>`;
  }).join('') || '<p class="muted">Nenhum ticket por enquanto.</p>';
}

window.replySupportTicket = async (ticketId) => {
  const el = document.getElementById(`userReply_${ticketId}`);
  try {
    await api('/api/support/ticket/reply', { method:'POST', body: JSON.stringify({ ticketId, message: el.value, userId: demoUserId, initData: tg?.initData || '' }) });
    el.value = '';
    await loadSupportTickets();
    supportStatus.textContent = 'Resposta enviada.';
  } catch (err) {
    supportStatus.textContent = err.message;
  }
};

openTicketBtn?.addEventListener('click', async () => {
  try {
    const data = await api('/api/support/ticket', { method:'POST', body: JSON.stringify({ category: supportCategory.value, subject: supportSubject.value, message: supportMessage.value, userId: demoUserId, initData: tg?.initData || '' }) });
    supportSubject.value = '';
    supportMessage.value = '';
    supportStatus.textContent = `Ticket ${data.ticket.number} aberto.`;
    await loadSupportTickets();
  } catch (err) {
    supportStatus.textContent = err.message;
  }
});
refreshTicketsBtn?.addEventListener('click', loadSupportTickets);
setTimeout(() => loadSupportTickets().catch(() => {}), 800);
