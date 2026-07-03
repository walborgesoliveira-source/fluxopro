function parseDataLocal(dataStr) {
  if (dataStr instanceof Date && !Number.isNaN(dataStr.getTime())) {
    return {
      ano: dataStr.getUTCFullYear(),
      mes: dataStr.getUTCMonth() + 1,
      dia: dataStr.getUTCDate(),
    };
  }
  const [ano, mes, dia] = String(dataStr).slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia) {
    throw new Error('Data do pagamento inválida.');
  }
  return { ano, mes, dia };
}

function adicionarMeses(ano, mes, quantidade) {
  const data = new Date(Date.UTC(ano, mes - 1 + quantidade, 1));
  return {
    ano: data.getUTCFullYear(),
    mes: data.getUTCMonth() + 1,
  };
}

function calcularFatura(dataCompra, diaFechamento, diaVencimento, parcelasAdicionais = 0) {
  const data = parseDataLocal(dataCompra);
  const fechamento = Number(diaFechamento);
  const vencimento = Number(diaVencimento);

  if (!fechamento || !vencimento) {
    throw new Error('Configure os dias de fechamento e vencimento do cartão.');
  }

  const mesesAteFechamento = data.dia >= fechamento ? 1 : 0;
  const mesesAteVencimento = vencimento <= fechamento ? 1 : 0;
  const competencia = adicionarMeses(
    data.ano,
    data.mes,
    mesesAteFechamento + mesesAteVencimento + parcelasAdicionais
  );
  const ultimoDia = new Date(Date.UTC(competencia.ano, competencia.mes, 0)).getUTCDate();
  const diaReal = Math.min(vencimento, ultimoDia);
  const dataVencimento = `${competencia.ano}-${String(competencia.mes).padStart(2, '0')}-${String(diaReal).padStart(2, '0')}`;

  return {
    mes: competencia.mes,
    ano: competencia.ano,
    dataVencimento,
  };
}

async function buscarOuCriarFatura(client, usuarioId, cartaoId, mes, ano) {
  const result = await client.query(
    `INSERT INTO faturas (
       cartao_id, usuario_id, mes_referencia, ano_referencia, valor_total, valor_pago
     )
     VALUES ($1, $2, $3, $4, 0, 0)
     ON CONFLICT (usuario_id, cartao_id, mes_referencia, ano_referencia)
     DO UPDATE SET cartao_id = EXCLUDED.cartao_id
     RETURNING *`,
    [cartaoId, usuarioId, mes, ano]
  );
  return result.rows[0];
}

async function recalcularFatura(client, faturaId) {
  const result = await client.query(
    `UPDATE faturas f
     SET valor_total = GREATEST(
       COALESCE(f.valor_informado, 0),
       COALESCE((
         SELECT SUM(cp.valor)
         FROM contas_pagar cp
         WHERE cp.fatura_id = f.id
       ), 0)
     ),
     valor_pago = LEAST(
       COALESCE(f.valor_pago, 0),
       GREATEST(
         COALESCE(f.valor_informado, 0),
         COALESCE((
           SELECT SUM(cp.valor)
           FROM contas_pagar cp
           WHERE cp.fatura_id = f.id
         ), 0)
       )
     ),
     status = CASE
       WHEN GREATEST(
         COALESCE(f.valor_informado, 0),
         COALESCE((SELECT SUM(cp.valor) FROM contas_pagar cp WHERE cp.fatura_id = f.id), 0)
       ) > 0
       AND LEAST(
         COALESCE(f.valor_pago, 0),
         GREATEST(
           COALESCE(f.valor_informado, 0),
           COALESCE((SELECT SUM(cp.valor) FROM contas_pagar cp WHERE cp.fatura_id = f.id), 0)
         )
       ) >= GREATEST(
         COALESCE(f.valor_informado, 0),
         COALESCE((SELECT SUM(cp.valor) FROM contas_pagar cp WHERE cp.fatura_id = f.id), 0)
       )
       THEN 'PAGA'
       WHEN f.status = 'PAGA' THEN 'ABERTA'
       ELSE f.status
     END
     WHERE f.id = $1
     RETURNING *`,
    [faturaId]
  );
  return result.rows[0] || null;
}

module.exports = {
  calcularFatura,
  buscarOuCriarFatura,
  recalcularFatura,
};
