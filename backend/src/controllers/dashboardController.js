const pool = require('../config/database');

async function estatisticas(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM usuarios) AS utilizadores,
        (SELECT COUNT(*) FROM clientes) AS clientes,
        (SELECT COUNT(*) FROM contas) AS contas,
        (SELECT COUNT(*) FROM movimentos) AS movimentos,
        COALESCE((SELECT SUM(saldo) FROM contas WHERE estado = 'ATIVA'), 0) AS saldo,
        (SELECT COUNT(*) FROM transferencias) AS transferencias,
        (SELECT COUNT(*) FROM creditos) AS creditos
    `);

    const r = result.rows[0];
    const recent = await pool.query(`
      SELECT 'MOVIMENTO' AS tipo, m.tipo AS operacao, m.valor, m.criado_em, c.numero_conta
      FROM movimentos m JOIN contas c ON c.id = m.conta_id
      UNION ALL
      SELECT 'TRANSFERÊNCIA', t.tipo, t.valor, t.criado_em, c.numero_conta
      FROM transferencias t JOIN contas c ON c.id = t.conta_origem_id
      ORDER BY criado_em DESC LIMIT 8
    `);

    res.json({
      success: true,
      estatisticas: {
        utilizadores: Number(r.utilizadores), clientes: Number(r.clientes),
        contas: Number(r.contas), movimentos: Number(r.movimentos),
        saldo: Number(r.saldo), transferencias: Number(r.transferencias),
        creditos: Number(r.creditos)
      },
      recentes: recent.rows
    });
  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    res.status(500).json({ success: false, message: 'Erro ao consultar o Dashboard.' });
  }
}

module.exports = { estatisticas };
