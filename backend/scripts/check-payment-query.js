// Read-only PostgreSQL check. Fixtures are a CTE, never persisted to any table.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { duePaymentsSQL } = require('../src/services/dailyPaymentNotificationService');
const sql = `BEGIN READ ONLY;
PREPARE check_daily(integer, date) AS
WITH contas_pagar(id, usuario_id, descricao, valor, forma_pagamento, data_vencimento, status, data_pagamento, origem) AS (
  VALUES
  (1, 7, 'Internet PF', 100.00, 'BOLETO', DATE '2026-10-02', 'PENDENTE', NULL::date, 'PF'),
  (2, 7, 'Empresa PJ', 200.00, 'PIX', DATE '2026-10-02', 'PENDENTE', NULL::date, 'PJ'),
  (3, 7, 'Extra', 50.50, 'PIX', DATE '2026-10-02', 'PENDENTE', NULL::date, 'PF'),
  (4, 7, 'Futura', 900.00, 'PIX', DATE '2026-10-03', 'PENDENTE', NULL::date, 'PF'),
  (5, 7, 'Paga', 900.00, 'PIX', DATE '2026-10-02', 'PAGO', DATE '2026-10-02', 'PF'),
  (6, 8, 'Outro usuário', 900.00, 'PIX', DATE '2026-10-02', 'PENDENTE', NULL::date, 'PF'),
  (7, 7, 'Pagamento registrado', 900.00, 'PIX', DATE '2026-10-02', 'PENDENTE', DATE '2026-10-02', 'PF'),
  (8, 7, 'Anterior', 900.00, 'PIX', DATE '2026-10-01', 'PENDENTE', NULL::date, 'PF')
)
SELECT row_to_json(result) FROM (${duePaymentsSQL}) result;
EXECUTE check_daily(7, DATE '2026-10-02');
ROLLBACK;`;
const result = spawnSync('docker', ['exec', '-i', 'fluxopro_db', 'psql', '-U', 'fluxopro_admin', '-d', 'fluxopro', '-XAtq', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
assert.deepEqual(rows.map(row => row.id).sort(), [1, 2, 3]);
assert.equal(rows.reduce((sum, row) => sum + Number(row.valor), 0), 350.50);
assert.deepEqual([...new Set(rows.map(row => row.origem))].sort(), ['PF', 'PJ']);
assert.ok(rows.every(row => row.vencimento === '02/10/2026'));
console.log('PostgreSQL: filtros de vencimento, usuário, pagamento, PF/PJ e total aprovados; nenhum dado alterado.');
