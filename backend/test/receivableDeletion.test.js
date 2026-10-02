const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/database/connection');
const contas = require('../src/controllers/contasReceberController');
const recorrencias = require('../src/controllers/recorrenciasController');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
}

test('excluir recorrente e recarregar não recria; meses seguintes continuam gerando', async () => {
  const original = pool.connect;
  const exclusions = new Set();
  const occurrences = new Set(['2026-10-01']);
  const queries = [];
  const client = {
    release() {},
    async query(sql, args) {
      queries.push(sql);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.includes('SELECT r.id FROM recorrencias')) return { rows: [{ id: 10 }] };
      if (sql.startsWith('DELETE FROM contas_receber')) {
        assert.deepEqual(args, ['42', 1]);
        occurrences.delete('2026-10-01');
        return { rows: [{ recorrencia_id: 10, competencia: '2026-10-01' }] };
      }
      if (sql.includes('INSERT INTO contas_receber_exclusoes')) {
        assert.deepEqual(args, [1, 10, '2026-10-01']);
        exclusions.add(args[2]); return { rows: [] };
      }
      if (sql.includes('SELECT *') && sql.includes('FROM recorrencias')) {
        assert.match(sql, /ORDER BY id FOR UPDATE/);
        return { rows: [{ id: 10, tipo: 'RECEBER', dia_vencimento: 1, descricao: 'Cliente', valor: '100.00', origem: 'PJ' }] };
      }
      if (sql.includes('SELECT 1 FROM contas_receber_exclusoes')) {
        assert.deepEqual(args.slice(0, 2), [1, 10]);
        return { rows: exclusions.has(args[2]) ? [{ '?column?': 1 }] : [] };
      }
      if (sql.startsWith('SELECT id FROM contas_receber')) {
        const date = `${args[2]}-${String(args[1]).padStart(2, '0')}-01`;
        return { rows: occurrences.has(date) ? [{ id: 42 }] : [] };
      }
      if (sql.includes('INSERT INTO contas_receber')) { occurrences.add(args[4]); return { rows: [] }; }
      throw Error(`Unexpected query: ${sql}`);
    },
  };
  pool.connect = async () => client;
  try {
    const deleted = response();
    await contas.excluir({ params: { id: '42' }, userId: 1 }, deleted);
    assert.equal(deleted.statusCode, 200);
    assert.ok(queries.indexOf('COMMIT') > queries.findIndex(sql => sql.includes('INSERT INTO contas_receber_exclusoes')));
    for (const mes of [10, 10, 11, 11]) {
      const res = response();
      await recorrencias.gerarMensal({ body: { mes, ano: 2026, tipo: 'RECEBER' }, userId: 1 }, res);
      assert.equal(res.statusCode, 200);
    }
    assert.deepEqual([...occurrences], ['2026-11-01']);
    assert.ok(!queries.some(sql => /UPDATE recorrencias SET ativo/.test(sql)));
  } finally { pool.connect = original; }
});

test('conta avulsa não cria exclusão de recorrência; conta de outro usuário retorna 404', async () => {
  const original = pool.connect;
  try {
    for (const exists of [true, false]) {
      const queries = [];
      pool.connect = async () => ({
        release() {}, async query(sql, args) {
          queries.push(sql);
          if (sql.startsWith('DELETE')) {
            assert.match(sql, /usuario_id = \$2/);
            assert.deepEqual(args, ['42', 2]);
            return { rows: exists ? [{ recorrencia_id: null, competencia: '2026-10-01' }] : [] };
          }
          return { rows: [] };
        },
      });
      const res = response();
      await contas.excluir({ params: { id: '42' }, userId: 2 }, res);
      assert.equal(res.statusCode, exists ? 200 : 404);
      assert.ok(!queries.some(sql => sql.includes('INSERT INTO contas_receber_exclusoes')));
      assert.ok(queries.includes(exists ? 'COMMIT' : 'ROLLBACK'));
    }
  } finally { pool.connect = original; }
});
