import crypto from 'node:crypto';
import { JsonStore } from '../storage/jsonStore.js';
import { env, editableConfig, updateEditableConfig, saveEditableConfigToEnvFile } from '../config/env.js';

const walletsStore = new JsonStore('data/wallets.json', { users: {} });
const betsStore = new JsonStore('data/bets.json', { bets: {} });
const playersStore = new JsonStore('data/players.json', { players: {} });
const auditStore = new JsonStore('data/admin_audit.json', { events: [] });

function now() {
  return new Date().toISOString();
}

function mask(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function safePlayer(player) {
  const p = { ...player };
  if (p.payout?.pixKey) p.payout = { ...p.payout, pixKey: undefined, pixKeyMasked: mask(p.payout.pixKey) };
  if (p.payout?.walletAddress) p.payout = { ...p.payout, walletAddress: undefined, walletMasked: mask(p.payout.walletAddress) };
  return p;
}

function sortByDateDesc(items, field = 'createdAt') {
  return items.sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));
}

export class AdminService {
  static audit(action, details = {}) {
    auditStore.update(data => {
      data.events.unshift({ id: crypto.randomUUID(), action, details, at: now() });
      data.events = data.events.slice(0, 300);
      return data;
    });
  }

  static summary(engine) {
    const wallets = Object.values(walletsStore.read().users || {});
    const bets = Object.values(betsStore.read().bets || {});
    const players = Object.values(playersStore.read().players || {});
    const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
    const totalBets = bets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalPayout = bets.reduce((sum, b) => sum + Number(b.payout || 0), 0);
    const openBets = bets.filter(b => b.status === 'open').length;
    const guests = players.filter(p => p.mode !== 'account').length;
    const accounts = players.filter(p => p.accountCreated).length;
    const payoutReady = players.filter(p => p.payout?.method).length;
    return {
      appName: env.appName,
      mode: 'demo_fake_money',
      realMoneyEnabled: false,
      game: engine.snapshot(),
      totals: {
        players: players.length,
        guests,
        accounts,
        payoutReady,
        wallets: wallets.length,
        totalBalance: Number(totalBalance.toFixed(2)),
        totalStaked: Number(totalBets.toFixed(2)),
        totalPaidOut: Number(totalPayout.toFixed(2)),
        houseDemoNet: Number((totalBets - totalPayout).toFixed(2)),
        openBets
      },
      config: {
        ...editableConfig(),
        houseEdge: engine.houseEdge,
        dirtyRestartRecommended: false
      }
    };
  }

  static updateConfig(input = {}, engine = null) {
    const beforePassword = env.adminPassword;
    const updated = updateEditableConfig(input);
    if (engine) {
      if ('houseEdge' in input) engine.updateHouseEdge(updated.houseEdge);
      if ('roundTickMs' in input) engine.updateTickMs(updated.roundTickMs);
    }
    saveEditableConfigToEnvFile();
    this.audit('config_updated', {
      keys: Object.keys(input),
      passwordChanged: beforePassword !== updated.adminPassword,
      appName: updated.appName,
      webappUrl: updated.webappUrl,
      houseEdge: updated.houseEdge,
      startingBalance: updated.startingBalance,
      minBet: updated.minBet,
      maxBet: updated.maxBet,
      roundTickMs: updated.roundTickMs
    });
    return { ...updated, passwordChanged: beforePassword !== updated.adminPassword };
  }

  static listPlayers() {
    const players = Object.values(playersStore.read().players || {}).map(safePlayer);
    const wallets = walletsStore.read().users || {};
    return sortByDateDesc(players.map(p => ({
      ...p,
      wallet: wallets[p.userId] || null,
      blocked: Boolean(p.blocked)
    })), 'updatedAt');
  }

  static listWallets() {
    return sortByDateDesc(Object.values(walletsStore.read().users || {}), 'updatedAt');
  }

  static listBets(limit = 250) {
    return sortByDateDesc(Object.values(betsStore.read().bets || {}), 'createdAt').slice(0, limit);
  }

  static listRounds(engine) {
    return engine.previous || [];
  }

  static listAudit() {
    return auditStore.read().events || [];
  }

  static setPlayerBlocked(userId, blocked, reason = '') {
    const id = String(userId || '').trim();
    if (!id) throw new Error('Informe o userId.');
    const data = playersStore.update(current => {
      if (!current.players[id]) {
        current.players[id] = {
          userId: id,
          mode: 'guest',
          accountCreated: false,
          displayName: 'Visitante',
          payout: null,
          createdAt: now()
        };
      }
      current.players[id].blocked = Boolean(blocked);
      current.players[id].blockReason = blocked ? String(reason || 'Bloqueado pelo admin').slice(0, 160) : null;
      current.players[id].updatedAt = now();
      return current;
    });
    this.audit(blocked ? 'player_blocked' : 'player_unblocked', { userId: id, reason });
    return safePlayer(data.players[id]);
  }

  static creditWallet(userId, amount, reason = 'admin_credit') {
    const id = String(userId || '').trim();
    const value = Number(amount);
    if (!id) throw new Error('Informe o userId.');
    if (!Number.isFinite(value) || value === 0) throw new Error('Valor inválido.');
    const data = walletsStore.update(current => {
      if (!current.users[id]) {
        current.users[id] = {
          userId: id,
          balance: env.startingBalance,
          totalBets: 0,
          totalWins: 0,
          createdAt: now(),
          updatedAt: now()
        };
      }
      current.users[id].balance = Number((Number(current.users[id].balance || 0) + value).toFixed(2));
      current.users[id].updatedAt = now();
      current.users[id].lastReason = reason;
      return current;
    });
    this.audit('wallet_adjusted', { userId: id, amount: value, reason });
    return data.users[id];
  }
}
