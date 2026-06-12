import crypto from 'node:crypto';
import { JsonStore } from '../storage/jsonStore.js';

const store = new JsonStore('data/tickets.json', { tickets: {} });
const CATEGORIES = ['deposito', 'saque', 'jogo', 'conta', 'bug', 'outro'];
const STATUSES = ['open', 'waiting_user', 'waiting_staff', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function now() { return new Date().toISOString(); }
function clean(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function publicTicket(t) {
  return {
    ...t,
    messages: (t.messages || []).filter(m => !m.internal).map(({ internal, ...m }) => m)
  };
}
function nextNumber(data) {
  const count = Object.keys(data.tickets || {}).length + 1;
  return `T-${String(count).padStart(5, '0')}`;
}

export class TicketService {
  static categories() { return CATEGORIES; }
  static statuses() { return STATUSES; }
  static priorities() { return PRIORITIES; }

  static create(userId, input = {}, player = null) {
    const idUser = clean(userId, 120) || 'guest';
    const subject = clean(input.subject, 120);
    const message = clean(input.message, 2000);
    const category = CATEGORIES.includes(input.category) ? input.category : 'outro';
    if (subject.length < 3) throw new Error('Informe um assunto com pelo menos 3 caracteres.');
    if (message.length < 5) throw new Error('Descreva o problema com pelo menos 5 caracteres.');
    let createdId = '';
    const data = store.update(current => {
      const id = crypto.randomUUID();
      createdId = id;
      current.tickets[id] = {
        id,
        number: nextNumber(current),
        userId: idUser,
        playerName: player?.displayName || 'Visitante',
        category,
        subject,
        status: 'open',
        priority: 'normal',
        assignedTo: null,
        createdAt: now(),
        updatedAt: now(),
        messages: [{ id: crypto.randomUUID(), authorType: 'user', authorName: player?.displayName || 'Visitante', body: message, createdAt: now() }]
      };
      return current;
    });
    return publicTicket(data.tickets[createdId]);
  }

  static listForUser(userId) {
    const idUser = clean(userId, 120) || 'guest';
    return Object.values(store.read().tickets || {})
      .filter(t => t.userId === idUser)
      .map(publicTicket)
      .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  static replyUser(userId, ticketId, message, player = null) {
    const body = clean(message, 2000);
    if (body.length < 2) throw new Error('Mensagem muito curta.');
    const idUser = clean(userId, 120) || 'guest';
    const data = store.update(current => {
      const t = current.tickets?.[ticketId];
      if (!t || t.userId !== idUser) throw new Error('Ticket não encontrado.');
      if (t.status === 'closed') throw new Error('Ticket fechado. Abra outro chamado.');
      t.messages.push({ id: crypto.randomUUID(), authorType: 'user', authorName: player?.displayName || 'Visitante', body, createdAt: now() });
      t.status = 'waiting_staff';
      t.updatedAt = now();
      return current;
    });
    return publicTicket(data.tickets[ticketId]);
  }

  static listAdmin({ status = '', q = '' } = {}) {
    const search = clean(q, 120).toLowerCase();
    return Object.values(store.read().tickets || {})
      .filter(t => !status || t.status === status)
      .filter(t => !search || JSON.stringify(t).toLowerCase().includes(search))
      .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  static replyStaff(ticketId, message, staff, internal = false) {
    const body = clean(message, 2000);
    if (body.length < 2) throw new Error('Mensagem muito curta.');
    const data = store.update(current => {
      const t = current.tickets?.[ticketId];
      if (!t) throw new Error('Ticket não encontrado.');
      t.messages.push({ id: crypto.randomUUID(), authorType: 'staff', authorName: staff?.displayName || staff?.username || 'Staff', staffId: staff?.id || null, body, internal: Boolean(internal), createdAt: now() });
      if (!internal) t.status = 'waiting_user';
      t.updatedAt = now();
      return current;
    });
    return data.tickets[ticketId];
  }

  static setStatus(ticketId, status, staff = null) {
    if (!STATUSES.includes(status)) throw new Error('Status inválido.');
    const data = store.update(current => {
      const t = current.tickets?.[ticketId];
      if (!t) throw new Error('Ticket não encontrado.');
      t.status = status;
      t.updatedAt = now();
      t.statusChangedBy = staff?.username || 'admin';
      return current;
    });
    return data.tickets[ticketId];
  }

  static assign(ticketId, staffId, staff = null) {
    const data = store.update(current => {
      const t = current.tickets?.[ticketId];
      if (!t) throw new Error('Ticket não encontrado.');
      t.assignedTo = clean(staffId, 120) || null;
      t.updatedAt = now();
      t.assignedBy = staff?.username || 'admin';
      return current;
    });
    return data.tickets[ticketId];
  }

  static setPriority(ticketId, priority, staff = null) {
    if (!PRIORITIES.includes(priority)) throw new Error('Prioridade inválida.');
    const data = store.update(current => {
      const t = current.tickets?.[ticketId];
      if (!t) throw new Error('Ticket não encontrado.');
      t.priority = priority;
      t.updatedAt = now();
      t.priorityChangedBy = staff?.username || 'admin';
      return current;
    });
    return data.tickets[ticketId];
  }
}
