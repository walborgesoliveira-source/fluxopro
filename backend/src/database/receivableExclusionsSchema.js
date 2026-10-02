// Remember an explicitly removed monthly occurrence without disabling its series.
module.exports = `CREATE TABLE IF NOT EXISTS contas_receber_exclusoes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  recorrencia_id INTEGER NOT NULL REFERENCES recorrencias(id) ON DELETE CASCADE,
  competencia DATE NOT NULL CHECK (EXTRACT(DAY FROM competencia) = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, recorrencia_id, competencia)
)`;
