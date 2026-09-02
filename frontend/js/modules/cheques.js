window.PRISMA_MODULES.cheques=async function(utilizador){
  if(!window.PRISMA_MODULES.permitido(utilizador,'CHEQUES_OPERAR')) return mostrarAvisoModulo('Sem permissão','Não possui acesso aos cheques.');
  const m=window.PRISMA_MODULES.shell('Cheques','PRISMA / OPERAÇÕES / CHEQUES',`
    <div class="page-toolbar"><div><span class="welcome-label">PAGAMENTOS</span><h2>Cheques</h2><p>Emissão e controlo de cheques simulados.</p></div><button class="primary-action" id="novoCheque">+ Emitir cheque</button></div>
    <section class="dashboard-panel"><div id="chequesLista" class="table-container">A carregar...</div></section>`,utilizador);
  async function carregar(){
    const d=await window.PRISMA_MODULES.api('/api/cheques');
    document.getElementById('chequesLista').innerHTML=window.PRISMA_MODULES.table(
      ['Número','Conta','Beneficiário','Valor','Emissão','Estado'],
      d.cheques.map(c=>`<tr><td>${window.PRISMA_MODULES.esc(c.numero_cheque)}</td><td>${window.PRISMA_MODULES.esc(c.numero_conta)}</td><td>${window.PRISMA_MODULES.esc(c.beneficiario)}</td><td>${window.PRISMA_MODULES.money(c.valor)}</td><td>${window.PRISMA_MODULES.date(c.data_emissao)}</td><td>${window.PRISMA_MODULES.esc(c.estado)}</td></tr>`)
    );
  }
  document.getElementById('novoCheque').onclick=async()=>{
    const contas=await window.PRISMA_MODULES.api('/api/operacoes/contas'); if(!contas.contas.length)return alert('Crie primeiro uma conta.');
    const conta=contas.contas[0], beneficiario=prompt('Beneficiário:'); if(!beneficiario)return;
    const valor=prompt('Valor (Kz):'); if(!(Number(valor)>0))return alert('Valor inválido.');
    await window.PRISMA_MODULES.api('/api/cheques',{method:'POST',body:JSON.stringify({contaId:conta.id,beneficiario,valor})});carregar();
  };
  await carregar();
};
