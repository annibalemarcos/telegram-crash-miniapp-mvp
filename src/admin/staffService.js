import crypto from 'node:crypto';
import { JsonStore } from '../storage/jsonStore.js';
import { env } from '../config/env.js';

const store = new JsonStore('data/staff.json', { staff: {}, sessions: {} });
const ROLES = ['owner', 'admin', 'support', 'auditor'];

function now() { return new Date().toISOString(); }
function hashPassword(password, salt = crypto.randomBytes(12).toString('hex')) {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return { salt, hash };
}
function verifyPassword(password, item) {
  if (!item?.salt || !item?.passwordHash) return false;
  return hashPassword(password, item.salt).hash === item.passwordHash;
}
function cleanStaff(s) {
  if (!s) return null;
  const { passwordHash, salt, ...safe } = s;
  return safe;
}
function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'support';
}

function ensureDefaultOwner() {
  store.update(data => {
    const existing = Object.values(data.staff || {}).find(s => s.username === 'admin');
    if (!existing) {
      const hp = hashPassword(env.adminPassword || 'admin123');
      const id = crypto.randomUUID();
      data.staff[id] = {
        id,
        username: 'admin',
        displayName: 'Admin principal',
        role: 'owner',
        active: true,
        passwordHash: hp.hash,
        salt: hp.salt,
        createdAt: now(),
        updatedAt: now()
      };
    }
    data.sessions = data.sessions || {};
    return data;
  });
}

ensureDefaultOwner();

export class StaffService {
  static roles() { return ROLES; }

  static login(usernameOrPassword, passwordMaybe) {
    ensureDefaultOwner();
    const data = store.read();
    let username = String(usernameOrPassword || '').trim();
    let password = String(passwordMaybe || '');

    // Compatibilidade: se a tela antiga enviar só a senha admin, entra como owner.
    if (!password && username === env.adminPassword) {
      username = 'admin';
      password = env.adminPassword;
    }

    const staff = Object.values(data.staff || {}).find(s => s.username.toLowerCase() === username.toLowerCase());
    if (!staff || !staff.active || !verifyPassword(password, staff)) throw new Error('Credenciais de staff inválidas.');

    const token = crypto.randomBytes(28).toString('hex');
    store.update(current => {
      current.sessions = current.sessions || {};
      current.sessions[token] = { token, staffId: staff.id, createdAt: now(), lastSeenAt: now() };
      return current;
    });
    return { token, staff: cleanStaff(staff) };
  }

  static verifyToken(token) {
    ensureDefaultOwner();
    const t = String(token || '');
    if (!t) return null;

    // Compatibilidade temporária com o token antigo (a senha do .env).
    if (t === env.adminPassword) {
      const owner = Object.values(store.read().staff || {}).find(s => s.username === 'admin');
      return cleanStaff(owner) || { id: 'legacy-owner', username: 'admin', displayName: 'Admin principal', role: 'owner', active: true };
    }

    const data = store.read();
    const session = data.sessions?.[t];
    if (!session) return null;
    const staff = data.staff?.[session.staffId];
    if (!staff?.active) return null;
    store.update(current => {
      if (current.sessions?.[t]) current.sessions[t].lastSeenAt = now();
      return current;
    });
    return cleanStaff(staff);
  }

  static requireRole(staff, allowed = ['owner', 'admin', 'support', 'auditor']) {
    if (!staff) throw new Error('Staff não autenticado.');
    if (!allowed.includes(staff.role)) throw new Error('Sem permissão para esta ação.');
  }

  static list() {
    ensureDefaultOwner();
    return Object.values(store.read().staff || {}).map(cleanStaff).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static create(input = {}, actor = null) {
    this.requireRole(actor, ['owner', 'admin']);
    const username = String(input.username || '').trim().toLowerCase();
    const displayName = String(input.displayName || username).trim().slice(0, 80);
    const password = String(input.password || '').trim();
    const role = normalizeRole(input.role);
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error('Usuário staff deve ter 3-32 caracteres: letras, números, ponto, hífen ou underline.');
    if (password.length < 4) throw new Error('Senha staff muito curta. Use pelo menos 4 caracteres no MVP.');
    const hp = hashPassword(password);
    const data = store.update(current => {
      if (Object.values(current.staff || {}).some(s => s.username === username)) throw new Error('Já existe staff com esse usuário.');
      const id = crypto.randomUUID();
      current.staff[id] = { id, username, displayName, role, active: true, passwordHash: hp.hash, salt: hp.salt, createdAt: now(), updatedAt: now() };
      return current;
    });
    return cleanStaff(Object.values(data.staff).find(s => s.username === username));
  }

  static update(id, input = {}, actor = null) {
    this.requireRole(actor, ['owner', 'admin']);
    const staffId = String(id || '').trim();
    const data = store.update(current => {
      const s = current.staff?.[staffId];
      if (!s) throw new Error('Staff não encontrado.');
      if (s.role === 'owner' && actor?.role !== 'owner') throw new Error('Só owner edita owner.');
      if (input.displayName !== undefined) s.displayName = String(input.displayName || s.username).trim().slice(0, 80);
      if (input.role !== undefined) s.role = normalizeRole(input.role);
      if (input.active !== undefined) s.active = Boolean(input.active);
      if (input.password) {
        const hp = hashPassword(String(input.password));
        s.passwordHash = hp.hash;
        s.salt = hp.salt;
      }
      s.updatedAt = now();
      return current;
    });
    return cleanStaff(data.staff[staffId]);
  }

  static remove(id, actor = null) {
    this.requireRole(actor, ['owner']);
    const staffId = String(id || '').trim();
    store.update(current => {
      const s = current.staff?.[staffId];
      if (!s) throw new Error('Staff não encontrado.');
      if (s.role === 'owner') throw new Error('Não remova o owner principal pelo MVP. Desative ou troque a senha.');
      delete current.staff[staffId];
      return current;
    });
    return true;
  }
}
