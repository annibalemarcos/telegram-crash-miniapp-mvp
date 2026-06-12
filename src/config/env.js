import fs from 'node:fs';
import path from 'node:path';

const ENV_FILE = path.resolve(process.cwd(), '.env');

function parseDotEnv(raw = '') {
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    map[key] = value;
  }
  return map;
}

function readDotEnvMap() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return parseDotEnv(fs.readFileSync(ENV_FILE, 'utf8'));
}

function loadDotEnv() {
  const fileMap = readDotEnvMap();
  for (const [key, value] of Object.entries(fileMap)) {
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  botToken: process.env.BOT_TOKEN || '',
  webappUrl: process.env.WEBAPP_URL || 'http://localhost:3000',
  appName: process.env.APP_NAME || 'Sky Pilot MVP',
  houseEdge: num(process.env.HOUSE_EDGE, 0.04),
  startingBalance: num(process.env.STARTING_BALANCE, 1000),
  roundTickMs: num(process.env.ROUND_TICK_MS, 90),
  minBet: num(process.env.MIN_BET, 1),
  maxBet: num(process.env.MAX_BET, 500),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
};

export function editableConfig() {
  return {
    adminPassword: env.adminPassword,
    appName: env.appName,
    houseEdge: env.houseEdge,
    startingBalance: env.startingBalance,
    minBet: env.minBet,
    maxBet: env.maxBet,
    roundTickMs: env.roundTickMs,
    webappUrl: env.webappUrl,
    port: env.port
  };
}

function cleanString(value, name, max = 240) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${name} não pode ficar vazio.`);
  if (s.length > max) throw new Error(`${name} está grande demais.`);
  return s;
}

function cleanNumber(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} precisa ser número.`);
  if (n < min || n > max) throw new Error(`${name} deve ficar entre ${min} e ${max}.`);
  return integer ? Math.round(n) : n;
}

function normalizeEditablePatch(input = {}) {
  const patch = {};
  if ('adminPassword' in input) patch.adminPassword = cleanString(input.adminPassword, 'ADMIN_PASSWORD', 80);
  if ('appName' in input) patch.appName = cleanString(input.appName, 'APP_NAME', 80);
  if ('webappUrl' in input) {
    const url = cleanString(input.webappUrl, 'WEBAPP_URL', 300);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid_protocol');
    } catch {
      throw new Error('WEBAPP_URL precisa ser uma URL válida. Para Telegram WebApp, use HTTPS público.');
    }
    patch.webappUrl = url;
  }
  if ('houseEdge' in input) patch.houseEdge = cleanNumber(input.houseEdge, 'HOUSE_EDGE', { min: 0, max: 0.25 });
  if ('startingBalance' in input) patch.startingBalance = cleanNumber(input.startingBalance, 'STARTING_BALANCE', { min: 0, max: 1000000 });
  if ('minBet' in input) patch.minBet = cleanNumber(input.minBet, 'MIN_BET', { min: 0.01, max: 1000000 });
  if ('maxBet' in input) patch.maxBet = cleanNumber(input.maxBet, 'MAX_BET', { min: 0.01, max: 1000000 });
  if ('roundTickMs' in input) patch.roundTickMs = cleanNumber(input.roundTickMs, 'ROUND_TICK_MS', { min: 40, max: 2000, integer: true });
  if ('port' in input) patch.port = cleanNumber(input.port, 'PORT', { min: 1, max: 65535, integer: true });

  const minBet = 'minBet' in patch ? patch.minBet : env.minBet;
  const maxBet = 'maxBet' in patch ? patch.maxBet : env.maxBet;
  if (minBet > maxBet) throw new Error('MIN_BET não pode ser maior que MAX_BET.');
  return patch;
}

export function updateEditableConfig(input = {}) {
  const patch = normalizeEditablePatch(input);
  Object.assign(env, patch);
  process.env.ADMIN_PASSWORD = env.adminPassword;
  process.env.APP_NAME = env.appName;
  process.env.WEBAPP_URL = env.webappUrl;
  process.env.HOUSE_EDGE = String(env.houseEdge);
  process.env.STARTING_BALANCE = String(env.startingBalance);
  process.env.MIN_BET = String(env.minBet);
  process.env.MAX_BET = String(env.maxBet);
  process.env.ROUND_TICK_MS = String(env.roundTickMs);
  process.env.PORT = String(env.port);
  return editableConfig();
}

export function saveEditableConfigToEnvFile() {
  const current = readDotEnvMap();
  const next = {
    ...current,
    BOT_TOKEN: env.botToken,
    WEBAPP_URL: env.webappUrl,
    PORT: String(env.port),
    ADMIN_PASSWORD: env.adminPassword,
    APP_NAME: env.appName,
    HOUSE_EDGE: String(env.houseEdge),
    STARTING_BALANCE: String(env.startingBalance),
    MIN_BET: String(env.minBet),
    MAX_BET: String(env.maxBet),
    ROUND_TICK_MS: String(env.roundTickMs)
  };
  const order = ['BOT_TOKEN', 'WEBAPP_URL', 'PORT', 'ADMIN_PASSWORD', 'APP_NAME', 'HOUSE_EDGE', 'STARTING_BALANCE', 'MIN_BET', 'MAX_BET', 'ROUND_TICK_MS'];
  const lines = [];
  for (const key of order) lines.push(`${key}=${next[key] ?? ''}`);
  for (const [key, value] of Object.entries(next)) {
    if (!order.includes(key)) lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_FILE, `${lines.join('\n')}\n`, 'utf8');
  return ENV_FILE;
}
