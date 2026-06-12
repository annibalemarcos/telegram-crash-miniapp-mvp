import { env } from '../config/env.js';

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class TelegramBot {
  constructor() {
    this.token = env.botToken;
    this.offset = 0;
    this.running = false;
  }

  get enabled() {
    return Boolean(this.token && this.token.includes(':'));
  }

  get canOpenTelegramWebApp() {
    return isHttpsUrl(env.webappUrl);
  }

  apiUrl(method) {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  async call(method, payload) {
    const res = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || 'Telegram API error');
    return json.result;
  }

  async sendStart(chatId) {
    const baseText = `🚀 ${env.appName}\n\nMVP de jogo estilo crash com saldo demonstrativo. Sem dinheiro real.`;

    if (!this.canOpenTelegramWebApp) {
      return this.call('sendMessage', {
        chat_id: chatId,
        text:
          `${baseText}\n\n` +
          `⚠️ Modo local detectado. O Telegram só aceita Mini App com URL HTTPS pública.\n\n` +
          `Abra no navegador para testar localmente:\n${env.webappUrl}\n\n` +
          `Para abrir dentro do Telegram, use Cloudflare Tunnel, ngrok ou uma VPS HTTPS e coloque essa URL no WEBAPP_URL do .env.`
      });
    }

    return this.call('sendMessage', {
      chat_id: chatId,
      text: `${baseText}\n\nAbra o mini-app pelo botão abaixo.`,
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Abrir mini-app', web_app: { url: env.webappUrl } }
        ]]
      }
    });
  }

  async handleUpdate(update) {
    const msg = update.message;
    if (!msg) return;
    if (msg.text?.startsWith('/start')) return this.sendStart(msg.chat.id);
    if (msg.text?.startsWith('/help')) return this.call('sendMessage', {
      chat_id: msg.chat.id,
      text: 'Use /start para abrir o mini-app. Este MVP usa apenas créditos fake. No Telegram, o WebApp precisa de uma URL HTTPS pública.'
    });
  }

  async pollOnce() {
    const result = await this.call('getUpdates', {
      offset: this.offset,
      timeout: 25,
      allowed_updates: ['message']
    });
    for (const update of result) {
      this.offset = update.update_id + 1;
      await this.handleUpdate(update).catch(err => console.error('[bot] update error:', err.message));
    }
  }

  start() {
    if (!this.enabled) {
      console.log('[bot] BOT_TOKEN vazio/inválido: bot desativado. WebApp local continua funcionando.');
      return;
    }
    if (!this.canOpenTelegramWebApp) {
      console.log('[bot] WEBAPP_URL não é HTTPS. /start vai enviar instruções de modo local, sem botão WebApp.');
    }
    this.running = true;
    console.log('[bot] polling ativo. Use /start no seu bot.');
    const loop = async () => {
      while (this.running) {
        try { await this.pollOnce(); }
        catch (err) {
          console.error('[bot] polling error:', err.message);
          await new Promise(r => setTimeout(r, 2500));
        }
      }
    };
    loop();
  }
}
