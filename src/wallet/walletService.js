import { JsonStore } from '../storage/jsonStore.js';
import { env } from '../config/env.js';

const store = new JsonStore('data/wallets.json', { users: {} });

export class WalletService {
  static normalizeUserId(userId) {
    return String(userId || 'guest');
  }

  static get(userId) {
    const id = this.normalizeUserId(userId);
    const data = store.read();
    if (!data.users[id]) {
      data.users[id] = {
        userId: id,
        balance: env.startingBalance,
        totalBets: 0,
        totalWins: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.write(data);
    }
    return data.users[id];
  }

  static credit(userId, amount, reason = 'credit') {
    const id = this.normalizeUserId(userId);
    return store.update(data => {
      if (!data.users[id]) data.users[id] = this.get(id);
      data.users[id].balance = Number((data.users[id].balance + amount).toFixed(2));
      data.users[id].updatedAt = new Date().toISOString();
      data.users[id].lastReason = reason;
      return data;
    }).users[id];
  }

  static debit(userId, amount, reason = 'debit') {
    const wallet = this.get(userId);
    if (wallet.balance < amount) throw new Error('Saldo fake insuficiente.');
    const id = this.normalizeUserId(userId);
    return store.update(data => {
      data.users[id].balance = Number((data.users[id].balance - amount).toFixed(2));
      data.users[id].totalBets += amount;
      data.users[id].updatedAt = new Date().toISOString();
      data.users[id].lastReason = reason;
      return data;
    }).users[id];
  }

  static markWin(userId, amount) {
    const id = this.normalizeUserId(userId);
    return store.update(data => {
      if (!data.users[id]) data.users[id] = this.get(id);
      data.users[id].balance = Number((data.users[id].balance + amount).toFixed(2));
      data.users[id].totalWins = Number((data.users[id].totalWins + amount).toFixed(2));
      data.users[id].updatedAt = new Date().toISOString();
      data.users[id].lastReason = 'win';
      return data;
    }).users[id];
  }

  static reset(userId) {
    const id = this.normalizeUserId(userId);
    return store.update(data => {
      data.users[id] = {
        userId: id,
        balance: env.startingBalance,
        totalBets: 0,
        totalWins: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return data;
    }).users[id];
  }
}
