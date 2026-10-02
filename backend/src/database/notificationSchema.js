// Shared by initial setup and the notification job; no financial data is changed.
module.exports = `CREATE TABLE IF NOT EXISTS notificacoes_envio (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(100) NOT NULL,
  data_referencia DATE NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('ENVIANDO', 'ENVIADO', 'ERRO', 'INCERTO')),
  enviado_em TIMESTAMPTZ,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, tipo, data_referencia, destinatario)
)`;
