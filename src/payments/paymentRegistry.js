import { fakePixProvider } from './providers/fakePix.js';
import { fakeCryptoProvider } from './providers/fakeCrypto.js';

const providers = new Map();
providers.set(fakePixProvider.name, fakePixProvider);
providers.set(fakeCryptoProvider.name, fakeCryptoProvider);

export class PaymentRegistry {
  static listProviders() {
    return Array.from(providers.values()).map(p => ({
      name: p.name,
      label: p.label,
      mode: p.mode,
      enabled: p.enabled
    }));
  }

  static async createDeposit(providerName, payload) {
    const provider = providers.get(providerName);
    if (!provider || !provider.enabled) throw new Error('Provider indisponível.');
    return provider.createDeposit(payload);
  }
}
