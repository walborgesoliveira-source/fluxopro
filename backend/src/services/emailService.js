const nodemailer = require('nodemailer');

function createEmailService(env = process.env) {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_SECURE'];
  if (required.some(key => !env[key]) || Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error('Configuração SMTP incompleta.');
  }
  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false'].includes(env.SMTP_SECURE)) {
    throw new Error('Porta ou SMTP_SECURE inválido.');
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: env.SMTP_SECURE === 'true',
    requireTLS: env.SMTP_SECURE !== 'true',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return message => transporter.sendMail({ ...message, from: env.SMTP_FROM });
}

// A lost connection after DATA may mean the server accepted the email.
// Only definitely rejected/pre-DATA failures are safe to retry automatically.
function isSafeToRetry(error) {
  return ['EAUTH', 'EDNS', 'ECONNECTION', 'ETLS', 'EENVELOPE'].includes(error.code)
    || (Number(error.responseCode) >= 400 && Number(error.responseCode) <= 599)
    || (error.code === 'ETIMEDOUT' && error.command === 'CONN');
}
module.exports = { createEmailService, isSafeToRetry };
