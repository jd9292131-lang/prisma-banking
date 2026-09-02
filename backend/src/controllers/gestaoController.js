const pool=require('../config/database');
async function listarUtilizadores(req,res){
 try{const r=await pool.query(`
  SELECT u.id,u.codigo_operador,u.nome_utilizador,u.nome_exibicao,u.ativo,u.ultimo_login,p.nome perfil
  FROM usuarios u JOIN perfis p ON p.id=u.perfil_id ORDER BY u.nome_exibicao`);
 res.json({success:true,utilizadores:r.rows});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar os utilizadores.'});}
}
async function alterarUtilizador(req,res){
 const {id}=req.params; const {ativo}=req.body;
 if(typeof ativo!=='boolean') return res.status(400).json({success:false,message:'O estado do utilizador deve ser booleano.'});
 try{
  if(String(req.user.id)===String(id) && !ativo) return res.status(409).json({success:false,message:'Não é permitido desativar o próprio operador durante a sessão.'});
  const alvo=await pool.query(`SELECT u.id,u.ativo,p.nome AS perfil FROM usuarios u JOIN perfis p ON p.id=u.perfil_id WHERE u.id=$1`,[id]);
  if(!alvo.rows.length)return res.status(404).json({success:false,message:'Utilizador não encontrado.'});
  if(!ativo && alvo.rows[0].perfil==='FORMADOR' && alvo.rows[0].ativo){
   const n=await pool.query(`SELECT COUNT(*)::int AS total FROM usuarios u JOIN perfis p ON p.id=u.perfil_id WHERE p.nome='FORMADOR' AND u.ativo=TRUE`);
   if(Number(n.rows[0].total)<=1) return res.status(409).json({success:false,message:'Não é permitido desativar o último FORMADOR ativo.'});
  }
  const r=await pool.query('UPDATE usuarios SET ativo=$1 WHERE id=$2 RETURNING id,ativo',[ativo,id]);
  res.json({success:true,utilizador:r.rows[0]});
 }catch(e){console.error(e);res.status(500).json({success:false,message:'Não foi possível alterar o utilizador.'});}
}
async function auditoria(req,res){
 const limite=Math.min(Number(req.query.limite)||100,500);
 try{const r=await pool.query(`
  SELECT a.*,u.codigo_operador,u.nome_exibicao FROM auditoria_operacoes a
  LEFT JOIN usuarios u ON u.id=a.utilizador_id
  ORDER BY a.criado_em DESC LIMIT $1`,[limite]);
 res.json({success:true,registos:r.rows});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar a auditoria.'});}
}
async function relatorio(req,res){
 try{
  const [clientes,contas,saldo,movs,transfer,creditos,cartoes,cheques]=await Promise.all([
   pool.query('SELECT COUNT(*)::int total FROM clientes'),
   pool.query('SELECT COUNT(*)::int total FROM contas'),
   pool.query('SELECT COALESCE(SUM(saldo),0) total FROM contas'),
   pool.query('SELECT COUNT(*)::int total FROM movimentos'),
   pool.query('SELECT COUNT(*)::int total FROM transferencias'),
   pool.query('SELECT COUNT(*)::int total FROM creditos'),
   pool.query('SELECT COUNT(*)::int total FROM cartoes'),
   pool.query('SELECT COUNT(*)::int total FROM cheques')
  ]);
  res.json({success:true,relatorio:{
   clientes:clientes.rows[0].total,contas:contas.rows[0].total,saldo:saldo.rows[0].total,
   movimentos:movs.rows[0].total,transferencias:transfer.rows[0].total,creditos:creditos.rows[0].total,
   cartoes:cartoes.rows[0].total,cheques:cheques.rows[0].total}});
 }catch(e){console.error(e);res.status(500).json({success:false,message:'Não foi possível gerar o relatório.'});}
}
async function reconciliacao(req,res){
 try{const r=await pool.query(`SELECT * FROM caixa_fechos ORDER BY criado_em DESC LIMIT 100`);
 res.json({success:true,fechos:r.rows});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar a reconciliação.'});}
}
module.exports={listarUtilizadores,alterarUtilizador,auditoria,relatorio,reconciliacao};
