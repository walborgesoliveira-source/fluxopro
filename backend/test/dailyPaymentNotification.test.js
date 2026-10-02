const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDailyPaymentNotificationService, localDate, buildMessage, duePaymentsSQL } = require('../src/services/dailyPaymentNotificationService');
const { startDailyPaymentNotificationJob } = require('../src/jobs/dailyPaymentNotificationJob');
const { isSafeToRetry, createEmailService } = require('../src/services/emailService');
const logger = { info() {}, error() {} };
const payment = { id: 1, descricao: 'Internet', valor: '149.90', forma_pagamento: 'BOLETO', vencimento: '02/10/2026', origem: 'PF' };

function fixture({ payments = [payment], sendError, failAfterSend = false, users = [{ id: 7 }] } = {}) {
  let status;
  let locked = false;
  let sent = 0;
  const messages = [];
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id FROM usuarios')) return { rows: users };
      if (sql.includes('pg_try_advisory_lock')) {
        const acquired = !locked;
        if (acquired) locked = true;
        return { rows: [{ locked: acquired }] };
      }
      if (sql.includes('pg_advisory_unlock')) { locked = false; return { rows: [] }; }
      if (sql.startsWith('SELECT status')) return { rows: status ? [{ status }] : [] };
      if (sql === duePaymentsSQL) return { rows: payments };
      if (sql.startsWith('INSERT INTO notificacoes_envio')) { status = 'ENVIANDO'; return { rows: [{ id: 1 }] }; }
      if (sql.includes("SET status = 'ENVIADO'")) {
        if (failAfterSend) throw Error('database unavailable');
        status = 'ENVIADO'; return { rows: [] };
      }
      if (sql.includes('SET status = $2')) { status = params[1]; return { rows: [] }; }
      throw Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const run = createDailyPaymentNotificationService({
    pool: { async connect() { return client; } },
    async sendMail(message) {
      if (sendError) { const err = sendError; sendError = null; throw err; }
      sent++; messages.push(message);
    },
    email: 'waldirborges@iaguru.com.br', logger,
    now: () => new Date('2026-10-02T11:00:00Z'),
  });
  return { run, calls, messages, get status() { return status; }, get sent() { return sent; } };
}

test('data de São Paulo independe do timezone do servidor e da virada UTC', () => {
  assert.equal(localDate(new Date('2026-10-03T01:59:59Z')), '2026-10-02');
  assert.equal(localDate(new Date('2026-10-03T03:00:00Z')), '2026-10-03');
});

test('consulta parametriza usuário/data, exige pendente e sem pagamento, não limita PF/PJ', async () => {
  const f = fixture(); await f.run();
  const query = f.calls.find(call => call.sql === duePaymentsSQL);
  assert.deepEqual(query.params, [7, '2026-10-02']);
  assert.match(query.sql, /usuario_id = \$1 AND data_vencimento = \$2::date/);
  assert.match(query.sql, /status = 'PENDENTE' AND data_pagamento IS NULL/);
  assert.doesNotMatch(query.sql, /origem\s*=/);
  assert.deepEqual(f.calls[0].params, ['waldirborges@iaguru.com.br']);
  assert.match(f.calls[0].sql, /ativo = true/);
});

test('e-mail inclui dados, PF e PJ e total brasileiro, com escape de HTML', async () => {
  const f = fixture({ payments: [
    { ...payment, descricao: '<Internet & luz>', valor: '100.00' },
    { ...payment, origem: 'PJ', descricao: 'Empresa', valor: '200.00' },
    { ...payment, valor: '50.50' },
  ] });
  assert.equal(await f.run(), 'enviado');
  const mail = f.messages[0];
  assert.equal(mail.to, 'waldirborges@iaguru.com.br');
  assert.equal(mail.subject, 'FluxoPro — Pagamentos com vencimento hoje - 02/10/2026');
  assert.match(mail.html, /&lt;Internet &amp; luz&gt;/);
  assert.match(mail.html, /Empresa/);
  assert.match(mail.html, /Boleto/);
  assert.match(mail.text, /350,50/);
  assert.equal(f.status, 'ENVIADO');
});

test('nenhum pagamento não envia nem grava tentativa', async () => {
  const f = fixture({ payments: [] });
  assert.equal(await f.run(), 'vazio'); assert.equal(f.sent, 0); assert.equal(f.status, undefined);
});

test('segunda execução no mesmo dia não duplica', async () => {
  const f = fixture(); await f.run(); await f.run(); assert.equal(f.sent, 1);
});

test('execuções concorrentes não duplicam', async () => {
  const f = fixture(); await Promise.all([f.run(), f.run()]); assert.equal(f.sent, 1);
});

test('falha SMTP definitiva permite nova tentativa', async () => {
  const f = fixture({ sendError: Object.assign(Error('private smtp detail'), { code: 'EAUTH' }) });
  assert.equal(await f.run(), 'erro'); assert.equal(f.status, 'ERRO');
  assert.equal(await f.run(), 'enviado'); assert.equal(f.sent, 1);
  assert.doesNotMatch(JSON.stringify(f.calls), /private smtp detail/);
});

test('falha ambígua não causa reenvio automático', async () => {
  const f = fixture({ sendError: Object.assign(Error('timeout'), { code: 'ETIMEDOUT', command: 'DATA' }) });
  assert.equal(await f.run(), 'incerto'); assert.equal(f.status, 'INCERTO');
  assert.equal(await f.run(), 'ignorado'); assert.equal(f.sent, 0);
});

test('SMTP aceitou mas gravação falhou: próxima execução não reenvia', async () => {
  const f = fixture({ failAfterSend: true });
  await assert.rejects(f.run());
  assert.equal(f.status, 'ENVIANDO'); assert.equal(await f.run(), 'ignorado'); assert.equal(f.sent, 1);
});

test('usuário ausente ou ambíguo não recebe pagamentos', async () => {
  for (const users of [[], [{ id: 1 }, { id: 2 }]]) {
    const f = fixture({ users }); await assert.rejects(f.run()); assert.equal(f.sent, 0);
  }
});

test('total decimal evita artefatos de ponto flutuante', () => {
  assert.match(buildMessage([{ ...payment, valor: '0.10' }, { ...payment, valor: '0.20' }], '2026-10-02').text, /0,30/);
});

test('SMTP exige configuração válida e classificação de falha conservadora', () => {
  assert.throws(() => createEmailService({}));
  assert.equal(isSafeToRetry({ responseCode: 550 }), true);
  assert.equal(isSafeToRetry({ code: 'ESOCKET', command: 'DATA' }), false);
});

test('scheduler desativado não toca o banco e horário inválido é rejeitado', async () => {
  assert.equal(await startDailyPaymentNotificationJob({ env: {}, logger }), null);
  await assert.rejects(startDailyPaymentNotificationJob({ env: {
    DAILY_PAYMENT_NOTIFICATION_ENABLED: 'true', DAILY_PAYMENT_NOTIFICATION_TIME: '25:90',
  }, logger }), /Horário inválido/);
});

test('scheduler usa 08:00 e America/Sao_Paulo', async () => {
  const cron = require('node-cron');
  const original = cron.schedule;
  let captured;
  cron.schedule = (expression, callback, options) => { captured = { expression, options }; return 'task'; };
  try {
    const task = await startDailyPaymentNotificationJob({ pool: { async query() {} }, logger, env: {
      DAILY_PAYMENT_NOTIFICATION_ENABLED: 'true', DAILY_PAYMENT_NOTIFICATION_EMAIL: 'test@example.com',
      SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_FROM: 'test@example.com',
    } });
    assert.equal(task, 'task');
    assert.deepEqual(captured, { expression: '0 8 * * *', options: { timezone: 'America/Sao_Paulo', noOverlap: true } });
  } finally { cron.schedule = original; }
});
