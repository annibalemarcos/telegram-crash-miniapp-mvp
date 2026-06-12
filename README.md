# Sky Pilot MVP — Telegram Mini App

MVP demonstrativo inspirado em jogos de crash/aviãozinho, feito para Telegram Mini App.

> **Importante:** esta versão usa somente créditos fake. Não processa dinheiro real, não executa Pix real, não executa cripto real e não deve ser usada em produção como jogo de azar.

## O que esta versão tem

- Bot Telegram com botão Web App quando `WEBAPP_URL` é HTTPS.
- Mini App responsivo.
- Rodada global sincronizada no servidor.
- Contagem regressiva antes da rodada.
- Multiplicador subindo em tempo real via SSE.
- Histórico dos últimos crashes.
- Dois slots de aposta.
- Cash out manual e auto cash out.
- Feed fake de jogadores.
- Tela de resultado da rodada com resumo de ganho/perda por slot.
- Fluxo **guest-first**:
  - usuário entra no mini-app;
  - pode jogar como visitante ou criar conta demo;
  - antes de depositar/apostar, configura Pix ou cripto para pagamento/recebimento;
  - Pix exige chave + confirmação;
  - cripto exige moeda + carteira + confirmação.
- Depósito fake modular.
- Storage JSON local em `data/`.


## Admin web

Abra:

```txt
http://localhost:3000/admin/
```

Ou também:

```txt
http://localhost:3000/admin
```

Senha padrão no `.env`:

```env
ADMIN_PASSWORD=admin123
```

> Troque a senha antes de expor via ngrok.

## .env já incluído nesta build

Esta build já vem com `.env` preenchido para teste local/ngrok:

```env
BOT_TOKEN=8840582452:AAHPz-uS4R0UYNl4jJIPlCKbWLd1eu60fLU
WEBAPP_URL=https://0ef6-152-234-89-69.ngrok-free.app
PORT=3000
ADMIN_PASSWORD=admin123
```

Depois dos testes, revogue/regenere o token no BotFather e troque a URL do ngrok.

## Como rodar

```bat
copy .env.example .env
npm start
```

Abra no navegador:

```txt
http://localhost:3000
```

## Como rodar dentro do Telegram com ngrok

Em um terminal:

```bat
npm start
```

Em outro terminal:

```bat
ngrok http 3000
```

Copie a URL HTTPS do ngrok e coloque no `.env`:

```env
BOT_TOKEN=SEU_TOKEN_DO_BOTFATHER
WEBAPP_URL=https://sua-url.ngrok-free.app
PORT=3000
```

Reinicie:

```bat
npm start
```

Depois mande `/start` no bot.

## Endpoints principais

### Estado geral

```http
GET /api/state?userId=guest
```

Retorna jogo, carteira, jogador e apostas da rodada atual.

### Criar/selecionar modo visitante

```http
POST /api/player/mode
```

```json
{
  "userId": "guest",
  "mode": "guest"
}
```

### Criar conta demo

```http
POST /api/player/account
```

```json
{
  "userId": "guest",
  "displayName": "Marcos",
  "email": "opcional@email.com"
}
```

### Salvar recebimento Pix

```http
POST /api/player/payout
```

```json
{
  "userId": "guest",
  "method": "pix",
  "pixKey": "email@exemplo.com",
  "pixKeyConfirm": "email@exemplo.com"
}
```

### Salvar recebimento cripto

```http
POST /api/player/payout
```

```json
{
  "userId": "guest",
  "method": "crypto",
  "coin": "USDT_TRC20",
  "walletAddress": "TXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "walletAddressConfirm": "TXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

### Apostar

```http
POST /api/bet
```

```json
{
  "userId": "guest",
  "amount": 10,
  "slot": 1,
  "autoCashoutAt": 1.5
}
```

Aposta só é liberada depois de salvar Pix ou cripto.

### Cash out

```http
POST /api/cashout
```

```json
{
  "userId": "guest",
  "slot": 1
}
```

### Depósito fake

```http
POST /api/deposit/fake
```

```json
{
  "userId": "guest",
  "provider": "fake_pix",
  "amount": 100
}
```

Depósito fake também exige Pix ou cripto configurado.

## Estrutura

```txt
public/
  index.html
  styles.css
  app.js
src/
  bot/
  config/
  game/
  payments/
  player/
  storage/
  wallet/
  server.js
```

## Próximos passos bons

- Melhorar tela de resultado com animações e comprovante demo.
- Histórico por usuário.
- Painel admin demo.
- Banco SQLite.
- Providers Pix/cripto fake mais completos.
- Deploy HTTPS real.



## Painel admin web

Acesse no navegador:

```txt
http://localhost:3000/admin/
```

Senha padrão no `.env.example`:

```env
ADMIN_PASSWORD=admin123
```

Troque antes de expor via ngrok. O painel é apenas para o MVP demo e permite:

- ver resumo da sala e da rodada global;
- listar visitantes/contas demo;
- ver payout configurado com Pix/wallet mascarados;
- bloquear/desbloquear jogador;
- ajustar saldo fake;
- ver apostas recentes;
- ver histórico de rodadas;
- iniciar rodada agora;
- forçar crash durante teste;
- ajustar house edge demo em runtime.

Tudo continua em modo fake/demo. Não processa Pix real, cripto real, saque real ou dinheiro real.

## Atualização v5 — formulário Pix/Cripto corrigido

Nesta versão a tela de pagamento/recebimento foi ajustada:

- Ao selecionar **Pix**, apenas os campos Pix aparecem.
- Ao selecionar **Cripto**, apenas os campos de cripto aparecem.
- O Pix agora tem dropdown de tipo de chave:
  - CPF
  - E-mail
  - Telefone
  - Chave aleatória
- O front-end ajuda com máscara/placeholder.
- O back-end valida o tipo escolhido:
  - CPF precisa passar validação de CPF;
  - E-mail precisa ter formato válido;
  - Telefone precisa ter DDD + número;
  - Chave aleatória precisa ter tamanho/formato mínimo.
- A confirmação dupla continua obrigatória.

## Configurações editáveis pelo Admin

Na seção **Configurações do MVP**, agora dá para editar e salvar direto pelo painel:

- `ADMIN_PASSWORD`
- `APP_NAME`
- `WEBAPP_URL`
- `HOUSE_EDGE`
- `STARTING_BALANCE`
- `MIN_BET`
- `MAX_BET`
- `ROUND_TICK_MS`

Ao salvar, o app atualiza o runtime e também grava os valores no arquivo `.env`.

Observações práticas:

- `HOUSE_EDGE` muda na hora.
- `ROUND_TICK_MS` muda na hora e reinicia o timer interno da rodada.
- `MIN_BET` e `MAX_BET` passam a valer nas próximas apostas.
- `STARTING_BALANCE` vale para novas carteiras criadas ou resetadas.
- `WEBAPP_URL` passa a ser usada pelo bot nos próximos `/start`.
- Se você trocar `ADMIN_PASSWORD`, o painel atualiza o token local automaticamente, mas se outro navegador estiver aberto ele precisará fazer login de novo.
- Trocar `PORT` ainda exige reiniciar o servidor, por isso ela fica no `.env`, mas não como campo principal do painel.

## v7 — Tickets de suporte + Staff

Esta versão adiciona um módulo de suporte demo/fake, integrado ao mini-app e ao painel admin.

### Login staff/admin

Painel:

```txt
http://localhost:3000/admin/
```

Credenciais padrão do owner:

```txt
Usuário: admin
Senha: admin123
```

A senha `ADMIN_PASSWORD` do `.env` continua valendo como senha inicial do owner. Troque antes de expor por ngrok.

### Sistema de staff

No painel admin, agora existe a seção **Sistema de staff**.

Roles disponíveis:

- `owner`: controle total; pode remover staff não-owner.
- `admin`: pode criar/editar staff e operar suporte.
- `support`: pode responder tickets e operar suporte.
- `auditor`: pode visualizar dados, sem permissão para ações sensíveis.

Tudo continua simples e local, usando `data/staff.json`. É MVP, não é segurança de banco suíço.

### Sistema de tickets

No mini-app, o jogador/visitante pode abrir ticket com:

- categoria;
- assunto;
- mensagem.

O ticket aparece no painel admin em **Tickets de suporte**, onde o staff pode:

- responder ao usuário;
- criar nota interna;
- alterar status;
- alterar prioridade;
- atribuir para um membro do staff.

Arquivos de dados:

```txt
data/tickets.json
data/staff.json
```

### Endpoints principais

Usuário:

```txt
GET  /api/support/tickets
POST /api/support/ticket
POST /api/support/ticket/reply
```

Admin/staff:

```txt
GET  /api/admin/tickets
POST /api/admin/ticket/reply
POST /api/admin/ticket/status
POST /api/admin/ticket/assign
POST /api/admin/ticket/priority
GET  /api/admin/staff
POST /api/admin/staff/create
POST /api/admin/staff/update
POST /api/admin/staff/delete
```
