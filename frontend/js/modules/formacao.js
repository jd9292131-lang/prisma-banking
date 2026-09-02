window.PRISMA_MODULES.exercicios=async function(utilizador){
  if(!window.PRISMA_MODULES.permitido(utilizador,'EXERCICIOS_REALIZAR'))return mostrarAvisoModulo('Sem permissão','Não possui acesso aos exercícios.');
  const m=window.PRISMA_MODULES.shell('Exercícios','PRISMA / FORMAÇÃO / EXERCÍCIOS',`<section class="dashboard-panel"><div id="exerciciosLista">A carregar...</div></section>`,utilizador);
  const d=await window.PRISMA_MODULES.api('/api/formacao/exercicios');
  const box=document.getElementById('exerciciosLista');
  box.innerHTML=d.exercicios.length?d.exercicios.map((e,i)=>`<article class="dashboard-panel exercise-card"><span class="welcome-label">${window.PRISMA_MODULES.esc(e.dificuldade)}</span><h3>${window.PRISMA_MODULES.esc(e.titulo)}</h3><p>${window.PRISMA_MODULES.esc(e.enunciado)}</p><input id="resp-${e.id}" placeholder="A sua resposta"><button class="primary-action" data-ex="${e.id}">Responder</button><div id="result-${e.id}"></div></article>`).join(''):'<div class="empty-state"><strong>Sem exercícios</strong><p>O formador ainda não publicou exercícios.</p></div>';
  box.querySelectorAll('[data-ex]').forEach(b=>b.onclick=async()=>{const id=b.dataset.ex;const resposta=document.getElementById('resp-'+id).value;const r=await window.PRISMA_MODULES.api('/api/formacao/exercicios/'+id+'/responder',{method:'POST',body:JSON.stringify({resposta})});document.getElementById('result-'+id).textContent=r.correta?`✓ Correto — ${r.pontos} ponto(s)`:`✕ Incorreto — ${r.pontos} ponto(s)`;});
};
window.PRISMA_MODULES.notas=async function(utilizador){
  if(!window.PRISMA_MODULES.permitido(utilizador,'NOTAS_VISUALIZAR'))return mostrarAvisoModulo('Sem permissão','Não possui acesso às notas.');
  const d=await window.PRISMA_MODULES.api('/api/formacao/notas');
  const m=window.PRISMA_MODULES.shell('Notas','PRISMA / FORMAÇÃO / NOTAS',`<section class="dashboard-panel"><div class="dashboard-cards"><article class="dashboard-card"><span>QUESTÕES</span><strong>${d.resumo.respondidos}</strong></article><article class="dashboard-card"><span>CORRETAS</span><strong>${d.resumo.corretos}</strong></article><article class="dashboard-card"><span>PONTOS</span><strong>${window.PRISMA_MODULES.money(d.resumo.pontos).replace(' Kz','')}</strong></article></div><div id="notasTabela"></div></section>`,utilizador);
  document.getElementById('notasTabela').innerHTML=window.PRISMA_MODULES.table(['Exercício','Resposta','Resultado','Pontos','Data'],d.notas.map(n=>`<tr><td>${window.PRISMA_MODULES.esc(n.titulo)}</td><td>${window.PRISMA_MODULES.esc(n.resposta)}</td><td>${n.correta?'Correta':'Incorreta'}</td><td>${n.pontos}</td><td>${window.PRISMA_MODULES.date(n.respondido_em)}</td></tr>`));
};
window.PRISMA_MODULES['gestao-exercicios']=async function(utilizador){
  if(!window.PRISMA_MODULES.permitido(utilizador,'EXERCICIOS_GERIR'))return mostrarAvisoModulo('Sem permissão','Sem acesso à gestão pedagógica.');
  const m=window.PRISMA_MODULES.shell('Gerir exercícios','PRISMA / GESTÃO / EXERCÍCIOS',`<section class="dashboard-panel"><button class="primary-action" id="criarExercicio">+ Novo exercício</button><div id="exerciciosAdmin"></div></section>`,utilizador);
  async function load(){const d=await window.PRISMA_MODULES.api('/api/formacao/exercicios');document.getElementById('exerciciosAdmin').innerHTML=window.PRISMA_MODULES.table(['Título','Dificuldade','Pontos','Estado'],d.exercicios.map(e=>`<tr><td>${window.PRISMA_MODULES.esc(e.titulo)}</td><td>${e.dificuldade}</td><td>${e.pontos}</td><td>${e.ativo?'Ativo':'Inativo'}</td></tr>`));}
  document.getElementById('criarExercicio').onclick=async()=>{const titulo=prompt('Título:');const enunciado=prompt('Enunciado:');const respostaCorreta=prompt('Resposta correta:');if(!titulo||!enunciado||!respostaCorreta)return;await window.PRISMA_MODULES.api('/api/formacao/exercicios',{method:'POST',body:JSON.stringify({titulo,enunciado,respostaCorreta})});load();};await load();
};
window.PRISMA_MODULES['gestao-notas']=async function(utilizador){
 if(!window.PRISMA_MODULES.permitido(utilizador,'NOTAS_GERIR'))return mostrarAvisoModulo('Sem permissão','Sem acesso às avaliações.');
 const d=await window.PRISMA_MODULES.api('/api/formacao/notas/gestao');
 window.PRISMA_MODULES.shell('Gerir avaliações','PRISMA / GESTÃO / AVALIAÇÕES',`<section class="dashboard-panel"><div id="notasGestao"></div></section>`,utilizador);
 document.getElementById('notasGestao').innerHTML=window.PRISMA_MODULES.table(['Operador','Formando','Respostas','Corretas','Pontos'],d.notas.map(n=>`<tr><td>${window.PRISMA_MODULES.esc(n.codigo_operador)}</td><td>${window.PRISMA_MODULES.esc(n.nome_exibicao)}</td><td>${n.respondidos}</td><td>${n.corretos}</td><td>${n.pontos}</td></tr>`));
};
