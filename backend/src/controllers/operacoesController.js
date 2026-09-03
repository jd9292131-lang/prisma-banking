const pool = require('../config/database');
const crypto = require('crypto');

function money(v) { return Number(Number(v || 0).toFixed(2)); }
function ref(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function calcPrestacao(principal, annualRate, months) {
  const p = money(principal);
  const n = Number(months);
  const r = Number(annualRate) / 100 / 12;
  if (!n || n < 1) throw new Error('Prazo inválido.');
  if (!r) return money(p / n);
  return money(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

async function listarContas(req, res) {
  try {
    const r = await pool.query(`SELECT c.*, cl.nome_completo AS cliente_nome, cl.numero_cliente FROM contas c JOIN clientes cl ON cl.id=c.cliente_id ORDER BY c.data_abertura DESC`);
    res.json({ success: true, contas: r.rows });
  } catch (e) { console.error(e); res.status(500).json({success:false,message:'Erro ao consultar contas.'}); }
}

async function abrirConta(req, res) {
  const { clienteId, tipoConta, depositoInicial, documentos = [] } = req.body;
  const criadoPor = req.user?.id || null;
  if (!criadoPor) return res.status(401).json({success:false,message:'Operador autenticado não identificado.'});
  if (!clienteId || !['ORDEM','PRAZO','SALARIO','POUPANCA'].includes(tipoConta)) return res.status(400).json({success:false,message:'Cliente e tipo de conta são obrigatórios.'});
  const deposito = money(depositoInicial);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cl = await client.query('SELECT id, numero_cliente, nome_completo FROM clientes WHERE id=$1 AND estado=\'ATIVO\'', [clienteId]);
    if (!cl.rows.length) throw new Error('Cliente não encontrado ou inativo.');
    if (deposito < 0) throw new Error('Depósito inicial inválido.');
    const nr = await client.query(`
      SELECT 'CTA-' || LPAD(nextval('conta_numero_seq')::TEXT, 8, '0') AS numero
    `);
    const conta = await client.query(`
      INSERT INTO contas(
        numero_conta,cliente_id,tipo_conta,deposito_inicial,saldo,
        valor_reservado_cheques,criado_por
      )
      VALUES($1,$2,$3,$4,$4,0,$5)
      RETURNING *
    `, [nr.rows[0].numero,clienteId,tipoConta,deposito,criadoPor||null]);
    for (const d of documentos) if (d.tipo) await client.query(`INSERT INTO documentos_cliente(cliente_id,tipo_documento,numero_documento,estado) VALUES($1,$2,$3,$4)`,[clienteId,d.tipo,d.numero||null,d.estado||'VALIDO']);
    if (deposito > 0) await client.query(`INSERT INTO movimentos(conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id) VALUES($1,'DEPOSITO_INICIAL',$2,0,$2,$3,'Depósito inicial na abertura da conta',$4)`,[conta.rows[0].id,deposito,ref('MOV'),criadoPor||null]);
    await client.query(`INSERT INTO auditoria_operacoes(utilizador_id,modulo,acao,referencia,detalhes) VALUES($1,'CONTAS','ABERTURA',$2,$3)`,[criadoPor||null,conta.rows[0].numero_conta,JSON.stringify({clienteId,tipoConta,depositoInicial:deposito})]);
    await client.query('COMMIT');
    res.status(201).json({success:true,message:'Conta aberta com sucesso.',conta:conta.rows[0]});
  } catch(e) { await client.query('ROLLBACK'); console.error(e); res.status(400).json({success:false,message:e.message||'Erro ao abrir conta.'}); }
  finally { client.release(); }
}

async function listarMovimentos(req,res){ try { const r=await pool.query(`SELECT m.*,c.numero_conta,c.cliente_id,cl.nome_completo AS cliente_nome FROM movimentos m JOIN contas c ON c.id=m.conta_id JOIN clientes cl ON cl.id=c.cliente_id ORDER BY m.criado_em DESC LIMIT 300`); res.json({success:true,movimentos:r.rows}); } catch(e){res.status(500).json({success:false,message:'Erro ao consultar movimentos.'});}}

async function obterSaldoCaixa(client) {
  // Serializa operações que alteram o caixa físico. Sem este lock, duas
  // operações simultâneas poderiam ler o mesmo saldo de caixa e ambas
  // serem aprovadas, ultrapassando o numerário disponível.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('prisma:caixa'))");
  const q = await client.query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN tipo = 'DEPOSITO' THEN valor
        WHEN tipo = 'LEVANTAMENTO' THEN -valor
        ELSE 0
      END
    ), 0) AS saldo
    FROM caixa_operacoes
  `);
  return money(q.rows[0].saldo);
}

async function operacaoCaixa(req,res){
  const {tipo,contaId,valor,descricao}=req.body;
  const utilizadorId=req.user.id;
  const v=money(valor);
  if(!['DEPOSITO','LEVANTAMENTO'].includes(tipo)||!contaId||v<=0){
    return res.status(400).json({success:false,message:'Operação de caixa inválida.'});
  }

  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const q=await client.query("SELECT *, COALESCE(valor_reservado_cheques,0) AS valor_reservado_cheques, COALESCE(valor_reservado_transferencias,0) AS valor_reservado_transferencias FROM contas WHERE id=$1 AND estado='ATIVA' FOR UPDATE",[contaId]);
    if(!q.rows.length) throw new Error('Conta não encontrada ou inativa.');

    const c=q.rows[0];
    const anterior=money(c.saldo);
    const reservado=money(c.valor_reservado_cheques);
    const reservadoTransferencias=money(c.valor_reservado_transferencias);
    const posterior=tipo==='DEPOSITO'?money(anterior+v):money(anterior-v);
    if(tipo==='LEVANTAMENTO' && money(anterior-v)<money(reservado+reservadoTransferencias)) throw new Error('Saldo disponível insuficiente devido a valores reservados para cheques ou transferências agendadas.');
    if(posterior<0) throw new Error('Saldo insuficiente para o levantamento.');

    const saldoCaixaAnterior=await obterSaldoCaixa(client);
    const saldoCaixaPosterior=tipo==='DEPOSITO'
      ? money(saldoCaixaAnterior+v)
      : money(saldoCaixaAnterior-v);
    if(saldoCaixaPosterior<0) throw new Error('Saldo físico de caixa insuficiente para esta simulação.');

    const movimento=await client.query(`
      INSERT INTO movimentos(conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `,[contaId,tipo,v,anterior,posterior,ref('MOV'),descricao||null,utilizadorId||null]);

    await client.query('UPDATE contas SET saldo=$1 WHERE id=$2',[posterior,contaId]);

    const caixa=await client.query(`
      INSERT INTO caixa_operacoes(referencia,tipo,conta_id,valor,saldo_caixa_anterior,saldo_caixa_posterior,utilizador_id)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `,[ref('CX'),tipo,contaId,v,saldoCaixaAnterior,saldoCaixaPosterior,utilizadorId||null]);

    await client.query('COMMIT');
    res.status(201).json({success:true,mensagem:'Operação realizada.',movimento:movimento.rows[0],caixa:caixa.rows[0],saldo:posterior,saldoCaixa:saldoCaixaPosterior});
  }catch(e){
    await client.query('ROLLBACK');
    res.status(400).json({success:false,message:e.message});
  }finally{client.release();}
}

async function transferir(req,res){
  const {origemId,destinoId,bancoDestino,tipo='NACIONAL',modalidade='IMEDIATA',valor,comissao=0,descricao,dataAgendada}=req.body;
  const utilizadorId=req.user.id;
  const v=money(valor), fee=money(comissao);
  if(!origemId||v<=0) return res.status(400).json({success:false,message:'Conta de origem e valor são obrigatórios.'});
  if(!['NACIONAL','INTERBANCARIA'].includes(tipo)) return res.status(400).json({success:false,message:'Tipo de transferência inválido.'});
  if(!['IMEDIATA','AGENDADA'].includes(modalidade)) return res.status(400).json({success:false,message:'Modalidade de transferência inválida.'});
  if(fee<0) return res.status(400).json({success:false,message:'A comissão não pode ser negativa.'});
  if(tipo==='INTERBANCARIA' && !String(bancoDestino||'').trim()) return res.status(400).json({success:false,message:'Indique o banco de destino para uma transferência interbancária.'});
  if(tipo==='NACIONAL' && !destinoId) return res.status(400).json({success:false,message:'Selecione a conta de destino para uma transferência nacional.'});
  if(tipo==='INTERBANCARIA' && destinoId) return res.status(400).json({success:false,message:'Para uma transferência interbancária, não selecione uma conta interna de destino.'});
  if(modalidade==='AGENDADA' && !dataAgendada) return res.status(400).json({success:false,message:'Indique a data da transferência agendada.'});
  if(modalidade==='AGENDADA' && dataAgendada && Number.isNaN(new Date(dataAgendada).getTime())) return res.status(400).json({success:false,message:'A data da transferência agendada é inválida.'});
  if(modalidade==='AGENDADA' && new Date(dataAgendada).getTime() <= Date.now()) return res.status(400).json({success:false,message:'A data agendada deve ser futura.'});

  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const ids = destinoId ? [origemId, destinoId] : [origemId];
    const oq=await client.query("SELECT *, COALESCE(valor_reservado_cheques,0) AS valor_reservado_cheques, COALESCE(valor_reservado_transferencias,0) AS valor_reservado_transferencias FROM contas WHERE id = ANY($1::uuid[]) AND estado='ATIVA' ORDER BY id FOR UPDATE",[ids]);
    if(!oq.rows.some(row => String(row.id)===String(origemId))) throw new Error('Conta de origem não encontrada.');
    const origem=oq.rows.find(row => String(row.id)===String(origemId));
    const total=money(v+fee);

    if(Number(origem.saldo)-Number(origem.valor_reservado_cheques||0)-Number(origem.valor_reservado_transferencias||0)<total) throw new Error('Saldo disponível insuficiente: existem valores reservados para cheques emitidos ou transferências agendadas.');

    let destino=null;
    if(destinoId){
      destino=oq.rows.find(row => String(row.id)===String(destinoId));
      if(!destino) throw new Error('Conta de destino não encontrada ou inativa.');
      if(String(destino.id)===String(origem.id)) throw new Error('A conta de destino deve ser diferente da conta de origem.');
    }

    const referencia=ref('TRF');
    const estado=modalidade==='AGENDADA'?'AGENDADA':'CONCLUIDA';

    if(modalidade==='AGENDADA'){
      await client.query(`
        UPDATE contas
        SET valor_reservado_transferencias=COALESCE(valor_reservado_transferencias,0)+$1
        WHERE id=$2
      `,[total,origemId]);
    }

    if(modalidade==='IMEDIATA'){
      const novoOrig=money(Number(origem.saldo)-total);
      await client.query('UPDATE contas SET saldo=$1 WHERE id=$2',[novoOrig,origemId]);
      await client.query(`INSERT INTO movimentos(conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id) VALUES($1,'TRANSFERENCIA_ENVIADA',$2,$3,$4,$5,$6,$7)`,[origemId,total,origem.saldo,novoOrig,ref('MOV'),descricao||'Transferência',utilizadorId||null]);

      if(destino){
        const novoDest=money(Number(destino.saldo)+v);
        await client.query('UPDATE contas SET saldo=$1 WHERE id=$2',[novoDest,destinoId]);
        await client.query(`INSERT INTO movimentos(conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id) VALUES($1,'TRANSFERENCIA_RECEBIDA',$2,$3,$4,$5,$6,$7)`,[destinoId,v,destino.saldo,novoDest,ref('MOV'),descricao||'Transferência recebida',utilizadorId||null]);
      }
    }

    const t=await client.query(`
      INSERT INTO transferencias(referencia,conta_origem_id,conta_destino_id,banco_destino,tipo,modalidade,valor,comissao,data_agendada,estado,descricao,utilizador_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `,[referencia,origemId,destinoId||null,bancoDestino||null,tipo,modalidade,v,fee,dataAgendada||null,estado,descricao||null,utilizadorId||null]);

    await client.query('COMMIT');
    res.status(201).json({success:true,transferencia:t.rows[0]});
  }catch(e){
    await client.query('ROLLBACK');
    res.status(400).json({success:false,message:e.message});
  }finally{client.release();}
}

async function simularCredito(req,res){
  try{
    const {valorSolicitado,prazoMeses,taxaJuro,rendimento,encargos,entradaInicial}=req.body||{};
    const valor=money(valorSolicitado), entrada=money(entradaInicial), prazo=Number(prazoMeses), taxa=Number(taxaJuro), rend=money(rendimento), enc=money(encargos);

    if(!(valor>0)||!Number.isFinite(valor)||entrada<0||entrada>valor) return res.status(400).json({success:false,message:'Valor ou entrada inicial inválidos.'});
    if(!Number.isInteger(prazo)||prazo<1||prazo>480) return res.status(400).json({success:false,message:'Prazo inválido. Use entre 1 e 480 meses.'});
    if(!Number.isFinite(taxa)||taxa<0||taxa>100) return res.status(400).json({success:false,message:'Taxa anual inválida.'});
    if(rend<0||enc<0) return res.status(400).json({success:false,message:'Rendimento e encargos não podem ser negativos.'});

    const principal = money(valor - entrada);
    const p = calcPrestacao(principal, taxa, prazo);
    const total = money(p * prazo);
    const juros = money(total - principal);

    const capacidadeMensal = money(Math.max(0, rend - enc));

    const taxaEsforco = capacidadeMensal > 0
      ? money((p / capacidadeMensal) * 100)
      : 0;

    const taxaEsforcoTotal = rend > 0
      ? money(((enc + p) / rend) * 100)
      : 0;

    return res.json({
      success: true,
      simulacao: {
        capital: principal,
        prestacao: p,
        jurosTotais: juros,
        totalPagar: total,
        capacidadeMensal,
        taxaEsforco,
        taxaEsforcoTotal,
        planoAmortizacao: planoAmortizacao(principal, taxa, prazo)
      }
    });
  }catch(e){
    return res.status(400).json({success:false,message:e.message||'Não foi possível simular o crédito.'});
  }
}
async function criarCredito(req,res){
  const {clienteId,tipoCredito,valorSolicitado,prazoMeses,taxaJuro,rendimento,encargos,entradaInicial}=req.body||{};
  const utilizadorId=req.user?.id;
  const tipos=['PESSOAL','AUTOMOVEL','HABITACAO','EMPRESA'];
  const valor=money(valorSolicitado), prazo=Number(prazoMeses), taxa=Number(taxaJuro), rend=money(rendimento), enc=money(encargos), entrada=money(entradaInicial);
  if(!clienteId||!tipos.includes(String(tipoCredito))) return res.status(400).json({success:false,message:'Cliente e tipo de crédito são obrigatórios.'});
  if(!(valor>0)||!Number.isFinite(valor)) return res.status(400).json({success:false,message:'Valor solicitado inválido.'});
  if(!Number.isInteger(prazo)||prazo<1||prazo>480) return res.status(400).json({success:false,message:'Prazo inválido. Use entre 1 e 480 meses.'});
  if(!Number.isFinite(taxa)||taxa<0||taxa>100) return res.status(400).json({success:false,message:'Taxa anual inválida.'});
  if(rend<0||enc<0||entrada<0||entrada>valor) return res.status(400).json({success:false,message:'Rendimento, encargos ou entrada inicial inválidos.'});
  try{
    const cliente=await pool.query("SELECT id FROM clientes WHERE id=$1 AND estado='ATIVO'",[clienteId]);
    if(!cliente.rows.length) return res.status(404).json({success:false,message:'Cliente não encontrado ou inativo.'});
    const principal=money(valor-entrada);
    const prest=calcPrestacao(principal,taxa,prazo);
    const juros=money(prest*prazo-principal);
    const capacidadeMensal = money(Math.max(0, rend - enc));

    const taxaEsforco = capacidadeMensal > 0
      ? money((prest / capacidadeMensal) * 100)
      : 0;
const r=await pool.query(`INSERT INTO creditos(
  referencia,
  cliente_id,
  tipo_credito,
  valor_solicitado,
  prazo_meses,
  taxa_anual,
  rendimento,
  encargos,
  entrada_inicial,
  prestacao,
  juros_totais,
  capital_divida,
  capacidade_endividamento,
  capacidade_mensal,
  taxa_esforco,
  utilizador_id
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
RETURNING *`, [
  ref('CRD'),
  clienteId,
  tipoCredito,
  valor,
  prazo,
  taxa,
  rend,
  enc,
  entrada,
  prest,
  juros,
  principal,
  0,
  capacidadeMensal,
  taxaEsforco,
  utilizadorId || null
]);

return res.status(201).json({
  success: true,
  credito: r.rows[0]
});
  } catch (e) {
    console.error('Erro ao criar crédito:', e);
    return res.status(400).json({
      success: false,
      message: e.message || 'Não foi possível criar o crédito.'
    });
  }
}
async function analisarRisco(req,res){
  const {clienteId,creditoId,rendimento,despesas,outrosCreditos}=req.body||{};
  const utilizadorId=req.user?.id;
  const r=money(rendimento), d=money(despesas), o=money(outrosCreditos);
  if(!clienteId||r<0||d<0||o<0) return res.status(400).json({success:false,message:'Dados de risco inválidos.'});
  if(d+o>r && r===0) return res.status(400).json({success:false,message:'Rendimento deve ser superior a zero para análise de risco.'});
  try{
    const cliente=await pool.query("SELECT id FROM clientes WHERE id=$1 AND estado='ATIVO'",[clienteId]);
    if(!cliente.rows.length) return res.status(404).json({success:false,message:'Cliente não encontrado ou inativo.'});
    if(creditoId){
      const cr=await pool.query('SELECT id,cliente_id FROM creditos WHERE id=$1',[creditoId]);
      if(!cr.rows.length) return res.status(404).json({success:false,message:'Crédito não encontrado.'});
      if(String(cr.rows[0].cliente_id)!==String(clienteId)) return res.status(409).json({success:false,message:'O crédito indicado não pertence ao cliente.'});
    }
    const cap=money(r-d-o), taxa=r?money((d+o)/r*100):100;
    let decisao='RECUSAR',score=30;
    if(r>0&&taxa<=35){decisao='APROVAR';score=90;} else if(r>0&&taxa<=50){decisao='APROVAR_COM_CONDICOES';score=65;}
    const justificacao=decisao==='APROVAR'?'Capacidade financeira dentro do limite definido para a simulação.':decisao==='APROVAR_COM_CONDICOES'?'Taxa de esforço elevada; recomenda-se reduzir valor/prazo ou exigir condições adicionais.':'Capacidade financeira insuficiente para suportar o encargo estimado.';
    const x=await pool.query(`INSERT INTO analises_risco(credito_id,cliente_id,rendimento,despesas,outros_creditos,score,capacidade,decisao,justificacao,utilizador_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[creditoId||null,clienteId,r,d,o,score,cap,decisao,justificacao,utilizadorId||null]);
    return res.json({success:true,analise:x.rows[0]});
  }catch(e){ console.error('Erro na análise de risco:',e); return res.status(400).json({success:false,message:e.message}); }
}

async function historicoCliente(req,res){try{const r=await pool.query(`SELECT cl.numero_cliente,cl.nome_completo,c.numero_conta,m.tipo,m.valor,m.saldo_posterior,m.referencia,m.descricao,m.criado_em FROM clientes cl LEFT JOIN contas c ON c.cliente_id=cl.id LEFT JOIN movimentos m ON m.conta_id=c.id WHERE cl.id=$1 ORDER BY m.criado_em DESC NULLS LAST`,[req.params.id]);res.json({success:true,historico:r.rows});}catch(e){res.status(500).json({success:false,message:'Erro ao consultar histórico.'});}}

async function pagarServico(req,res){
 const {contaId,entidade,referenciaServico,valor,comissao=0}=req.body; const utilizadorId=req.user.id; const v=money(valor), fee=money(comissao); if(!contaId||!String(entidade||'').trim()||!String(referenciaServico||'').trim()||!Number.isFinite(v)||v<=0||!Number.isFinite(fee)||fee<0)return res.status(400).json({success:false,message:'Dados do pagamento inválidos.'}); const client=await pool.connect(); try{await client.query('BEGIN'); const q=await client.query("SELECT *, COALESCE(valor_reservado_cheques,0) AS valor_reservado_cheques, COALESCE(valor_reservado_transferencias,0) AS valor_reservado_transferencias FROM contas WHERE id=$1 AND estado='ATIVA' FOR UPDATE",[contaId]); if(!q.rows.length)throw new Error('Conta não encontrada ou inativa.'); const c=q.rows[0], total=money(v+fee), anterior=Number(c.saldo), reservado=Number(c.valor_reservado_cheques||0)+Number(c.valor_reservado_transferencias||0), posterior=money(anterior-total); if(posterior<reservado)throw new Error('Saldo disponível insuficiente devido a valores reservados para cheques ou transferências agendadas.'); await client.query('UPDATE contas SET saldo=$1 WHERE id=$2',[posterior,contaId]); const mov=await client.query(`INSERT INTO movimentos(conta_id,tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,utilizador_id) VALUES($1,'PAGAMENTO_SERVICO',$2,$3,$4,$5,$6,$7) RETURNING *`,[contaId,total,anterior,posterior,ref('MOV'),`Pagamento ${entidade} — ${referenciaServico}`,utilizadorId||null]); const p=await client.query(`INSERT INTO pagamentos_servicos(conta_id,entidade,referencia_servico,valor,comissao,utilizador_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[contaId,entidade,referenciaServico,v,fee,utilizadorId||null]); await client.query('COMMIT'); res.status(201).json({success:true,pagamento:p.rows[0],movimento:mov.rows[0],saldo:posterior}); }catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}
}

async function fecharCaixa(req,res){
  const {saldoFisico,observacoes}=req.body;
  const utilizadorId=req.user.id;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const sistema=await obterSaldoCaixa(client);
    const fisico=money(saldoFisico);
    const dif=money(fisico-sistema);
    const estado=Math.abs(dif)<0.01?'CONFERIDO':'DIVERGENTE';
    const r=await client.query(`
      INSERT INTO caixa_fechos(saldo_sistema,saldo_fisico,diferenca,observacoes,estado,utilizador_id)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *
    `,[sistema,fisico,dif,observacoes||null,estado,utilizadorId||null]);
    await client.query('COMMIT');
    res.json({success:true,fecho:r.rows[0]});
  }catch(e){
    await client.query('ROLLBACK');
    res.status(500).json({success:false,message:'Erro no fecho de caixa.'});
  }finally{client.release();}
}

/* =========================================================
 * COMPROVATIVOS — emissão e consulta
 * ========================================================= */

async function registarComprovativo(req, res) {
  const {
    tipoDocumento = 'MOVIMENTO',
    titulo = 'Comprovativo de operação',
    movimentoId = null,
    transferenciaId = null,
    caixaOperacaoId = null,
    clienteId = null,
    contaId = null,
    dados = {}
  } = req.body || {};
  const utilizadorId = req.user.id;

  if (!titulo || typeof dados !== 'object' || Array.isArray(dados)) {
    return res.status(400).json({ success:false, message:'Dados do comprovativo inválidos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (movimentoId) {
      const q = await client.query(`
        SELECT m.conta_id, c.cliente_id
        FROM movimentos m
        JOIN contas c ON c.id=m.conta_id
        WHERE m.id=$1
      `, [movimentoId]);
      if (!q.rows.length) throw new Error('Movimento não encontrado.');
      if (contaId && String(q.rows[0].conta_id) !== String(contaId)) throw new Error('O movimento não pertence à conta indicada.');
      if (clienteId && String(q.rows[0].cliente_id) !== String(clienteId)) throw new Error('O movimento não pertence ao cliente indicado.');
    }

    if (transferenciaId) {
      const q = await client.query(`
        SELECT t.conta_origem_id, t.conta_destino_id,
               co.cliente_id AS origem_cliente,
               cd.cliente_id AS destino_cliente
        FROM transferencias t
        JOIN contas co ON co.id=t.conta_origem_id
        LEFT JOIN contas cd ON cd.id=t.conta_destino_id
        WHERE t.id=$1
      `, [transferenciaId]);
      if (!q.rows.length) throw new Error('Transferência não encontrada.');
      const t=q.rows[0];
      if (contaId && String(t.conta_origem_id)!==String(contaId) && String(t.conta_destino_id||'')!==String(contaId)) throw new Error('A transferência não pertence à conta indicada.');
      if (clienteId && String(t.origem_cliente)!==String(clienteId) && String(t.destino_cliente||'')!==String(clienteId)) throw new Error('A transferência não pertence ao cliente indicado.');
    }

    if (caixaOperacaoId) {
      const q = await client.query(`
        SELECT cx.conta_id, c.cliente_id
        FROM caixa_operacoes cx
        LEFT JOIN contas c ON c.id=cx.conta_id
        WHERE cx.id=$1
      `, [caixaOperacaoId]);
      if (!q.rows.length) throw new Error('Operação de caixa não encontrada.');
      if (contaId && q.rows[0].conta_id && String(q.rows[0].conta_id)!==String(contaId)) throw new Error('A operação de caixa não pertence à conta indicada.');
      if (clienteId && q.rows[0].cliente_id && String(q.rows[0].cliente_id)!==String(clienteId)) throw new Error('A operação de caixa não pertence ao cliente indicado.');
    }

    if (contaId) {
      const q=await client.query('SELECT cliente_id FROM contas WHERE id=$1',[contaId]);
      if (!q.rows.length) throw new Error('Conta indicada não encontrada.');
      if (clienteId && String(q.rows[0].cliente_id)!==String(clienteId)) throw new Error('A conta não pertence ao cliente indicado.');
    }

    if (clienteId) {
      const q=await client.query('SELECT 1 FROM clientes WHERE id=$1',[clienteId]);
      if (!q.rows.length) throw new Error('Cliente indicado não encontrado.');
    }

    const numero = ref('CMP');
    const r = await client.query(`
      INSERT INTO comprovativos
        (numero_documento,tipo_documento,movimento_id,transferencia_id,caixa_operacao_id,cliente_id,conta_id,titulo,dados,utilizador_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      numero, tipoDocumento, movimentoId, transferenciaId, caixaOperacaoId,
      clienteId, contaId, titulo, JSON.stringify(dados), utilizadorId || null
    ]);

    await client.query(`
      INSERT INTO auditoria_operacoes(utilizador_id,modulo,acao,referencia,detalhes)
      VALUES($1,'COMPROVATIVOS','EMISSAO',$2,$3)
    `, [utilizadorId || null, numero, JSON.stringify({ tipoDocumento, movimentoId, transferenciaId, caixaOperacaoId })]);

    await client.query('COMMIT');
    return res.status(201).json({ success:true, comprovativo:r.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Erro ao registar comprovativo:', e);
    return res.status(400).json({ success:false, message:e.message || 'Não foi possível registar o comprovativo.' });
  } finally {
    client.release();
  }
}

async function listarComprovativos(req, res) {
  try {
    const r = await pool.query(`
      SELECT cp.*, cl.nome_completo AS cliente_nome, c.numero_conta,
             u.nome_exibicao AS operador
      FROM comprovativos cp
      LEFT JOIN clientes cl ON cl.id=cp.cliente_id
      LEFT JOIN contas c ON c.id=cp.conta_id
      LEFT JOIN usuarios u ON u.id=cp.utilizador_id
      ORDER BY cp.criado_em DESC
      LIMIT 500
    `);
    return res.json({ success:true, comprovativos:r.rows });
  } catch (e) {
    console.error('Erro ao consultar comprovativos:', e);
    return res.status(500).json({ success:false, message:'Erro ao consultar comprovativos.' });
  }
}

async function obterComprovativo(req, res) {
  try {
    const r = await pool.query(`
      SELECT cp.*, cl.nome_completo AS cliente_nome, c.numero_conta,
             u.nome_exibicao AS operador
      FROM comprovativos cp
      LEFT JOIN clientes cl ON cl.id=cp.cliente_id
      LEFT JOIN contas c ON c.id=cp.conta_id
      LEFT JOIN usuarios u ON u.id=cp.utilizador_id
      WHERE cp.id=$1
    `, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({success:false,message:'Comprovativo não encontrado.'});
    return res.json({success:true, comprovativo:r.rows[0]});
  } catch (e) {
    console.error('Erro ao obter comprovativo:', e);
    return res.status(500).json({success:false,message:'Erro ao consultar comprovativo.'});
  }
}

function planoAmortizacao(principal, taxa, meses){ const n=Number(meses), r=Number(taxa)/100/12, prest=calcPrestacao(principal,taxa,n); let saldo=Number(principal), rows=[]; for(let i=1;i<=n;i++){const juros=money(saldo*r), capital=money(Math.min(saldo,prest-juros)); saldo=money(saldo-capital); rows.push({mes:i,prestacao:prest,juros,capital,saldo});} return rows; }


/* =========================================================
 * CONSULTA DE CONTA / HISTÓRICO DA CONTA
 * ========================================================= */

async function obterConta(req, res) {
  const { id } = req.params;
  try {
    const conta = await pool.query(`
      SELECT c.*, cl.nome_completo AS cliente_nome, cl.numero_cliente,
             cl.nif AS cliente_nif, cl.telefone AS cliente_telefone,
             cl.estado AS cliente_estado
      FROM contas c
      JOIN clientes cl ON cl.id = c.cliente_id
      WHERE c.id = $1
    `, [id]);
    if (!conta.rows.length) return res.status(404).json({success:false,message:'Conta não encontrada.'});

    const docs = await pool.query(`
      SELECT id, tipo_documento, numero_documento, estado, observado_em
      FROM documentos_cliente WHERE cliente_id=$1 ORDER BY observado_em DESC
    `, [conta.rows[0].cliente_id]);

    return res.json({success:true, conta:conta.rows[0], documentos:docs.rows});
  } catch (e) {
    console.error('Erro ao obter conta:', e);
    return res.status(500).json({success:false,message:'Erro ao consultar a conta.'});
  }
}

async function historicoConta(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT m.*, c.numero_conta, c.cliente_id, cl.nome_completo AS cliente_nome
      FROM movimentos m
      JOIN contas c ON c.id=m.conta_id
      JOIN clientes cl ON cl.id=c.cliente_id
      WHERE m.conta_id=$1
      ORDER BY m.criado_em DESC, m.id DESC
      LIMIT 500
    `, [id]);
    return res.json({success:true,movimentos:r.rows});
  } catch (e) {
    console.error('Erro no histórico da conta:', e);
    return res.status(500).json({success:false,message:'Erro ao consultar o histórico da conta.'});
  }
}

async function resumoCaixa(req, res) {
  try {
    const saldo = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN tipo='DEPOSITO' THEN valor WHEN tipo='LEVANTAMENTO' THEN -valor ELSE 0 END),0) saldo
      FROM caixa_operacoes
    `);
    const hoje = await pool.query(`
      SELECT COUNT(*)::int AS operacoes,
             COALESCE(SUM(CASE WHEN tipo='DEPOSITO' THEN valor ELSE 0 END),0) AS entradas,
             COALESCE(SUM(CASE WHEN tipo='LEVANTAMENTO' THEN valor ELSE 0 END),0) AS saidas
      FROM caixa_operacoes WHERE criado_em::date=CURRENT_DATE
    `);
    const ultimoFecho = await pool.query(`SELECT * FROM caixa_fechos ORDER BY criado_em DESC LIMIT 1`);
    return res.json({success:true,resumo:{saldo:Number(saldo.rows[0].saldo),...Object.fromEntries(Object.entries(hoje.rows[0]).map(([k,v])=>[k,Number(v)]))},ultimoFecho:ultimoFecho.rows[0]||null});
  } catch(e) {
    console.error('Erro no resumo de caixa:',e);
    return res.status(500).json({success:false,message:'Erro ao consultar o resumo de caixa.'});
  }
}

async function historicoCaixa(req,res){
  try{
    const r=await pool.query(`
      SELECT cx.*, c.numero_conta, cl.nome_completo AS cliente_nome, u.nome_exibicao AS operador
      FROM caixa_operacoes cx
      LEFT JOIN contas c ON c.id=cx.conta_id
      LEFT JOIN clientes cl ON cl.id=c.cliente_id
      LEFT JOIN usuarios u ON u.id=cx.utilizador_id
      ORDER BY cx.criado_em DESC LIMIT 300
    `);
    return res.json({success:true,operacoes:r.rows});
  }catch(e){
    console.error('Erro no histórico de caixa:',e);
    return res.status(500).json({success:false,message:'Erro ao consultar o histórico de caixa.'});
  }
}


/**
 * Executa transferências agendadas vencidas. A reserva criada no agendamento
 * impede que outros movimentos consumam o valor comprometido.
 */
async function executarTransferenciasAgendadas() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const due = await client.query(`
      SELECT *
      FROM transferencias
      WHERE estado = 'AGENDADA'
        AND data_agendada <= CURRENT_TIMESTAMP
      ORDER BY data_agendada ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 50
    `);

    let processadas = 0;

    for (const t of due.rows) {
      const total = money(Number(t.valor) + Number(t.comissao));

      // Bloqueia origem e destino na mesma ordem determinística usada
      // pelas transferências imediatas. Isso reduz risco de deadlock.
      const ids = t.conta_destino_id
        ? [t.conta_origem_id, t.conta_destino_id]
        : [t.conta_origem_id];

      const contasResult = await client.query(`
        SELECT *,
               COALESCE(valor_reservado_cheques, 0) AS valor_reservado_cheques,
               COALESCE(valor_reservado_transferencias, 0) AS valor_reservado_transferencias
        FROM contas
        WHERE id = ANY($1::uuid[])
          AND estado = 'ATIVA'
        ORDER BY id
        FOR UPDATE
      `, [ids]);

      const origem = contasResult.rows.find(
        row => String(row.id) === String(t.conta_origem_id)
      );

      if (!origem) {
        await client.query(`
          UPDATE transferencias
          SET estado = 'FALHOU',
              descricao = COALESCE(descricao, '') ||
                          ' | Conta de origem indisponível.'
          WHERE id = $1
        `, [t.id]);
        processadas++;
        continue;
      }

      const reservadoTransferencias =
        Number(origem.valor_reservado_transferencias || 0);

      const reservadoCheques =
        Number(origem.valor_reservado_cheques || 0);

      // O valor da própria transferência já está dentro da reserva.
      // Portanto, para executá-la, a disponibilidade necessária é
      // saldo - outras reservas, e não saldo - reserva + total.
      const disponivelSemEstaReserva = money(
        Number(origem.saldo) -
        reservadoCheques -
        Math.max(0, reservadoTransferencias - total)
      );

      if (disponivelSemEstaReserva < total) {
        await client.query(`
          UPDATE contas
          SET valor_reservado_transferencias =
              GREATEST(
                0,
                COALESCE(valor_reservado_transferencias, 0) - $1
              )
          WHERE id = $2
        `, [total, origem.id]);

        await client.query(`
          UPDATE transferencias
          SET estado = 'FALHOU',
              descricao = COALESCE(descricao, '') ||
                          ' | Saldo insuficiente no processamento.'
          WHERE id = $1
        `, [t.id]);

        processadas++;
        continue;
      }

      let destino = null;

      if (t.conta_destino_id) {
        destino = contasResult.rows.find(
          row => String(row.id) === String(t.conta_destino_id)
        );

        if (!destino) {
          await client.query(`
            UPDATE contas
            SET valor_reservado_transferencias =
                GREATEST(
                  0,
                  COALESCE(valor_reservado_transferencias, 0) - $1
                )
            WHERE id = $2
          `, [total, origem.id]);

          await client.query(`
            UPDATE transferencias
            SET estado = 'FALHOU',
                descricao = COALESCE(descricao, '') ||
                            ' | Conta de destino indisponível.'
            WHERE id = $1
          `, [t.id]);

          processadas++;
          continue;
        }
      }

      const novoOrig = money(
        Number(origem.saldo) - total
      );

      await client.query(`
        UPDATE contas
        SET saldo = $1,
            valor_reservado_transferencias =
              GREATEST(
                0,
                COALESCE(valor_reservado_transferencias, 0) - $2
              )
        WHERE id = $3
      `, [novoOrig, total, origem.id]);

      await client.query(`
        INSERT INTO movimentos(
          conta_id,
          tipo,
          valor,
          saldo_anterior,
          saldo_posterior,
          referencia,
          descricao,
          utilizador_id
        )
        VALUES(
          $1,
          'TRANSFERENCIA_ENVIADA',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `, [
        origem.id,
        total,
        origem.saldo,
        novoOrig,
        ref('MOV'),
        t.descricao || 'Transferência agendada',
        t.utilizador_id || null
      ]);

      if (destino) {
        const novoDest = money(
          Number(destino.saldo) + Number(t.valor)
        );

        await client.query(
          'UPDATE contas SET saldo = $1 WHERE id = $2',
          [novoDest, destino.id]
        );

        await client.query(`
          INSERT INTO movimentos(
            conta_id,
            tipo,
            valor,
            saldo_anterior,
            saldo_posterior,
            referencia,
            descricao,
            utilizador_id
          )
          VALUES(
            $1,
            'TRANSFERENCIA_RECEBIDA',
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
        `, [
          destino.id,
          t.valor,
          destino.saldo,
          novoDest,
          ref('MOV'),
          t.descricao || 'Transferência agendada recebida',
          t.utilizador_id || null
        ]);
      }

      await client.query(
        "UPDATE transferencias SET estado = 'CONCLUIDA' WHERE id = $1",
        [t.id]
      );

      processadas++;
    }

    await client.query('COMMIT');
    return processadas;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(
      '[PRISMA] Erro no processamento de transferências agendadas:',
      e
    );
    throw e;
  } finally {
    client.release();
  }
}
/* =========================================================
 * RECONCILIAÇÃO BANCÁRIA
 * ========================================================= */

const TIPOS_ENTRADA_RECONCILIACAO = [
  'DEPOSITO',
  'DEPOSITO_INICIAL',
  'TRANSFERENCIA_RECEBIDA'
];

const TIPOS_SAIDA_RECONCILIACAO = [
  'LEVANTAMENTO',
  'TRANSFERENCIA_ENVIADA',
  'PAGAMENTO_SERVICO'
];

async function calcularDadosReconciliacao(client, contaId, periodoInicio, periodoFim) {
  const saldoInicialQuery = await client.query(`
    SELECT saldo_posterior
    FROM movimentos
    WHERE conta_id=$1
      AND criado_em < $2::date
    ORDER BY criado_em DESC, id DESC
    LIMIT 1
  `, [contaId, periodoInicio]);

  const saldoInicial = saldoInicialQuery.rows.length
    ? money(saldoInicialQuery.rows[0].saldo_posterior)
    : 0;

  const movimentosQuery = await client.query(`
    SELECT
      m.id,
      m.conta_id,
      m.tipo,
      m.valor,
      m.saldo_anterior,
      m.saldo_posterior,
      m.referencia,
      m.descricao,
      m.criado_em,
      c.numero_conta,
      cl.nome_completo AS cliente_nome
    FROM movimentos m
    JOIN contas c ON c.id=m.conta_id
    JOIN clientes cl ON cl.id=c.cliente_id
    WHERE m.conta_id=$1
      AND m.criado_em >= $2::date
      AND m.criado_em < ($3::date + INTERVAL '1 day')
      AND m.tipo = ANY($4::text[])
    ORDER BY m.criado_em ASC, m.id ASC
  `, [
    contaId,
    periodoInicio,
    periodoFim,
    [...TIPOS_ENTRADA_RECONCILIACAO, ...TIPOS_SAIDA_RECONCILIACAO]
  ]);

  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const movimento of movimentosQuery.rows) {
    const valor = money(movimento.valor);

    if (TIPOS_ENTRADA_RECONCILIACAO.includes(movimento.tipo)) {
      totalEntradas = money(totalEntradas + valor);
    }

    if (TIPOS_SAIDA_RECONCILIACAO.includes(movimento.tipo)) {
      totalSaidas = money(totalSaidas + valor);
    }
  }

  const saldoSistema = money(
    saldoInicial + totalEntradas - totalSaidas
  );

  return {
    saldoInicial,
    totalEntradas,
    totalSaidas,
    saldoSistema,
    movimentos: movimentosQuery.rows
  };
}


async function listarReconciliacoes(req, res) {
  try {
    const {
      contaId = '',
      estado = ''
    } = req.query || {};

    const params = [];
    const where = [];

    if (contaId) {
      params.push(contaId);
      where.push(`r.conta_id=$${params.length}`);
    }

    if (estado) {
      params.push(estado);
      where.push(`r.estado=$${params.length}`);
    }

    const r = await pool.query(`
      SELECT
        r.*,
        c.numero_conta,
        cl.nome_completo AS cliente_nome,
        u.nome_exibicao AS operador
      FROM reconciliacoes r
      JOIN contas c ON c.id=r.conta_id
      JOIN clientes cl ON cl.id=c.cliente_id
      LEFT JOIN usuarios u ON u.id=r.utilizador_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.criado_em DESC
      LIMIT 300
    `, params);

    return res.json({
      success: true,
      reconciliacoes: r.rows
    });
  } catch (e) {
    console.error('Erro ao consultar reconciliações:', e);

    return res.status(500).json({
      success: false,
      message: 'Erro ao consultar reconciliações.'
    });
  }
}


async function obterReconciliacao(req, res) {
  const { id } = req.params;

  try {
    const r = await pool.query(`
      SELECT
        r.*,
        c.numero_conta,
        cl.nome_completo AS cliente_nome,
        cl.numero_cliente,
        u.nome_exibicao AS operador
      FROM reconciliacoes r
      JOIN contas c ON c.id=r.conta_id
      JOIN clientes cl ON cl.id=c.cliente_id
      LEFT JOIN usuarios u ON u.id=r.utilizador_id
      WHERE r.id=$1
    `, [id]);

    if (!r.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Reconciliação não encontrada.'
      });
    }

    const movimentos = await pool.query(`
      SELECT
        rm.*,
        m.tipo,
        m.referencia,
        m.descricao,
        m.criado_em,
        m.saldo_anterior,
        m.saldo_posterior
      FROM reconciliacao_movimentos rm
      JOIN movimentos m ON m.id=rm.movimento_id
      WHERE rm.reconciliacao_id=$1
      ORDER BY m.criado_em ASC, m.id ASC
    `, [id]);

    return res.json({
      success: true,
      reconciliacao: r.rows[0],
      movimentos: movimentos.rows
    });
  } catch (e) {
    console.error('Erro ao obter reconciliação:', e);

    return res.status(500).json({
      success: false,
      message: 'Erro ao consultar a reconciliação.'
    });
  }
}


async function criarReconciliacao(req, res) {
  const {
    contaId,
    periodoInicio,
    periodoFim,
    saldoExtrato = null,
    observacoes = null
  } = req.body || {};

  const utilizadorId = req.user?.id || null;

  if (!utilizadorId) {
    return res.status(401).json({
      success: false,
      message: 'Operador autenticado não identificado.'
    });
  }

  if (!contaId || !periodoInicio || !periodoFim) {
    return res.status(400).json({
      success: false,
      message: 'Conta e período da reconciliação são obrigatórios.'
    });
  }

  if (periodoInicio > periodoFim) {
    return res.status(400).json({
      success: false,
      message: 'A data inicial não pode ser posterior à data final.'
    });
  }

  let extrato = null;

  if (
    saldoExtrato !== null &&
    saldoExtrato !== '' &&
    (!Number.isFinite(Number(saldoExtrato)) || Number(saldoExtrato) < 0)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Saldo do extrato inválido.'
    });
  }

  if (saldoExtrato !== null && saldoExtrato !== '') {
    extrato = money(saldoExtrato);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const contaQuery = await client.query(`
      SELECT
        id,
        numero_conta,
        cliente_id,
        estado
      FROM contas
      WHERE id=$1
      FOR SHARE
    `, [contaId]);

    if (!contaQuery.rows.length) {
      throw new Error('Conta não encontrada.');
    }

    const conta = contaQuery.rows[0];

    if (conta.estado !== 'ATIVA') {
      throw new Error('A conta selecionada não está ativa.');
    }

    const dados = await calcularDadosReconciliacao(
      client,
      contaId,
      periodoInicio,
      periodoFim
    );

    const diferenca = extrato === null
      ? 0
      : money(extrato - dados.saldoSistema);

    const estado = extrato === null
      ? 'PENDENTE'
      : Math.abs(diferenca) < 0.01
        ? 'RECONCILIADO'
        : 'COM_DIFERENCA';

    const referencia = ref('REC');

    const reconciliacao = await client.query(`
      INSERT INTO reconciliacoes(
        referencia,
        conta_id,
        periodo_inicio,
        periodo_fim,
        saldo_inicial,
        total_entradas,
        total_saidas,
        saldo_sistema,
        saldo_extrato,
        diferenca,
        estado,
        observacoes,
        utilizador_id,
        reconciliado_em
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        CASE
          WHEN $11='RECONCILIADO' THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      )
      RETURNING *
    `, [
      referencia,
      contaId,
      periodoInicio,
      periodoFim,
      dados.saldoInicial,
      dados.totalEntradas,
      dados.totalSaidas,
      dados.saldoSistema,
      extrato,
      diferenca,
      estado,
      observacoes || null,
      utilizadorId
    ]);

    const recId = reconciliacao.rows[0].id;

    for (const movimento of dados.movimentos) {
      await client.query(`
        INSERT INTO reconciliacao_movimentos(
          reconciliacao_id,
          movimento_id,
          valor_sistema,
          valor_extrato,
          diferenca,
          estado
        )
        VALUES($1,$2,$3,NULL,0,'PENDENTE')
      `, [
        recId,
        movimento.id,
        money(movimento.valor)
      ]);
    }

    await client.query(`
      INSERT INTO auditoria_operacoes(
        utilizador_id,
        modulo,
        acao,
        referencia,
        detalhes
      )
      VALUES($1,'RECONCILIACAO','CRIACAO',$2,$3)
    `, [
      utilizadorId,
      referencia,
      JSON.stringify({
        contaId,
        periodoInicio,
        periodoFim,
        saldoExtrato: extrato,
        saldoSistema: dados.saldoSistema,
        diferenca
      })
    ]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Reconciliação criada com sucesso.',
      reconciliacao: reconciliacao.rows[0],
      movimentos: dados.movimentos
    });

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('Erro ao criar reconciliação:', e);

    return res.status(400).json({
      success: false,
      message: e.message || 'Não foi possível criar a reconciliação.'
    });
  } finally {
    client.release();
  }
}


async function finalizarReconciliacao(req, res) {
  const { id } = req.params;
  const {
    saldoExtrato,
    observacoes = null
  } = req.body || {};

  const utilizadorId = req.user?.id || null;

  if (!utilizadorId) {
    return res.status(401).json({
      success: false,
      message: 'Operador autenticado não identificado.'
    });
  }

  if (
    saldoExtrato === undefined ||
    saldoExtrato === null ||
    saldoExtrato === '' ||
    !Number.isFinite(Number(saldoExtrato)) ||
    Number(saldoExtrato) < 0
  ) {
    return res.status(400).json({
      success: false,
      message: 'Informe um saldo de extrato válido.'
    });
  }

  const extrato = money(saldoExtrato);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const recQuery = await client.query(`
      SELECT *
      FROM reconciliacoes
      WHERE id=$1
      FOR UPDATE
    `, [id]);

    if (!recQuery.rows.length) {
      throw new Error('Reconciliação não encontrada.');
    }

    const rec = recQuery.rows[0];

    if (rec.estado === 'RECONCILIADO') {
      throw new Error('Esta reconciliação já está finalizada como reconciliada.');
    }

    const dados = await calcularDadosReconciliacao(
      client,
      rec.conta_id,
      rec.periodo_inicio,
      rec.periodo_fim
    );

    const diferenca = money(extrato - dados.saldoSistema);

    const estado = Math.abs(diferenca) < 0.01
      ? 'RECONCILIADO'
      : 'COM_DIFERENCA';

    const atualizada = await client.query(`
      UPDATE reconciliacoes
      SET
        saldo_inicial=$1,
        total_entradas=$2,
        total_saidas=$3,
        saldo_sistema=$4,
        saldo_extrato=$5,
        diferenca=$6,
        estado=$7,
        observacoes=COALESCE($8, observacoes),
        reconciliado_em=CASE
          WHEN $7='RECONCILIADO' THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      WHERE id=$9
      RETURNING *
    `, [
      dados.saldoInicial,
      dados.totalEntradas,
      dados.totalSaidas,
      dados.saldoSistema,
      extrato,
      diferenca,
      estado,
      observacoes,
      id
    ]);

    await client.query(`
      INSERT INTO auditoria_operacoes(
        utilizador_id,
        modulo,
        acao,
        referencia,
        detalhes
      )
      VALUES($1,'RECONCILIACAO','FINALIZACAO',$2,$3)
    `, [
      utilizadorId,
      rec.referencia,
      JSON.stringify({
        saldoExtrato: extrato,
        saldoSistema: dados.saldoSistema,
        diferenca,
        estado
      })
    ]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: estado === 'RECONCILIADO'
        ? 'Reconciliação concluída sem diferenças.'
        : 'Reconciliação concluída com diferença.',
      reconciliacao: atualizada.rows[0]
    });

  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('Erro ao finalizar reconciliação:', e);

    return res.status(400).json({
      success: false,
      message: e.message || 'Não foi possível finalizar a reconciliação.'
    });
  } finally {
    client.release();
  }
}

module.exports={
  executarTransferenciasAgendadas,
  listarContas,
  abrirConta,
  obterConta,
  historicoConta,
  listarMovimentos,
  operacaoCaixa,
  transferir,
  simularCredito,
  criarCredito,
  analisarRisco,
  historicoCliente,
  pagarServico,
  fecharCaixa,
  resumoCaixa,
  historicoCaixa,
  registarComprovativo,
  listarComprovativos,
  obterComprovativo,
  planoAmortizacao,
  listarReconciliacoes,
  obterReconciliacao,
  criarReconciliacao,
  finalizarReconciliacao
};