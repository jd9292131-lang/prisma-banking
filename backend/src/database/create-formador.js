require('../config/env');
const readline=require('readline');
const bcrypt=require('bcryptjs');
const pool=require('../config/database');

function ask(question){
    return new Promise(resolve=>{
        const rl=readline.createInterface({input:process.stdin,output:process.stdout});
        rl.question(question,answer=>{rl.close();resolve(answer.trim());});
    });
}

async function criarFormador(){
    const nome=await ask('Nome completo do formador: ');
    const utilizador=await ask('Nome de utilizador: ');
    const senha=await ask('Palavra-passe (mín. 6 caracteres): ');

    if(!nome||!utilizador||senha.length<6) throw new Error('Dados inválidos.');

    const perfil=await pool.query(`SELECT id FROM perfis WHERE nome='FORMADOR' LIMIT 1`);
    if(!perfil.rows.length) throw new Error('Perfil FORMADOR não configurado.');

    const hash=await bcrypt.hash(senha,12);
    const r=await pool.query(`
      INSERT INTO usuarios(codigo_operador,nome_utilizador,nome_exibicao,senha_hash,perfil_id,ativo)
      VALUES('OP-' || LPAD(nextval('operador_codigo_seq')::text,6,'0'),$1,$2,$3,$4,TRUE)
      RETURNING codigo_operador,nome_utilizador,nome_exibicao
    `,[utilizador.toLowerCase(),nome,hash,perfil.rows[0].id]);

    console.log('');
    console.log('==============================================');
    console.log('       FORMADOR CRIADO COM SUCESSO');
    console.log('==============================================');
    console.log(`CÓDIGO DO OPERADOR : ${r.rows[0].codigo_operador}`);
    console.log(`UTILIZADOR         : ${r.rows[0].nome_utilizador}`);
    console.log('----------------------------------------------');
    console.log('Use o CÓDIGO DO OPERADOR + palavra-passe para');
    console.log('iniciar sessão no PRISMA Banking.');
    console.log('==============================================');
}

criarFormador()
 .catch(e=>{console.error('Não foi possível criar o formador:',e.message);process.exitCode=1;})
 .finally(()=>pool.end());
