const { isSafeToRetry } = require('./emailService');
const TIME_ZONE = 'America/Sao_Paulo';
const TYPE = 'PAGAMENTOS_VENCIMENTO';
const duePaymentsSQL = `SELECT id, descricao, valor, forma_pagamento,
  to_char(data_vencimento, 'DD/MM/YYYY') AS vencimento, origem
  FROM contas_pagar
  WHERE usuario_id = $1 AND data_vencimento = $2::date
    AND status = 'PENDENTE' AND data_pagamento IS NULL
  ORDER BY descricao, id`;

function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const displayDate = date => date.split('-').reverse().join('/');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const methods = { PIX: 'PIX', BOLETO: 'Boleto', DINHEIRO: 'Dinheiro', OUTROS: 'Outros',
  CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito',
  TRANSFERENCIA: 'Transferência', CREDITO_BRADESCO: 'Crédito Bradesco',
  CREDITO_SANTANDER: 'Crédito Santander', DEBITO_BRADESCO: 'Débito Bradesco',
  DEBITO_SANTANDER: 'Débito Santander' };

function buildMessage(payments, date) {
  const totalCents = payments.reduce((sum, row) => sum + Math.round(Number(row.valor) * 100), 0);
  const title = `Pagamentos com vencimento hoje - ${displayDate(date)}`;
  const rows = payments.map(row => [row.descricao, currency.format(Number(row.valor)),
    methods[row.forma_pagamento] || row.forma_pagamento || 'Não informada', row.vencimento]);
  const total = `Total a pagar no dia: ${currency.format(totalCents / 100)}`;
  return {
    subject: `FluxoPro — ${title}`,
    text: `FluxoPro\n${title}\n\n${rows.map(row => row.join(' | ')).join('\n')}\n\n${total}`,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:16px;color:#1f2937"><div style="max-width:680px;margin:auto">
<h1>FluxoPro</h1><h2 style="font-size:20px">${escapeHtml(title)}</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>${['Pagamento', 'Valor', 'Forma de pagamento', 'Vencimento'].map(label => `<th style="padding:8px;text-align:left;border-bottom:2px solid #ccc">${label}</th>`).join('')}</tr></thead>
<tbody>${rows.map(row => `<tr>${row.map(cell => `<td style="padding:8px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p><strong>${escapeHtml(total)}</strong></p></div></body></html>`,
  };
}

function createDailyPaymentNotificationService({ pool, sendMail, email, logger = console, now = () => new Date() }) {
  const recipient = email.trim().toLowerCase();
  return async function sendDailyDuePaymentsNotification() {
    const date = localDate(now());
    logger.info('[INFO] Iniciando verificação diária de pagamentos.');
    logger.info(`[INFO] Data de referência: ${displayDate(date)}.`);
    const client = await pool.connect();
    let locked = false;
    let lockKey;
    try {
      const users = await client.query('SELECT id FROM usuarios WHERE LOWER(email) = $1 AND ativo = true', [recipient]);
      if (users.rows.length !== 1) throw new Error('Usuário não localizado ou ambíguo.');
      const userId = users.rows[0].id;
      logger.info('[INFO] Usuário localizado.');
      lockKey = `${TYPE}:${userId}:${date}:${recipient}`;
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [lockKey])).rows[0].locked;
      if (!locked) return 'ocupado';
      const key = [userId, TYPE, date, recipient];
      const previous = await client.query(`SELECT status FROM notificacoes_envio
        WHERE usuario_id = $1 AND tipo = $2 AND data_referencia = $3 AND destinatario = $4`, key);
      if (previous.rows.length && previous.rows[0].status !== 'ERRO') {
        logger.info(`[INFO] Aviso já processado ou aguardando conferência (${previous.rows[0].status}).`);
        return 'ignorado';
      }
      const payments = (await client.query(duePaymentsSQL, [userId, date])).rows;
      logger.info(`[INFO] ${payments.length} pagamentos encontrados.`);
      if (!payments.length) {
        logger.info(`[INFO] Nenhum pagamento com vencimento em ${displayDate(date)}.`);
        return 'vazio';
      }
      const message = buildMessage(payments, date);
      // Persist BEFORE SMTP. A restart must not blindly repeat an uncertain delivery.
      const claim = await client.query(`INSERT INTO notificacoes_envio
        (usuario_id, tipo, data_referencia, destinatario, status)
        VALUES ($1, $2, $3, $4, 'ENVIANDO')
        ON CONFLICT (usuario_id, tipo, data_referencia, destinatario)
        DO UPDATE SET status = 'ENVIANDO', erro = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE notificacoes_envio.status = 'ERRO'
        RETURNING id`, key);
      if (!claim.rows.length) return 'ignorado';
      const id = claim.rows[0].id;
      try {
        await sendMail({ ...message, to: recipient });
      } catch (error) {
        const status = isSafeToRetry(error) ? 'ERRO' : 'INCERTO';
        await client.query(`UPDATE notificacoes_envio SET status = $2, erro = $3,
          updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id, status, status === 'ERRO' ? 'SMTP recusou o envio; permite nova tentativa.' : 'Entrega incerta; conferir no provedor antes de reenviar.']);
        // Do not log raw SMTP errors: they can contain credentials and message content.
        logger.error(`[ERROR] Falha ao processar aviso diário de pagamentos (${status}).`);
        return status === 'ERRO' ? 'erro' : 'incerto';
      }
      await client.query(`UPDATE notificacoes_envio SET status = 'ENVIADO',
        enviado_em = CURRENT_TIMESTAMP, erro = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
      logger.info(`[INFO] E-mail enviado para ${recipient}.`);
      return 'enviado';
    } finally {
      try {
        if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
        client.release();
      } catch (error) {
        client.release(true);
        throw error;
      }
    }
  };
}
module.exports = { createDailyPaymentNotificationService, buildMessage, localDate, TIME_ZONE, duePaymentsSQL };
