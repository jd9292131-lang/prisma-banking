const pool=require('../config/database');

const ESTADOS_FINAIS = ['PAGO','CANCELADO','DEVOLVIDO'];

async function listarCheques(req,res){
 try{
  const r=await pool.query(`
   SELECT ch.*,c.numero_conta,cl.numero_cliente,cl.nome_completo
   FROM cheques ch
   JOIN contas c ON c.id=ch.conta_id
   JOIN clientes cl ON cl.id=c.cliente_id
   ORDER BY ch.criado_em DESC`);
  res.json({success:true,cheques:r.rows});
 }catch(e){
  console.error(e);
  res.status(500).json({success:false,message:'Não foi possível carregar os cheques.'});
 }
}

async function emitirCheque(req,res){
 const {contaId,beneficiario,valor,dataValidade,descricao}=req.body;
  const beneficiarioNome=String(beneficiario||'').trim();
 const utilizadorId=req.user.id;
 const v=Number(Number(valor).toFixed(2));

 if(!contaId||!beneficiarioNome||!Number.isFinite(v)||!(v>0))
  return res.status(400).json({success:false,message:'Conta, beneficiário e valor são obrigatórios.'});

 if(dataValidade){
  const validade = new Date(`${dataValidade}T00:00:00`);
  if(Number.isNaN(validade.getTime()))
   return res.status(400).json({success:false,message:'A data de validade do cheque é inválida.'});
  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  if(validade < hoje)
   return res.status(400).json({success:false,message:'A data de validade do cheque não pode estar no passado.'});
 }

 const client=await pool.connect();
 try{
  await client.query('BEGIN');

  const conta=await client.query(`
   SELECT id,saldo,COALESCE(valor_reservado_cheques,0) AS valor_reservado_cheques,COALESCE(valor_reservado_transferencias,0) AS valor_reservado_transferencias
   FROM contas
   WHERE id=$1 AND estado='ATIVA'
   FOR UPDATE
  `,[contaId]);

  if(!conta.rows.length)
   return await abortar(client,res,404,'Conta não encontrada ou inativa.');

  const saldo=Number(conta.rows[0].saldo);
  const reservado=Number(conta.rows[0].valor_reservado_cheques||0);
  const reservadoTransferencias=Number(conta.rows[0].valor_reservado_transferencias||0);
  const disponivel=Number((saldo-reservado-reservadoTransferencias).toFixed(2));

  if(disponivel<v)
   return await abortar(client,res,409,'Saldo disponível insuficiente para reservar este cheque.');

  const numero=`CHQ-${await obterNumeroCheque(client)}`;

  const r=await client.query(`
   INSERT INTO cheques(numero_cheque,conta_id,beneficiario,valor,data_validade,descricao,criado_por)
   VALUES($1,$2,$3,$4,$5,$6,$7)
   RETURNING *
  `,[numero,contaId,beneficiarioNome,v,dataValidade||null,descricao||null,utilizadorId]);

  await client.query(`
   UPDATE contas
   SET valor_reservado_cheques=COALESCE(valor_reservado_cheques,0)+$1
   WHERE id=$2
  `,[v,contaId]);

  await client.query('COMMIT');
  res.status(201).json({success:true,cheque:r.rows[0],saldoDisponivel:Number((disponivel-v).toFixed(2))});
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  console.error(e);
  res.status(500).json({success:false,message:'Não foi possível emitir o cheque.'});
 }finally{client.release();}
}

async function obterNumeroCheque(client){
 const r=await client.query(`
  SELECT 'CHQ-' || LPAD(nextval('cheque_numero_seq')::TEXT,8,'0') AS numero
 `);
 return r.rows[0].numero.replace(/^CHQ-/,'');
}

async function abortar(client,res,status,message){
 await client.query('ROLLBACK');
 return res.status(status).json({success:false,message});
}

async function alterarEstadoCheque(req,res){
 const {id}=req.params;
 const {estado}=req.body;

 if(!ESTADOS_FINAIS.includes(estado) && estado!=='EMITIDO')
  return res.status(400).json({success:false,message:'Estado inválido.'});

 const client=await pool.connect();
 try{
  await client.query('BEGIN');

  const r=await client.query(`
   SELECT ch.*, c.saldo, COALESCE(c.valor_reservado_cheques,0) AS valor_reservado_cheques, COALESCE(c.valor_reservado_transferencias,0) AS valor_reservado_transferencias
   FROM cheques ch
   JOIN contas c ON c.id=ch.conta_id
   WHERE ch.id=$1
   FOR UPDATE OF ch,c
  `,[id]);

  if(!r.rows.length)
   return await abortar(client,res,404,'Cheque não encontrado.');

  const cheque=r.rows[0];

  if(cheque.estado===estado){
   await client.query('COMMIT');
   return res.json({success:true,cheque});
  }

  if(ESTADOS_FINAIS.includes(cheque.estado))
   return await abortar(client,res,409,'Um cheque já finalizado não pode voltar a ser alterado.');

  if(estado==='EMITIDO')
   return await abortar(client,res,400,'O cheque já está emitido.');

  const valor=Number(cheque.valor);
  const reservado=Number(cheque.valor_reservado_cheques||0);

  if(estado==='PAGO' && cheque.data_validade){
   const hoje = new Date();
   hoje.setHours(0,0,0,0);
   const validade = new Date(`${String(cheque.data_validade).slice(0,10)}T00:00:00`);
   if(!Number.isNaN(validade.getTime()) && validade < hoje)
    return await abortar(client,res,409,'O cheque está fora da validade e não pode ser pago.');
  }
  const reservadoTransferencias=Number(cheque.valor_reservado_transferencias||0);

  if(estado==='PAGO'){
   const saldo=Number(cheque.saldo);
   if(saldo-reservadoTransferencias<valor)
    return await abortar(client,res,409,'Saldo insuficiente para pagar o cheque.');

   await client.query(`
    UPDATE contas
    SET saldo=saldo-$1,
        valor_reservado_cheques=GREATEST(0,COALESCE(valor_reservado_cheques,0)-$1)
    WHERE id=$2
   `,[valor,cheque.conta_id]);

   await client.query(`
    INSERT INTO movimentos(
      conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id
    ) VALUES(
      $1,'CHEQUE_PAGO',$2,$3,$4,$5,$6,$7
    )
   `,[cheque.conta_id,valor,saldo,Number((saldo-valor).toFixed(2)),
      `MOV-${require('crypto').randomUUID()}`,
      `Pagamento do cheque ${cheque.numero_cheque}`,req.user.id]);
  }else{
   if(reservado<valor)
    return await abortar(client,res,409,'A reserva de cheques da conta está inconsistente.');

   await client.query(`
    UPDATE contas
    SET valor_reservado_cheques=GREATEST(0,COALESCE(valor_reservado_cheques,0)-$1)
    WHERE id=$2
   `,[valor,cheque.conta_id]);
  }

  const atualizado=await client.query(`
   UPDATE cheques SET estado=$1 WHERE id=$2 RETURNING *
  `,[estado,id]);

  await client.query('COMMIT');
  res.json({success:true,cheque:atualizado.rows[0]});
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  console.error(e);
  res.status(500).json({success:false,message:'Não foi possível alterar o cheque.'});
 }finally{client.release();}
}

module.exports={listarCheques,emitirCheque,alterarEstadoCheque};
