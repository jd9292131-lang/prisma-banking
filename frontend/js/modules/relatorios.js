window.PRISMA_MODULES.relatorios=async function(utilizador){
 if(!window.PRISMA_MODULES.permitido(utilizador,'RELATORIOS_VISUALIZAR'))return mostrarAvisoModulo('Sem permissão','Sem acesso aos relatórios.');
 const d=await window.PRISMA_MODULES.api('/api/gestao/relatorios/resumo');const r=d.relatorio;
 window.PRISMA_MODULES.shell('Relatórios','PRISMA / GESTÃO / RELATÓRIOS',`
 <div class="page-toolbar"><div><span class="welcome-label">INDICADORES</span><h2>Relatório operacional</h2><p>Resumo do ambiente de simulação.</p></div><button type="button" class="secondary-action" id="imprimirRelatorio">Imprimir</button></div>
 <div class="dashboard-cards">${[['Clientes',r.clientes],['Contas',r.contas],['Saldo',window.PRISMA_MODULES.money(r.saldo)],['Movimentos',r.movimentos],['Transferências',r.transferencias],['Créditos',r.creditos],['Cartões',r.cartoes],['Cheques',r.cheques]].map(x=>`<article class="dashboard-card"><span>${x[0]}</span><strong>${x[1]}</strong></article>`).join('')}</div>`,utilizador);
 document.getElementById('imprimirRelatorio')?.addEventListener('click',()=>window.print());
};
