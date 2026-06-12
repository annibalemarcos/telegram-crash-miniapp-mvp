import crypto from 'node:crypto';

export function makeServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

export function seedHash(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function crashPointFromSeed(seed, roundId, houseEdge = 0.04) {
  const hmac = crypto.createHmac('sha256', seed).update(String(roundId)).digest('hex');
  const slice = hmac.slice(0, 13);
  const n = parseInt(slice, 16);
  const e = 2 ** 52;
  const raw = Math.floor((100 * e - n) / (e - n)) / 100;
  const adjusted = Math.max(1.01, raw * (1 - houseEdge));
  return Number(Math.min(adjusted, 100).toFixed(2));
}

const fakeNames = [
  'Ana***', 'Bru***', 'Caio***', 'Dani***', 'Gui***', 'Juju***', 'Leo***', 'Mari***',
  'Neto***', 'Rafa***', 'Theo***', 'Vivi***', 'Zeca***', 'Bia***', 'Luan***', 'Nina***',
  'Rick***', 'Tati***', 'Igor***', 'Malu***', 'Duda***', 'Lara***', 'João***', 'Mika***'
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fakeBetAmount() {
  const options = [2, 5, 10, 15, 20, 25, 50, 75, 100, 150];
  return pick(options);
}

function fakeAutoCashout() {
  const presets = [1.12, 1.20, 1.35, 1.50, 1.80, 2.00, 2.50, 3.00, 4.00, 5.00, 7.50, 10.00];
  return Math.random() < 0.78 ? pick(presets) : Number(rand(1.1, 8.5).toFixed(2));
}

export class CrashGameEngine {
  constructor({ houseEdge = 0.04, tickMs = 90 } = {}) {
    this.houseEdge = houseEdge;
    this.tickMs = tickMs;
    this.roundId = 1;
    this.phase = 'waiting';
    this.multiplier = 1;
    this.crashAt = 2;
    this.serverSeed = makeServerSeed();
    this.previous = [];
    this.roundStartedAt = null;
    this.nextRoundAt = Date.now() + 6500;
    this.listeners = new Set();
    this.onlinePlayers = randInt(82, 220);
    this.fakeBets = [];
    this.fakeFeed = [];
    this.prepareFakeRound();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  pushFakeEvent(event) {
    this.fakeFeed.unshift({
      id: crypto.randomUUID(),
      roundId: this.roundId,
      at: new Date().toISOString(),
      ...event
    });
    this.fakeFeed = this.fakeFeed.slice(0, 20);
  }

  prepareFakeRound() {
    const total = randInt(18, 38);
    this.fakeBets = Array.from({ length: total }, (_, i) => ({
      id: `${this.roundId}:fake:${i}`,
      name: pick(fakeNames),
      amount: fakeBetAmount(),
      autoCashoutAt: fakeAutoCashout(),
      status: 'open',
      payout: 0,
      multiplier: null
    }));
    this.onlinePlayers = Math.max(60, this.onlinePlayers + randInt(-8, 12));
    this.fakeFeed = [];
    for (const bet of this.fakeBets.slice(0, 8)) {
      this.pushFakeEvent({ type: 'bet', name: bet.name, amount: bet.amount, message: `${bet.name} entrou com ${bet.amount} créditos` });
    }
  }

  updateFakePlayers() {
    if (this.phase !== 'running') return;
    for (const bet of this.fakeBets) {
      if (bet.status !== 'open') continue;
      if (bet.autoCashoutAt <= this.multiplier && bet.autoCashoutAt < this.crashAt) {
        bet.status = 'cashed_out';
        bet.multiplier = Number(bet.autoCashoutAt.toFixed(2));
        bet.payout = Number((bet.amount * bet.multiplier).toFixed(2));
        this.pushFakeEvent({
          type: 'cashout',
          name: bet.name,
          amount: bet.amount,
          multiplier: bet.multiplier,
          payout: bet.payout,
          message: `${bet.name} sacou em ${bet.multiplier.toFixed(2)}x`
        });
      }
    }
  }

  settleFakePlayers() {
    const stillOpen = this.fakeBets.filter(b => b.status === 'open');
    for (const bet of stillOpen) {
      bet.status = 'lost';
    }
    for (const bet of stillOpen.slice(0, 5)) {
      this.pushFakeEvent({
        type: 'lost',
        name: bet.name,
        amount: bet.amount,
        message: `${bet.name} não saiu a tempo`
      });
    }
  }

  roomSnapshot() {
    const cashedOut = this.fakeBets.filter(b => b.status === 'cashed_out').length;
    const open = this.fakeBets.filter(b => b.status === 'open').length;
    return {
      globalRound: true,
      onlinePlayers: this.onlinePlayers,
      fakeBetsTotal: this.fakeBets.length,
      fakeOpenBets: open,
      fakeCashedOut: cashedOut,
      feed: this.fakeFeed.slice(0, 14)
    };
  }

  snapshot() {
    return {
      roundId: this.roundId,
      phase: this.phase,
      multiplier: Number(this.multiplier.toFixed(2)),
      crashAt: this.phase === 'crashed' ? this.crashAt : null,
      serverSeedHash: seedHash(this.serverSeed),
      previous: this.previous.slice(0, 18),
      nextRoundInMs: Math.max(0, this.nextRoundAt - Date.now()),
      room: this.roomSnapshot()
    };
  }

  onUpdate(fn) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  startRound() {
    this.phase = 'running';
    this.multiplier = 1;
    this.roundStartedAt = Date.now();
    this.crashAt = crashPointFromSeed(this.serverSeed, this.roundId, this.houseEdge);
    this.pushFakeEvent({ type: 'round_start', message: `Rodada #${this.roundId} começou` });
    this.emit();
  }

  crashRound() {
    this.phase = 'crashed';
    this.multiplier = this.crashAt;
    this.settleFakePlayers();
    this.previous.unshift({
      roundId: this.roundId,
      crashAt: this.crashAt,
      serverSeed: this.serverSeed,
      hash: seedHash(this.serverSeed),
      endedAt: new Date().toISOString()
    });
    this.previous = this.previous.slice(0, 50);
    this.nextRoundAt = Date.now() + 6500;
    this.emit();
    setTimeout(() => {
      this.roundId += 1;
      this.serverSeed = makeServerSeed();
      this.phase = 'waiting';
      this.multiplier = 1;
      this.prepareFakeRound();
      this.emit();
    }, 1900);
  }

  forceCrash() {
    if (this.phase !== 'running') throw new Error('Só é possível forçar crash durante uma rodada em voo.');
    this.crashAt = Math.min(this.multiplier, this.crashAt);
    this.crashRound();
    return this.snapshot();
  }

  skipWaiting() {
    if (this.phase !== 'waiting') throw new Error('Só é possível iniciar agora enquanto a rodada está aguardando apostas.');
    this.nextRoundAt = Date.now();
    this.startRound();
    return this.snapshot();
  }

  updateHouseEdge(value) {
    const edge = Number(value);
    if (!Number.isFinite(edge) || edge < 0 || edge > 0.25) throw new Error('House edge deve ficar entre 0 e 0.25.');
    this.houseEdge = edge;
    return this.snapshot();
  }

  updateTickMs(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 40 || next > 2000) throw new Error('ROUND_TICK_MS deve ficar entre 40 e 2000.');
    this.tickMs = Math.round(next);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.emit();
    return this.snapshot();
  }

  tick() {
    const now = Date.now();
    if (this.phase === 'waiting' && now >= this.nextRoundAt) return this.startRound();
    if (this.phase !== 'running') return this.emit();

    const elapsed = (now - this.roundStartedAt) / 1000;
    this.multiplier = Number(Math.pow(1.055, elapsed * 10).toFixed(2));
    this.updateFakePlayers();
    if (this.multiplier >= this.crashAt) this.crashRound();
    else this.emit();
  }
}
