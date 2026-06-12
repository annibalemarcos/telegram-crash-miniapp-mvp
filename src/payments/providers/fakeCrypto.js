export const fakeCryptoProvider = {
  name: 'fake_crypto',
  label: 'Cripto Fake',
  mode: 'fake',
  enabled: true,
  async createDeposit({ userId, amount, coin = 'USDT' }) {
    const normalizedCoin = String(coin || 'USDT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    return {
      provider: 'fake_crypto',
      userId: String(userId || 'guest'),
      amount: Number(amount || 0),
      coin: normalizedCoin,
      status: 'pending_fake',
      address: `${normalizedCoin}_FAKE_DEPOSIT_${String(userId || 'guest').slice(0, 12)}_DEMO_ONLY`,
      network: normalizedCoin === 'BTC' ? 'BTC-FAKE' : 'TRC20-FAKE',
      message: 'Endereço fake. Não envie cripto real.'
    };
  }
};
