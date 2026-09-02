window.PRISMA_MODULES.reconciliacao=async function(utilizador){
 if(!window.PRISMA_MODULES.permitido(utilizador,'CAIXA_RECONCILIAR'))return mostrarAvisoModulo('Sem permissão','Sem acesso à reconciliação.');
 const d=await window.PRISMA_MODULES.api('/api/gestao/reconciliacao');
 window.PRISMA_MODULES.shell('Reconciliação','PRISMA / CAIXA / RECONCILIAÇÃO',`<section class="dashboard-panel"><div class="panel-header"><div><span>CONFERÊNCIA</span><h2>Fechos de caixa</h2></div></div><div id="recon"></div></section>`,utilizador);
 document.getElementById('recon').innerHTML=window.PRISMA_MODULES.table(['Data','Saldo sistema','Saldo físico','Diferença','Estado','Observações'],d.fechos.map(f=>`<tr><td>${window.PRISMA_MODULES.date(f.data_caixa)}</td><td>${window.PRISMA_MODULES.money(f.saldo_sistema)}</td><td>${window.PRISMA_MODULES.money(f.saldo_fisico)}</td><td>${window.PRISMA_MODULES.money(f.diferenca)}</td><td>${window.PRISMA_MODULES.esc(f.estado)}</td><td>${window.PRISMA_MODULES.esc(f.observacoes||'—')}</td></tr>`));
};
