require('dotenv').config();
const pool = require('../src/database/connection');
const { createEmailService } = require('../src/services/emailService');
const { createDailyPaymentNotificationService, localDate, buildMessage, duePaymentsSQL } = require('../src/services/dailyPaymentNotificationService');

async function main() {
  const email = (process.env.DAILY_PAYMENT_NOTIFICATION_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw Error('Configure DAILY_PAYMENT_NOTIFICATION_EMAIL.');
  if (process.argv.includes('--send')) {
    const sendMail = createEmailService();
    await pool.query(require('../src/database/notificationSchema'));
    const run = createDailyPaymentNotificationService({ pool, sendMail, email });
    const result = await run();
    if (['erro', 'incerto'].includes(result)) process.exitCode = 1;
    return;
  }
  const users = await pool.query('SELECT id FROM usuarios WHERE LOWER(email) = $1 AND ativo = true', [email]);
  if (users.rows.length !== 1) throw Error('Usuário não localizado ou ambíguo.');
  const date = localDate();
  const payments = (await pool.query(duePaymentsSQL, [users.rows[0].id, date])).rows;
  console.log(payments.length ? buildMessage(payments, date).text : `Nenhum pagamento com vencimento em ${date}.`);
  console.log('Prévia: nenhum e-mail enviado e nenhum registro alterado.');
}
main().catch(() => {
  console.error('[ERROR] Falha no aviso diário: confira ambiente, destinatário, SMTP e banco.');
  process.exitCode = 1;
}).finally(() => pool.end());
