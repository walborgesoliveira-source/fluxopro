const cron = require('node-cron');
const schema = require('../database/notificationSchema');
const { createEmailService } = require('../services/emailService');
const { createDailyPaymentNotificationService, TIME_ZONE } = require('../services/dailyPaymentNotificationService');

async function startDailyPaymentNotificationJob({ pool, env = process.env, logger = console } = {}) {
  if (env.DAILY_PAYMENT_NOTIFICATION_ENABLED !== 'true') {
    logger.info('[INFO] Aviso diário de pagamentos desativado.');
    return null;
  }
  const time = env.DAILY_PAYMENT_NOTIFICATION_TIME || '08:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Horário inválido: use HH:mm.');
  const email = (env.DAILY_PAYMENT_NOTIFICATION_EMAIL || '').trim();
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('Destinatário inválido.');
  const sendMail = createEmailService(env);
  await pool.query(schema);
  const run = createDailyPaymentNotificationService({ pool, sendMail, email, logger });
  const [hour, minute] = time.split(':').map(Number);
  const task = cron.schedule(`${minute} ${hour} * * *`, async () => {
    try { await run(); }
    catch { logger.error('[ERROR] Falha ao processar aviso diário de pagamentos.'); }
  }, { timezone: TIME_ZONE, noOverlap: true });
  logger.info(`[INFO] Aviso diário agendado às ${time} (${TIME_ZONE}).`);
  return task;
}
module.exports = { startDailyPaymentNotificationJob };
