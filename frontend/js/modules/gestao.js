window.PRISMA_MODULES.utilizadores=async function(utilizador){
 if(!window.PRISMA_MODULES.permitido(utilizador,'USUARIOS_GERIR'))return mostrarAvisoModulo('Sem permissão','Sem acesso aos utilizadores.');
 const d=await window.PRISMA_MODULES.api('/api/gestao/utilizadores');
 window.PRISMA_MODULES.shell('Utilizadores','PRISMA / GESTÃO / UTILIZADORES',`<section class="dashboard-panel"><div id="users"></div></section>`,utilizador);
 document.getElementById('users').innerHTML=window.PRISMA_MODULES.table(['Operador','Nome','Perfil','Estado','Último login','Ação'],d.utilizadores.map(u=>`<tr><td>${window.PRISMA_MODULES.esc(u.codigo_operador)}</td><td>${window.PRISMA_MODULES.esc(u.nome_exibicao)}</td><td>${u.perfil}</td><td>${u.ativo?'Ativo':'Inativo'}</td><td>${window.PRISMA_MODULES.date(u.ultimo_login)}</td><td><button class="secondary-action" data-user="${u.id}" data-active="${!u.ativo}">${u.ativo?'Desativar':'Ativar'}</button></td></tr>`));
 document.querySelectorAll('[data-user]').forEach(b=>b.onclick=async()=>{await window.PRISMA_MODULES.api('/api/gestao/utilizadores/'+b.dataset.user,{method:'PATCH',body:JSON.stringify({ativo:b.dataset.active==='true'})});window.PRISMA_MODULES.utilizadores(utilizador);});
};
window.PRISMA_MODULES.auditoria=async function(utilizador){
 if(!window.PRISMA_MODULES.permitido(utilizador,'AUDITORIA_VISUALIZAR'))return mostrarAvisoModulo('Sem permissão','Sem acesso à auditoria.');
 const d=await window.PRISMA_MODULES.api('/api/gestao/auditoria?limite=150');
 window.PRISMA_MODULES.shell('Auditoria','PRISMA / GESTÃO / AUDITORIA',`<section class="dashboard-panel"><div id="audit"></div></section>`,utilizador);
 document.getElementById('audit').innerHTML=window.PRISMA_MODULES.table(['Data','Operador','Módulo','Ação','Referência','Detalhes'],d.registos.map(a=>`<tr><td>${window.PRISMA_MODULES.date(a.criado_em)}</td><td>${window.PRISMA_MODULES.esc(a.codigo_operador||'—')}</td><td>${window.PRISMA_MODULES.esc(a.modulo)}</td><td>${window.PRISMA_MODULES.esc(a.acao)}</td><td>${window.PRISMA_MODULES.esc(a.referencia||'—')}</td><td><code>${window.PRISMA_MODULES.esc(JSON.stringify(a.detalhes||{}))}</code></td></tr>`));
};
