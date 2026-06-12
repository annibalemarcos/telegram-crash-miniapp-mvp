import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env.js';
import { sendJson, readJson, notFound } from './utils/http.js';
import { CrashGameEngine } from './game/engine.js';
import { BetService } from './game/betService.js';
import { WalletService } from './wallet/walletService.js';
import { PaymentRegistry } from './payments/paymentRegistry.js';
import { PlayerService } from './player/playerService.js';
import { AdminService } from './admin/adminService.js';
import { StaffService } from './admin/staffService.js';
import { TicketService } from './support/ticketService.js';
import { TelegramBot } from './bot/telegramBot.js';
import { validateTelegramInitData } from './utils/telegramAuth.js';

const publicDir = path.resolve(process.cwd(), 'public');
const engine = new CrashGameEngine({ houseEdge: env.houseEdge, tickMs: env.roundTickMs });
const bets = new BetService(engine);
const clients = new Set();

function requireAdmin(req, res, roles = ['owner', 'admin', 'support', 'auditor']) {
  const token = req.headers['x-admin-token'] || '';
  const staff = StaffService.verifyToken(token);
  if (!staff) {
    sendJson(res, 401, { ok: false, error: 'admin_unauthorized' });
    return false;
  }
  if (!roles.includes(staff.role)) {
    sendJson(res, 403, { ok: false, error: 'staff_forbidden' });
    return false;
  }
  req.staff = staff;
  return true;
}

engine.onUpdate(snap => {
  const payload = `data: ${JSON.stringify(snap)}\n\n`;
  for (const res of clients) res.write(payload);
});

function getUserId(req, body = {}) {
  const headerId = req.headers['x-demo-user-id'];
  const initData = req.headers['x-telegram-init-data'] || body.initData || '';
  const auth = validateTelegramInitData(initData);
  if (auth.ok && auth.user?.id) return String(auth.user.id);
  return String(body.userId || headerId || 'guest');
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Permite rotas bonitas como /admin e /admin/ sem cair em { ok:false, error:'not_found' }.
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const safePath = path.normalize(pathname).replace(/^([/\\])+/, '');
  let file = path.join(publicDir, safePath);

  if (!file.startsWith(publicDir) || !fs.existsSync(file)) return false;
  if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;

  const ext = path.extname(file).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);


  if (req.method === 'GET' && url.pathname === '/admin') {
    res.writeHead(302, { location: '/admin/' });
    return res.end();
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    try {
      const body = await readJson(req);
      const login = StaffService.login(body.username || body.password || 'admin', body.password ? body.password : '');
      return sendJson(res, 200, { ok: true, token: login.token, staff: login.staff, panel: '/admin/' });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin/login') {
    if (!requireAdmin(req, res)) return;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/summary') {
    const tickets = TicketService.listAdmin();
    const staff = StaffService.list();
    return sendJson(res, 200, { ok: true, ...AdminService.summary(engine), support: { tickets: tickets.length, openTickets: tickets.filter(t => t.status !== 'closed').length, staff: staff.length }, staffMe: req.staff });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/staff') {
    return sendJson(res, 200, { ok: true, staff: StaffService.list(), roles: StaffService.roles(), me: req.staff });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/staff/create') {
    try {
      const body = await readJson(req);
      const staff = StaffService.create(body, req.staff);
      AdminService.audit('staff_created', { by: req.staff?.username, staffId: staff.id, username: staff.username, role: staff.role });
      return sendJson(res, 200, { ok: true, staff });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/staff/update') {
    try {
      const body = await readJson(req);
      const staff = StaffService.update(body.id, body, req.staff);
      AdminService.audit('staff_updated', { by: req.staff?.username, staffId: staff.id, username: staff.username, role: staff.role, active: staff.active });
      return sendJson(res, 200, { ok: true, staff });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/staff/delete') {
    try {
      const body = await readJson(req);
      StaffService.remove(body.id, req.staff);
      AdminService.audit('staff_deleted', { by: req.staff?.username, staffId: body.id });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/tickets') {
    return sendJson(res, 200, { ok: true, tickets: TicketService.listAdmin({ status: url.searchParams.get('status') || '', q: url.searchParams.get('q') || '' }), categories: TicketService.categories(), statuses: TicketService.statuses(), priorities: TicketService.priorities() });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ticket/reply') {
    try {
      const body = await readJson(req);
      const ticket = TicketService.replyStaff(body.ticketId, body.message, req.staff, body.internal);
      AdminService.audit('ticket_replied', { by: req.staff?.username, ticketId: body.ticketId, internal: Boolean(body.internal) });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ticket/status') {
    try {
      const body = await readJson(req);
      const ticket = TicketService.setStatus(body.ticketId, body.status, req.staff);
      AdminService.audit('ticket_status_changed', { by: req.staff?.username, ticketId: body.ticketId, status: body.status });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ticket/assign') {
    try {
      const body = await readJson(req);
      const ticket = TicketService.assign(body.ticketId, body.staffId, req.staff);
      AdminService.audit('ticket_assigned', { by: req.staff?.username, ticketId: body.ticketId, staffId: body.staffId });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ticket/priority') {
    try {
      const body = await readJson(req);
      const ticket = TicketService.setPriority(body.ticketId, body.priority, req.staff);
      AdminService.audit('ticket_priority_changed', { by: req.staff?.username, ticketId: body.ticketId, priority: body.priority });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }


  if (req.method === 'POST' && url.pathname === '/api/admin/config') {
    try {
      const body = await readJson(req);
      const config = AdminService.updateConfig(body, engine);
      return sendJson(res, 200, { ok: true, config, token: config.adminPassword, message: config.passwordChanged ? 'Configurações salvas. Senha admin alterada; token atualizado.' : 'Configurações salvas.' });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/players') {
    return sendJson(res, 200, { ok: true, players: AdminService.listPlayers() });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/wallets') {
    return sendJson(res, 200, { ok: true, wallets: AdminService.listWallets() });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/bets') {
    return sendJson(res, 200, { ok: true, bets: AdminService.listBets(Number(url.searchParams.get('limit') || 250)) });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/rounds') {
    return sendJson(res, 200, { ok: true, rounds: AdminService.listRounds(engine) });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
    return sendJson(res, 200, { ok: true, events: AdminService.listAudit() });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/player/block') {
    try {
      const body = await readJson(req);
      return sendJson(res, 200, { ok: true, player: AdminService.setPlayerBlocked(body.userId, true, body.reason || '') });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/player/unblock') {
    try {
      const body = await readJson(req);
      return sendJson(res, 200, { ok: true, player: AdminService.setPlayerBlocked(body.userId, false, '') });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/wallet/adjust') {
    try {
      const body = await readJson(req);
      return sendJson(res, 200, { ok: true, wallet: AdminService.creditWallet(body.userId, body.amount, body.reason || 'admin_adjust') });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/round/force-crash') {
    try {
      AdminService.audit('round_force_crash', { roundId: engine.roundId });
      return sendJson(res, 200, { ok: true, game: engine.forceCrash() });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/round/start-now') {
    try {
      AdminService.audit('round_start_now', { roundId: engine.roundId });
      return sendJson(res, 200, { ok: true, game: engine.skipWaiting() });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/settings/house-edge') {
    try {
      const body = await readJson(req);
      const config = AdminService.updateConfig({ houseEdge: body.houseEdge }, engine);
      return sendJson(res, 200, { ok: true, game: engine.snapshot(), config });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, app: env.appName, mode: 'demo', telegramBot: Boolean(env.botToken), time: new Date().toISOString() });
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    return sendJson(res, 200, { ok: true, appName: env.appName, minBet: env.minBet, maxBet: env.maxBet, startingBalance: env.startingBalance, payments: PaymentRegistry.listProviders(), cryptoCoins: PlayerService.cryptoCoins(), pixTypes: PlayerService.pixTypes(), realMoneyEnabled: false });
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const userId = url.searchParams.get('userId') || req.headers['x-demo-user-id'] || 'guest';
    return sendJson(res, 200, { ok: true, game: engine.snapshot(), wallet: WalletService.get(userId), player: PlayerService.get(userId), bet: bets.getMyBet(userId), bets: bets.getMyBets(userId), latestResult: bets.getLatestResult(userId) });
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive'
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(engine.snapshot())}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }


  if (req.method === 'GET' && url.pathname === '/api/me') {
    const userId = url.searchParams.get('userId') || req.headers['x-demo-user-id'] || 'guest';
    return sendJson(res, 200, { ok: true, player: PlayerService.get(userId), wallet: WalletService.get(userId) });
  }

  if (req.method === 'POST' && url.pathname === '/api/player/mode') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      return sendJson(res, 200, { ok: true, player: PlayerService.setMode(userId, body.mode || 'guest') });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/player/account') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      return sendJson(res, 200, { ok: true, player: PlayerService.createAccount(userId, body) });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/player/payout') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      return sendJson(res, 200, { ok: true, player: PlayerService.savePayout(userId, body) });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/support/tickets') {
    const userId = url.searchParams.get('userId') || req.headers['x-demo-user-id'] || 'guest';
    return sendJson(res, 200, { ok: true, tickets: TicketService.listForUser(userId), categories: TicketService.categories() });
  }

  if (req.method === 'POST' && url.pathname === '/api/support/ticket') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      const ticket = TicketService.create(userId, body, PlayerService.get(userId));
      AdminService.audit('ticket_created', { userId, ticketId: ticket.id, number: ticket.number, category: ticket.category });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/support/ticket/reply') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      const ticket = TicketService.replyUser(userId, body.ticketId, body.message, PlayerService.get(userId));
      AdminService.audit('ticket_user_replied', { userId, ticketId: body.ticketId });
      return sendJson(res, 200, { ok: true, ticket });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/wallet/reset') {
    const body = await readJson(req);
    const userId = getUserId(req, body);
    return sendJson(res, 200, { ok: true, wallet: WalletService.reset(userId) });
  }

  if (req.method === 'POST' && url.pathname === '/api/bet') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      PlayerService.requirePayout(userId);
      const bet = bets.placeBet(userId, body.amount, body.autoCashoutAt, body.slot || 1);
      return sendJson(res, 200, { ok: true, bet, wallet: WalletService.get(userId) });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/cashout') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      const bet = bets.cashOut(userId, body.slot || 1);
      return sendJson(res, 200, { ok: true, bet, wallet: WalletService.get(userId) });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/deposit/fake') {
    try {
      const body = await readJson(req);
      const userId = getUserId(req, body);
      PlayerService.requirePayout(userId);
      const player = PlayerService.get(userId);
      const deposit = await PaymentRegistry.createDeposit(body.provider || 'fake_pix', { ...body, userId, payout: player.payout });
      // MVP: confirma automaticamente para facilitar teste local.
      const wallet = WalletService.credit(userId, Number(body.amount || 0), 'fake_deposit');
      return sendJson(res, 200, { ok: true, deposit: { ...deposit, status: 'confirmed_fake', payoutTarget: player.payout?.label || 'não configurado' }, wallet, player });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if (serveStatic(req, res)) return;
  notFound(res);
}

const server = http.createServer((req, res) => router(req, res).catch(err => {
  console.error(err);
  sendJson(res, 500, { ok: false, error: 'internal_error' });
}));

server.listen(env.port, env.host, () => {
  console.log(`\n${env.appName}`);
  console.log(`WebApp: http://localhost:${env.port}`);
  console.log(`Modo: créditos fake / sem dinheiro real`);
  console.log(`Telegram WEBAPP_URL configurado: ${env.webappUrl}\n`);
});

new TelegramBot().start();
