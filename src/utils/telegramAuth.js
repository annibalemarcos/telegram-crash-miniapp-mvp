import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function parseInitData(initData = '') {
  return Object.fromEntries(new URLSearchParams(initData));
}

export function validateTelegramInitData(initData = '') {
  if (!env.botToken) return { ok: true, devMode: true, user: null };
  if (!initData) return { ok: false, error: 'missing_init_data' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const ok = hash && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch {}
  return ok ? { ok: true, user } : { ok: false, error: 'bad_hash' };
}
