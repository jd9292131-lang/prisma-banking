const pool=require('../config/database');

async function listarExercicios(req,res){
 try{const r=await pool.query(`SELECT id,titulo,enunciado,opcoes,pontos,dificuldade,ativo,criado_em FROM exercicios WHERE ativo=true ORDER BY criado_em DESC`);
 res.json({success:true,exercicios:r.rows});}catch(e){console.error(e);res.status(500).json({success:false,message:'Não foi possível carregar os exercícios.'});}
}
async function criarExercicio(req,res){
 const {titulo,enunciado,opcoes=[],respostaCorreta,pontos=1,dificuldade='MEDIA'}=req.body;
 const utilizadorId=req.user.id;
 if(!titulo||!enunciado||!respostaCorreta)return res.status(400).json({success:false,message:'Título, enunciado e resposta correta são obrigatórios.'});
 try{const r=await pool.query(`INSERT INTO exercicios(titulo,enunciado,opcoes,resposta_correta,pontos,dificuldade,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
 [titulo,enunciado,JSON.stringify(opcoes),respostaCorreta,pontos,dificuldade,utilizadorId||null]);
 res.status(201).json({success:true,exercicio:r.rows[0]});}catch(e){console.error(e);res.status(500).json({success:false,message:'Não foi possível criar o exercício.'});}
}
async function responderExercicio(req,res){
 const {id}=req.params; const {resposta}=req.body;
 const utilizadorId=req.user.id;
 if(resposta===undefined)return res.status(400).json({success:false,message:'Utilizador e resposta são obrigatórios.'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const ex=await client.query('SELECT id,resposta_correta,pontos FROM exercicios WHERE id=$1 AND ativo=true',[id]);
  if(!ex.rows.length){await client.query('ROLLBACK');return res.status(404).json({success:false,message:'Exercício não encontrado.'});}
  const row=ex.rows[0]; const correta=String(resposta).trim().toLowerCase()===String(row.resposta_correta).trim().toLowerCase(); const pontos=correta?Number(row.pontos):0;
  const r=await client.query(`
   INSERT INTO respostas_exercicios(exercicio_id,utilizador_id,resposta,correta,pontos)
   VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(exercicio_id,utilizador_id) DO UPDATE SET resposta=EXCLUDED.resposta,correta=EXCLUDED.correta,pontos=EXCLUDED.pontos,respondido_em=CURRENT_TIMESTAMP
   RETURNING *`,[id,utilizadorId,String(resposta),correta,pontos]);
  await client.query(`INSERT INTO auditoria_operacoes(utilizador_id,modulo,acao,referencia,detalhes) VALUES($1,'FORMACAO','RESPOSTA_EXERCICIO',$2,$3)`,
   [utilizadorId,id,JSON.stringify({correta,pontos})]);
  await client.query('COMMIT');
  res.json({success:true,correta,pontos,resposta:r.rows[0]});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({success:false,message:'Não foi possível registar a resposta.'});}
 finally{client.release();}
}
async function minhasNotas(req,res){
 const utilizadorId=req.user.id;
 if(!utilizadorId)return res.status(400).json({success:false,message:'Utilizador não identificado.'});
 try{
  const r=await pool.query(`
   SELECT COUNT(*)::int AS respondidos,COALESCE(SUM(pontos),0) AS pontos,
          COALESCE(SUM(CASE WHEN correta THEN 1 ELSE 0 END),0)::int AS corretos
   FROM respostas_exercicios WHERE utilizador_id=$1`,[utilizadorId]);
  const detalhe=await pool.query(`
   SELECT e.titulo,re.resposta,re.correta,re.pontos,re.respondido_em
   FROM respostas_exercicios re JOIN exercicios e ON e.id=re.exercicio_id
   WHERE re.utilizador_id=$1 ORDER BY re.respondido_em DESC`,[utilizadorId]);
  res.json({success:true,resumo:r.rows[0],notas:detalhe.rows});
 }catch(e){res.status(500).json({success:false,message:'Não foi possível carregar as notas.'});}
}
async function notasFormandos(req,res){
 try{const r=await pool.query(`
  SELECT u.id,u.codigo_operador,u.nome_exibicao,
         COUNT(re.id)::int respondidos,COALESCE(SUM(re.pontos),0) pontos,
         COALESCE(SUM(CASE WHEN re.correta THEN 1 ELSE 0 END),0)::int corretos
  FROM usuarios u
  INNER JOIN perfis p ON p.id=u.perfil_id AND p.nome='FORMANDO'
  LEFT JOIN respostas_exercicios re ON re.utilizador_id=u.id
  GROUP BY u.id ORDER BY u.nome_exibicao`);
 res.json({success:true,notas:r.rows});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar as avaliações.'});}
}
module.exports={listarExercicios,criarExercicio,responderExercicio,minhasNotas,notasFormandos};
