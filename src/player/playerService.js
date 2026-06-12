import { JsonStore } from '../storage/jsonStore.js';

const store = new JsonStore('data/players.json', { players: {} });
const CRYPTO_COINS = ['BTC', 'ETH', 'USDT_TRC20', 'USDT_ERC20', 'SOL'];
const PIX_TYPES = ['cpf', 'email', 'phone', 'random'];

function normalizeUserId(userId) {
  return String(userId || 'guest');
}

function normalizeAccountType(type) {
  return type === 'account' ? 'account' : 'guest';
}

function sanitizeText(value, max = 140) {
  return String(value || '').trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
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

function validatePixKey(type, value) {
  if (type === 'cpf') {
    if (!isValidCpf(value)) throw new Error('CPF inválido. Escolha CPF e informe uma chave Pix CPF válida.');
    return onlyDigits(value);
  }
  if (type === 'email') {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('E-mail Pix inválido.');
    return email;
  }
  if (type === 'phone') {
    const digits = onlyDigits(value);
    if (![10, 11, 12, 13].includes(digits.length)) throw new Error('Telefone Pix inválido. Use DDD + número.');
    return digits;
  }
  if (type === 'random') {
    const key = sanitizeText(value, 180);
    if (!/^[a-zA-Z0-9_.@-]{20,120}$/.test(key)) throw new Error('Chave aleatória Pix inválida. Cole a chave completa gerada pelo banco.');
    return key;
  }
  throw new Error('Tipo de chave Pix inválido.');
}

function validatePayout(payload = {}) {
  const method = sanitizeText(payload.method, 24);
  if (!['pix', 'crypto'].includes(method)) throw new Error('Escolha Pix ou cripto para pagamento/recebimento.');

  if (method === 'pix') {
    const pixKeyType = sanitizeText(payload.pixKeyType, 24).toLowerCase() || 'cpf';
    if (!PIX_TYPES.includes(pixKeyType)) throw new Error('Selecione um tipo de chave Pix válido.');
    const pixKey = sanitizeText(payload.pixKey, 180);
    const pixKeyConfirm = sanitizeText(payload.pixKeyConfirm, 180);
    if (!pixKey) throw new Error('Informe a chave Pix.');
    if (!pixKeyConfirm) throw new Error('Confirme a chave Pix.');
    const normalizedPixKey = validatePixKey(pixKeyType, pixKey);
    const normalizedPixKeyConfirm = validatePixKey(pixKeyType, pixKeyConfirm);
    if (normalizedPixKey !== normalizedPixKeyConfirm) throw new Error('As duas chaves Pix não conferem.');
    const labels = { cpf: 'CPF', email: 'E-mail', phone: 'Telefone', random: 'Chave aleatória' };
    return { method: 'pix', label: `Pix · ${labels[pixKeyType]}`, pixKeyType, pixKey: normalizedPixKey, coin: null, walletAddress: null, confirmedAt: new Date().toISOString() };
  }

  const coin = sanitizeText(payload.coin, 24).toUpperCase();
  const walletAddress = sanitizeText(payload.walletAddress, 240);
  const walletAddressConfirm = sanitizeText(payload.walletAddressConfirm, 240);
  if (!CRYPTO_COINS.includes(coin)) throw new Error('Selecione uma moeda cripto válida.');
  if (!walletAddress) throw new Error('Informe a carteira cripto.');
  if (walletAddress.length < 12) throw new Error('A carteira parece curta demais.');
  if (walletAddress !== walletAddressConfirm) throw new Error('As duas carteiras não conferem.');
  return { method: 'crypto', label: `Cripto · ${coin}`, pixKey: null, coin, walletAddress, confirmedAt: new Date().toISOString() };
}

function mask(value) {
  const s = String(value || '');
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function publicPlayer(player) {
  if (!player) return null;
  const payout = player.payout ? { ...player.payout } : null;
  if (payout?.pixKey) payout.pixKeyMasked = mask(payout.pixKey);
  if (payout?.walletAddress) payout.walletMasked = mask(payout.walletAddress);
  return { ...player, payout };
}

export class PlayerService {
  static cryptoCoins() {
    return CRYPTO_COINS;
  }

  static pixTypes() {
    return PIX_TYPES;
  }

  static get(userId) {
    const id = normalizeUserId(userId);
    const data = store.read();
    if (!data.players[id]) {
      data.players[id] = {
        userId: id,
        mode: 'guest',
        accountCreated: false,
        displayName: 'Visitante',
        payout: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.write(data);
    }
    return publicPlayer(data.players[id]);
  }

  static setMode(userId, mode = 'guest') {
    const id = normalizeUserId(userId);
    return publicPlayer(store.update(data => {
      if (!data.players[id]) data.players[id] = this.get(id);
      data.players[id].mode = normalizeAccountType(mode);
      data.players[id].updatedAt = new Date().toISOString();
      return data;
    }).players[id]);
  }

  static savePayout(userId, payload = {}) {
    const id = normalizeUserId(userId);
    const payout = validatePayout(payload);
    return publicPlayer(store.update(data => {
      if (!data.players[id]) data.players[id] = this.get(id);
      data.players[id].payout = payout;
      data.players[id].updatedAt = new Date().toISOString();
      return data;
    }).players[id]);
  }

  static createAccount(userId, payload = {}) {
    const id = normalizeUserId(userId);
    const displayName = sanitizeText(payload.displayName, 80) || 'Jogador';
    const email = sanitizeText(payload.email, 120);
    return publicPlayer(store.update(data => {
      if (!data.players[id]) data.players[id] = this.get(id);
      data.players[id].mode = 'account';
      data.players[id].accountCreated = true;
      data.players[id].displayName = displayName;
      data.players[id].email = email || null;
      data.players[id].updatedAt = new Date().toISOString();
      return data;
    }).players[id]);
  }

  static hasPayout(userId) {
    const id = normalizeUserId(userId);
    const data = store.read();
    return Boolean(data.players[id]?.payout?.method);
  }

  static isBlocked(userId) {
    const id = normalizeUserId(userId);
    const data = store.read();
    return Boolean(data.players[id]?.blocked);
  }

  static requireActive(userId) {
    const id = normalizeUserId(userId);
    const data = store.read();
    if (data.players[id]?.blocked) {
      throw new Error(data.players[id].blockReason || 'Usuário bloqueado pelo admin.');
    }
  }

  static requirePayout(userId) {
    this.requireActive(userId);
    if (!this.hasPayout(userId)) {
      throw new Error('Antes de depositar ou apostar, configure como quer pagar/receber: Pix ou cripto.');
    }
  }
}
