export const fakePixProvider = {
  name: 'fake_pix',
  label: 'Pix Fake',
  mode: 'fake',
  enabled: true,
  async createDeposit({ userId, amount }) {
    const value = Number(amount || 0);
    return {
      provider: 'fake_pix',
      userId: String(userId || 'guest'),
      amount: value,
      status: 'pending_fake',
      copyPaste: `00020126FAKE-PIX-MVP-USER-${userId || 'guest'}-AMOUNT-${value.toFixed(2)}6304DEMO`,
      qrText: `PIX FAKE • ${value.toFixed(2)} créditos • sem valor financeiro`,
      expiresInSeconds: 900,
      message: 'Pagamento fake gerado. Não transfere dinheiro de verdade.'
    };
  }
};
