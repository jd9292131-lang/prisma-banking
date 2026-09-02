require('../config/env');
const pool=require('../config/database');

(async()=>{
  try{
    const p=await pool.query(`SELECT nome FROM perfis ORDER BY nome`);
    console.log('Base de dados verificada. Perfis:',p.rows.map(r=>r.nome).join(', '));
    console.log('Nenhum utilizador de demonstração é criado por este script.');
    console.log('Para provisionar um FORMADOR, use: node src/database/create-formador.js');
  }catch(e){console.error(e.message);process.exitCode=1;}
  finally{await pool.end();}
})();
