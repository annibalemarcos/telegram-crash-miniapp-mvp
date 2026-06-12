import { JsonStore } from '../storage/jsonStore.js';
import { WalletService } from '../wallet/walletService.js';
import { env } from '../config/env.js';

const store = new JsonStore('data/bets.json', { bets: {} });
const VALID_SLOTS = [1, 2];

function normalizeSlot(slot = 1) {
  const normalized = Number(slot || 1);
  if (!VALID_SLOTS.includes(normalized)) throw new Error('Slot inválido. Use 1 ou 2.');
  return normalized;
}

function key(userId, roundId, slot = 1) {
  return `${userId}:${roundId}:slot:${normalizeSlot(slot)}`;
}

function normalizeAmount(amount) {
  const betAmount = Number(amount);
  if (!Number.isFinite(betAmount)) throw new Error('Valor inválido.');
  if (betAmount < env.minBet) throw new Error(`Aposta mínima fake: ${env.minBet}.`);
  if (betAmount > env.maxBet) throw new Error(`Aposta máxima fake: ${env.maxBet}.`);
  return betAmount;
}

function normalizeAutoCashout(autoCashoutAt) {
  const auto = autoCashoutAt === null || autoCashoutAt === undefined || autoCashoutAt === '' ? null : Number(autoCashoutAt);
  if (auto !== null && (!Number.isFinite(auto) || auto < 1.01 || auto > 100)) throw new Error('Auto cash out deve ficar entre 1.01x e 100x.');
  return auto;
}

export class BetService {
  constructor(engine) {
    this.engine = engine;
    this.engine.onUpdate(snap => {
      if (snap.phase === 'running') this.processAutoCashouts(snap);
      if (snap.phase === 'crashed') this.settleCrashedRound(snap.roundId);
    });
  }

  listOpenForRound(roundId) {
    const data = store.read();
    return Object.values(data.bets).filter(b => b.roundId === roundId && b.status === 'open');
  }

  placeBet(userId, amount, autoCashoutAt = null, slot = 1) {
    const snap = this.engine.snapshot();
    const normalizedUserId = WalletService.normalizeUserId(userId);
    const normalizedSlot = normalizeSlot(slot);
    const betAmount = normalizeAmount(amount);
    const auto = normalizeAutoCashout(autoCashoutAt);
    if (snap.phase !== 'waiting') throw new Error('A rodada já começou. Aposte na próxima.');

    const betKey = key(normalizedUserId, snap.roundId, normalizedSlot);
    const data = store.read();
    if (data.bets[betKey]?.status === 'open') throw new Error(`Você já tem aposta aberta no Slot ${normalizedSlot} nesta rodada.`);

    WalletService.debit(normalizedUserId, betAmount, 'bet');
    const bet = {
      id: betKey,
      userId: normalizedUserId,
      roundId: snap.roundId,
      slot: normalizedSlot,
      amount: betAmount,
      status: 'open',
      autoCashoutAt: auto,
      multiplier: null,
      payout: 0,
      createdAt: new Date().toISOString()
    };
    data.bets[betKey] = bet;
    store.write(data);
    return bet;
  }

  cashOut(userId, slot = 1, forcedMultiplier = null) {
    const snap = this.engine.snapshot();
    const normalizedUserId = WalletService.normalizeUserId(userId);
    const normalizedSlot = normalizeSlot(slot);
    if (snap.phase !== 'running') throw new Error('Cash out só durante a rodada.');

    const betKey = key(normalizedUserId, snap.roundId, normalizedSlot);
    const data = store.read();
    const bet = data.bets[betKey];
    if (!bet || bet.status !== 'open') throw new Error(`Nenhuma aposta aberta no Slot ${normalizedSlot} nesta rodada.`);

    const exitMultiplier = forcedMultiplier ?? snap.multiplier;
    bet.status = 'cashed_out';
    bet.multiplier = Number(exitMultiplier.toFixed ? exitMultiplier.toFixed(2) : Number(exitMultiplier).toFixed(2));
    bet.payout = Number((bet.amount * bet.multiplier).toFixed(2));
    bet.closedAt = new Date().toISOString();
    data.bets[betKey] = bet;
    store.write(data);
    WalletService.markWin(normalizedUserId, bet.payout);
    return bet;
  }

  processAutoCashouts(snap) {
    const data = store.read();
    let changed = false;
    for (const bet of Object.values(data.bets)) {
      if (bet.roundId === snap.roundId && bet.status === 'open' && bet.autoCashoutAt && snap.multiplier >= bet.autoCashoutAt) {
        bet.status = 'cashed_out';
        bet.multiplier = Number(bet.autoCashoutAt.toFixed ? bet.autoCashoutAt.toFixed(2) : Number(bet.autoCashoutAt).toFixed(2));
        bet.payout = Number((bet.amount * bet.multiplier).toFixed(2));
        bet.closedAt = new Date().toISOString();
        WalletService.markWin(bet.userId, bet.payout);
        changed = true;
      }
    }
    if (changed) store.write(data);
  }

  getMyBets(userId) {
    const snap = this.engine.snapshot();
    const normalizedUserId = WalletService.normalizeUserId(userId);
    const data = store.read();
    return VALID_SLOTS.map(slot => data.bets[key(normalizedUserId, snap.roundId, slot)] || null);
  }

  getMyBet(userId) {
    return this.getMyBets(userId)[0];
  }

  getLatestResult(userId) {
    const normalizedUserId = WalletService.normalizeUserId(userId);
    const data = store.read();
    const closed = Object.values(data.bets)
      .filter(b => b.userId === normalizedUserId && ['cashed_out', 'lost'].includes(b.status) && b.closedAt)
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    if (!closed.length) return null;
    const roundId = closed[0].roundId;
    const roundBets = closed.filter(b => b.roundId === roundId).sort((a, b) => a.slot - b.slot);
    const totalStake = roundBets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalPayout = roundBets.reduce((sum, b) => sum + Number(b.payout || 0), 0);
    return {
      roundId,
      totalStake: Number(totalStake.toFixed(2)),
      totalPayout: Number(totalPayout.toFixed(2)),
      net: Number((totalPayout - totalStake).toFixed(2)),
      status: totalPayout > 0 ? 'won' : 'lost',
      bets: roundBets
    };
  }


  settleCrashedRound(roundId) {
    store.update(data => {
      for (const bet of Object.values(data.bets)) {
        if (bet.roundId === roundId && bet.status === 'open') {
          bet.status = 'lost';
          bet.multiplier = null;
          bet.payout = 0;
          bet.closedAt = new Date().toISOString();
        }
      }
      return data;
    });
  }
}
