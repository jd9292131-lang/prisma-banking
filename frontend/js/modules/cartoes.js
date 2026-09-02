window.PRISMA_MODULES.cartoes=async function(utilizador){
  if(!window.PRISMA_MODULES.permitido(utilizador,'CARTOES_OPERAR')) return mostrarAvisoModulo('Sem permissão','Não possui acesso aos cartões.');
  const m=window.PRISMA_MODULES.shell('Cartões','PRISMA / OPERAÇÕES / CARTÕES',`
    <div class="page-toolbar"><div><span class="welcome-label">MEIOS DE PAGAMENTO</span><h2>Cartões</h2><p>Emita, consulte e bloqueie cartões simulados.</p></div><button class="primary-action" id="novoCartao">+ Emitir cartão</button></div>
    <section class="dashboard-panel"><div id="cartoesLista" class="table-container">A carregar...</div></section>`,utilizador);
  async function carregar(){
    const d=await window.PRISMA_MODULES.api('/api/cartoes');
    const rows=d.cartoes.map(c=>`<tr><td>${window.PRISMA_MODULES.esc(c.numero_cartao)}</td><td>${window.PRISMA_MODULES.esc(c.nome_completo)}</td><td>${window.PRISMA_MODULES.esc(c.numero_conta)}</td><td>${window.PRISMA_MODULES.esc(c.tipo)}</td><td>${window.PRISMA_MODULES.esc(c.estado)}</td><td>${window.PRISMA_MODULES.date(c.validade)}</td><td><button class="secondary-action" data-card="${c.id}" data-state="${c.estado==='ATIVO'?'BLOQUEADO':'ATIVO'}">${c.estado==='ATIVO'?'Bloquear':'Ativar'}</button></td></tr>`);
    document.getElementById('cartoesLista').innerHTML=window.PRISMA_MODULES.table(['Cartão','Cliente','Conta','Tipo','Estado','Validade','Ação'],rows);
    document.querySelectorAll('[data-card]').forEach(b=>b.onclick=async()=>{await window.PRISMA_MODULES.api('/api/cartoes/'+b.dataset.card+'/estado',{method:'PATCH',body:JSON.stringify({estado:b.dataset.state})});carregar();});
  }
  document.getElementById('novoCartao').onclick=async()=>{
    const clientes=await window.PRISMA_MODULES.api('/api/clientes'); const contas=await window.PRISMA_MODULES.api('/api/operacoes/contas');
    const c=clientes.clientes[0], a=contas.contas.find(x=>x.cliente_id===c?.id)||contas.contas[0];
    if(!c||!a) return alert('Crie primeiro um cliente e uma conta.');
    const validade=prompt('Validade do cartão (AAAA-MM-DD):','2030-12-31'); if(!validade)return;
    await window.PRISMA_MODULES.api('/api/cartoes',{method:'POST',body:JSON.stringify({clienteId:c.id,contaId:a.id,validade})}); carregar();
  };
  await carregar();
};
