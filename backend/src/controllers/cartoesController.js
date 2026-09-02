const pool = require('../config/database');

async function listarCartoes(req,res){
  try{
    const r=await pool.query(`
      SELECT ct.*, cl.numero_cliente, cl.nome_completo, c.numero_conta
      FROM cartoes ct
      JOIN clientes cl ON cl.id=ct.cliente_id
      JOIN contas c ON c.id=ct.conta_id
      ORDER BY ct.criado_em DESC`);
    res.json({success:true,cartoes:r.rows});
  }catch(e){
    console.error(e);
    res.status(500).json({success:false,message:'Não foi possível carregar os cartões.'});
  }
}

async function emitirCartao(req,res){
  const {clienteId,contaId,tipo='DEBITO',validade,limite=0}=req.body;
  const utilizadorId=req.user.id;
  const limiteNumero=Number(limite);

  if(!clienteId||!contaId||!validade)
    return res.status(400).json({success:false,message:'Cliente, conta e validade são obrigatórios.'});

  const validadeDate = new Date(`${validade}T00:00:00`);
  if(Number.isNaN(validadeDate.getTime()))
    return res.status(400).json({success:false,message:'A validade do cartão é inválida.'});
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  if(validadeDate < hoje)
    return res.status(400).json({success:false,message:'A validade do cartão deve ser futura.'});

  if(!['DEBITO','CREDITO'].includes(tipo))
    return res.status(400).json({success:false,message:'Tipo de cartão inválido.'});

  if(!Number.isFinite(limiteNumero)||limiteNumero<0)
    return res.status(400).json({success:false,message:'Limite de cartão inválido.'});

  try{
    const relacao=await pool.query(`
      SELECT c.id
      FROM contas c
      JOIN clientes cl ON cl.id=c.cliente_id
      WHERE c.id=$1
        AND cl.id=$2
        AND c.estado='ATIVA'
        AND cl.estado='ATIVO'
    `,[contaId,clienteId]);

    if(!relacao.rows.length)
      return res.status(409).json({success:false,message:'A conta selecionada não pertence ao cliente ou não está ativa.'});

    const numero=await gerarNumeroCartao();

    const r=await pool.query(`
      INSERT INTO cartoes(numero_cartao,cliente_id,conta_id,tipo,validade,limite,criado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      RETURNING *`,
      [numero,clienteId,contaId,tipo,validade,limiteNumero,utilizadorId]);

    res.status(201).json({success:true,cartao:r.rows[0]});
  }catch(e){
    console.error(e);
    if(e.code==='23505')
      return res.status(409).json({success:false,message:'Não foi possível gerar um número de cartão único.'});
    res.status(500).json({success:false,message:'Não foi possível emitir o cartão.'});
  }
}

async function gerarNumeroCartao(){
  const r=await pool.query(`
    SELECT LPAD(nextval('cartao_numero_seq')::TEXT,16,'0') AS numero
  `);
  return r.rows[0].numero;
}

async function alterarEstadoCartao(req,res){
  const {id}=req.params;
  const {estado}=req.body;

  if(!['ATIVO','BLOQUEADO','CANCELADO'].includes(estado))
    return res.status(400).json({success:false,message:'Estado inválido.'});

  try{
    const r=await pool.query(
      'UPDATE cartoes SET estado=$1 WHERE id=$2 RETURNING *',
      [estado,id]
    );
    if(!r.rows.length)
      return res.status(404).json({success:false,message:'Cartão não encontrado.'});
    res.json({success:true,cartao:r.rows[0]});
  }catch(e){
    console.error(e);
    res.status(500).json({success:false,message:'Não foi possível alterar o estado do cartão.'});
  }
}

module.exports={listarCartoes,emitirCartao,alterarEstadoCartao};
