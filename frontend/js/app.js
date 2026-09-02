/* =========================================================
   PRISMA EDUCACIONAL — BANKING
   APP.JS — autenticação, shell do sistema e navegação
   ========================================================= */

const app = document.querySelector('.login-page');
const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginButtonText = document.getElementById('loginButtonText');
const loginMessage = document.getElementById('loginMessage');
const togglePassword = document.getElementById('togglePassword');
const senhaInput = document.getElementById('senha');
const registoForm = document.getElementById('registoForm');
const abrirRegistoButton = document.getElementById('abrirRegistoButton');
const cancelarRegistoButton = document.getElementById('cancelarRegistoButton');

function escaparHTML(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function obterInicial(nome) {
    const texto = String(nome || '').trim();
    return texto ? texto.charAt(0).toUpperCase() : 'P';
}

function obterSessao() {
    try {
        const raw = sessionStorage.getItem('prismaUtilizador');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error('Sessão inválida:', error);
        sessionStorage.removeItem('prismaUtilizador');
        return null;
    }
}

function guardarSessao(utilizador, token) {
    sessionStorage.setItem('prismaUtilizador', JSON.stringify(utilizador));
    sessionStorage.setItem('prismaToken', token || '');
}

function mostrarMensagem(mensagem, tipo = 'error') {
    if (!loginMessage) return;
    loginMessage.textContent = mensagem;
    loginMessage.className = `login-message visible ${tipo}`;
}

function limparMensagem() {
    if (!loginMessage) return;
    loginMessage.textContent = '';
    loginMessage.className = 'login-message';
}

function definirEstadoLogin(autenticando) {
    if (!loginButton) return;
    loginButton.disabled = autenticando;
    const texto = autenticando ? 'A autenticar...' : 'Entrar no sistema';
    if (loginButtonText) loginButtonText.textContent = texto;
    else loginButton.textContent = texto;
}

if (togglePassword && senhaInput) {
    togglePassword.addEventListener('click', () => {
        const mostrar = senhaInput.type === 'password';
        senhaInput.type = mostrar ? 'text' : 'password';
        togglePassword.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        togglePassword.setAttribute(
            'aria-label',
            mostrar ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'
        );
    });
}

async function efetuarLogin(event) {
    event.preventDefault();
    limparMensagem();

    const codigoOperador = document.getElementById('codigoOperador')?.value.trim().toUpperCase() || '';
    const senha = document.getElementById('senha')?.value || '';

    if (!codigoOperador || !senha) {
        mostrarMensagem('Introduza o código do operador e a palavra-passe.');
        return;
    }

    definirEstadoLogin(true);

    try {
        const resposta = await fetch('/api/auth/login', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({codigoOperador,senha})
        });

        const dados = await resposta.json().catch(()=>({}));

        if (!resposta.ok || !dados.success) {
            throw new Error(dados.message || 'Não foi possível autenticar o operador.');
        }

        const utilizador = dados.utilizador;
        if (!utilizador) throw new Error('O servidor não devolveu os dados do operador.');
        if (!dados.token) throw new Error('O servidor não devolveu um token de sessão válido.');

        if (!Array.isArray(utilizador.permissoes)) utilizador.permissoes=[];

        guardarSessao(utilizador, dados.token);
        console.log('Autenticação efetuada:',utilizador.codigoOperador,utilizador.nomeExibicao);

        mostrarMensagem('Sessão iniciada com sucesso.','success');
        setTimeout(()=>mostrarDashboard(utilizador),180);
    } catch(error) {
        console.error('Erro durante a autenticação:',error);
        mostrarMensagem(error.message || 'Não foi possível comunicar com o servidor.');
    } finally {
        definirEstadoLogin(false);
    }
}

async function registarFormando(event) {
    event.preventDefault();
    limparMensagem();

    const nomeCompleto=document.getElementById('regNome')?.value.trim()||'';
    const nomeUtilizador=document.getElementById('regUtilizador')?.value.trim().toLowerCase()||'';
    const senha=document.getElementById('regSenha')?.value||'';
    const confirmarSenha=document.getElementById('regConfirmarSenha')?.value||'';

    if(!nomeCompleto||!nomeUtilizador||!senha||!confirmarSenha){
        mostrarMensagem('Preencha todos os campos do registo.');
        return;
    }

    try{
        const resposta=await fetch('/api/auth/registo-formando',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({nomeCompleto,nomeUtilizador,senha,confirmarSenha})
        });
        const dados=await resposta.json().catch(()=>({}));

        if(!resposta.ok||!dados.success) throw new Error(dados.message||'Não foi possível criar o acesso.');

        registoForm.hidden=true;
        loginForm.hidden=false;
        abrirRegistoButton.hidden=false;
        document.getElementById('codigoOperador').value=dados.operador.codigoOperador;
        document.getElementById('senha').value='';
        document.getElementById('nomeUtilizador')?.remove();

        mostrarMensagem(
            `Acesso criado. O seu código de operador é ${dados.operador.codigoOperador}. Guarde-o para iniciar sessão.`,
            'success'
        );
    }catch(error){
        console.error('Erro no registo:',error);
        mostrarMensagem(error.message||'Não foi possível criar o acesso.');
    }
}

if (loginForm) loginForm.addEventListener('submit', efetuarLogin);
if (registoForm) registoForm.addEventListener('submit', registarFormando);

if (abrirRegistoButton) {
    abrirRegistoButton.addEventListener('click',()=>{
        limparMensagem();
        loginForm.hidden=true;
        registoForm.hidden=false;
        abrirRegistoButton.hidden=true;
    });
}

if (cancelarRegistoButton) {
    cancelarRegistoButton.addEventListener('click',()=>{
        limparMensagem();
        registoForm.hidden=true;
        loginForm.hidden=false;
        abrirRegistoButton.hidden=false;
    });
}

function criarMenuItem(permissao, texto, icone, permissoes, modulo = '') {
    if (!permissoes.includes(permissao)) return '';
    return `
        <button type="button" class="nav-item" data-permissao="${escaparHTML(permissao)}" data-modulo="${escaparHTML(modulo)}">
            <span class="nav-icon">${icone}</span>
            <span>${escaparHTML(texto)}</span>
        </button>
    `;
}

function renderHeaderUser(utilizador) {
    return `
        <div class="header-user">
            <div class="header-user-text">
                <strong>${escaparHTML(utilizador.nomeExibicao)}</strong>
                <span>${escaparHTML(utilizador.perfil)}</span>
                <small class="operator-badge">Operador: ${escaparHTML(utilizador.codigoOperador || '—')}</small>
            </div>
            <div class="header-avatar">${obterInicial(utilizador.nomeExibicao)}</div>
        </div>
    `;
}

function mostrarDashboard(utilizador = obterSessao()) {
    if (!utilizador || !app) return;

    const permissoes = Array.isArray(utilizador.permissoes) ? utilizador.permissoes : [];

    app.innerHTML = `
        <div class="dashboard">
            <aside class="sidebar">
                <div class="sidebar-brand">
                    <img src="/assets/logo-prisma.png" alt="PRISMA Educacional">
                    <div class="sidebar-system">BANKING</div>
                </div>

                <nav class="sidebar-nav">
                    <div class="nav-section">PRINCIPAL</div>
                    ${criarMenuItem('DASHBOARD_VISUALIZAR', 'Dashboard', '⌂', permissoes, '')}

                    <div class="nav-section">OPERAÇÕES</div>
                    ${criarMenuItem('CLIENTES_VISUALIZAR', 'Clientes', '♙', permissoes, 'clientes')}
                    ${criarMenuItem('CONTAS_VISUALIZAR', 'Contas', '▣', permissoes, 'contas')}
                    ${criarMenuItem('MOVIMENTOS_VISUALIZAR', 'Movimentos', '↔', permissoes, 'movimentos')}
                    ${criarMenuItem('TRANSFERENCIAS_OPERAR', 'Transferências', '⇄', permissoes, 'transferencias')}
                    ${criarMenuItem('CAIXA_OPERAR', 'Caixa', '▤', permissoes, 'caixa')}
                    ${criarMenuItem('CREDITO_SIMULAR', 'Crédito', '◫', permissoes, 'credito')}
                    ${criarMenuItem('CREDITO_SIMULAR', 'Risco / Análise', '⚖', permissoes, 'risco')}
                    ${criarMenuItem('CARTOES_OPERAR', 'Cartões', '▭', permissoes, 'cartoes')}
                    ${criarMenuItem('CHEQUES_OPERAR', 'Cheques', '▤', permissoes, 'cheques')}

                    <div class="nav-section">FORMAÇÃO</div>
                    ${criarMenuItem('EXERCICIOS_REALIZAR', 'Exercícios', '✓', permissoes, 'exercicios')}
                    ${criarMenuItem('NOTAS_VISUALIZAR', 'Notas', '★', permissoes, 'notas')}
                    ${criarMenuItem('COMPROVATIVOS_EMITIR', 'Comprovativos', '▤', permissoes, 'comprovativos')}

                    <div class="nav-section">GESTÃO</div>
                    ${criarMenuItem('EXERCICIOS_GERIR', 'Gerir exercícios', '⚙', permissoes, 'gestao-exercicios')}
                    ${criarMenuItem('NOTAS_GERIR', 'Gerir avaliações', '◆', permissoes, 'gestao-notas')}
                    ${criarMenuItem('RELATORIOS_VISUALIZAR', 'Relatórios', '▥', permissoes, 'relatorios')}
                    ${criarMenuItem('USUARIOS_GERIR', 'Utilizadores', '♙', permissoes, 'utilizadores')}
                    ${criarMenuItem('AUDITORIA_VISUALIZAR', 'Auditoria', '◉', permissoes, 'auditoria')}
                    ${criarMenuItem('CAIXA_RECONCILIAR', 'Reconciliação', '✓', permissoes, 'reconciliacao')}
                </nav>

                <div class="sidebar-footer">
                    <div class="user-mini">
                        <div class="user-avatar">${obterInicial(utilizador.nomeExibicao)}</div>
                        <div class="user-info">
                            <strong>${escaparHTML(utilizador.nomeExibicao)}</strong>
                            <span>${escaparHTML(utilizador.perfil)}</span>
                <small class="operator-badge">Operador: ${escaparHTML(utilizador.codigoOperador || '—')}</small>
                        </div>
                    </div>
                    <button type="button" class="logout-button" id="logoutButton">Terminar sessão</button>
                </div>
            </aside>

            <main class="dashboard-main">
                ${renderDashboardHome(utilizador)}
            </main>
        </div>
    `;

    configurarNavegacaoDashboard(utilizador);
    carregarEstatisticasDashboard();
}

function renderDashboardHome(utilizador) {
    const permissoes = utilizador.permissoes || [];
    return `
        <header class="dashboard-header">
            <div>
                <span class="dashboard-breadcrumb">PRISMA / SISTEMA</span>
                <h1>Dashboard</h1>
            </div>
            ${renderHeaderUser(utilizador)}
        </header>

        <section class="dashboard-content">
            <div class="welcome-card">
                <div>
                    <span class="welcome-label">SESSÃO ATIVA</span>
                    <h2>Bem-vindo, ${escaparHTML(utilizador.nomeExibicao)}</h2>
                    <p>Utilize o menu lateral para aceder às operações disponíveis no ambiente de simulação.</p>
                </div>
                <div class="welcome-status"><span class="status-dot"></span>Sistema operacional</div>
            </div>

            <div class="dashboard-section-title">
                <div><span>VISÃO GERAL</span><h2>Ambiente bancário</h2></div>
            </div>

            <div class="dashboard-cards">
                <article class="dashboard-card"><div class="card-icon">Kz</div><div><span>SALDO SIMULADO</span><strong id="dashboardSaldo">A carregar...</strong></div></article>
                <article class="dashboard-card"><div class="card-icon">▣</div><div><span>CONTAS</span><strong id="dashboardContasCount">A carregar...</strong></div></article>
                <article class="dashboard-card"><div class="card-icon">♙</div><div><span>CLIENTES</span><strong id="dashboardClientesCount">A carregar...</strong></div></article>
                <article class="dashboard-card"><div class="card-icon">↔</div><div><span>MOVIMENTOS</span><strong id="dashboardMovimentosCount">A carregar...</strong></div></article>
                <article class="dashboard-card"><div class="card-icon">U</div><div><span>UTILIZADORES</span><strong id="dashboardUtilizadoresCount">A carregar...</strong></div></article>
            </div>

            <section class="dashboard-panel">
                <div class="panel-header"><div><span>ATIVIDADE</span><h2>Operações recentes</h2></div></div>
                <div id="dashboardAtividade" class="table-container"><div class="loading-state">A carregar atividade...</div></div>
            </section>

            <section class="dashboard-panel">
                <div class="panel-header"><div><span>FORMAÇÃO</span><h2>Estado da sessão</h2></div></div>
                <div class="session-details">
                    <div><span>Utilizador</span><strong>${escaparHTML(utilizador.nomeUtilizador)}</strong></div>
                    <div><span>Perfil</span><strong>${escaparHTML(utilizador.perfil)}</strong></div>
                    <div><span>Permissões</span><strong>${permissoes.length}</strong></div>
                    <div><span>Ambiente</span><strong>SIMULAÇÃO</strong></div>
                </div>
            </section>
        </section>
    `;
}

async function carregarEstatisticasDashboard() {
    try {
        const token = sessionStorage.getItem('prismaToken') || '';
        const resposta = await fetch('/api/dashboard/stats', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (resposta.status === 401) {
            sessionStorage.removeItem('prismaUtilizador');
            sessionStorage.removeItem('prismaToken');
            location.reload();
            return;
        }
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !dados.success) throw new Error(dados.message || 'Falha ao carregar estatísticas.');

        const e = dados.estatisticas || {};
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        set('dashboardSaldo', `${Number(e.saldo || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`);
        set('dashboardContasCount', e.contas ?? 0);
        set('dashboardClientesCount', e.clientes ?? 0);
        set('dashboardMovimentosCount', e.movimentos ?? 0);
        set('dashboardUtilizadoresCount', e.utilizadores ?? 0);

        const atividade = document.getElementById('dashboardAtividade');
        if (!atividade) return;

        const recentes = Array.isArray(dados.recentes) ? dados.recentes : [];
        atividade.innerHTML = recentes.length
            ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Tipo</th><th>Operação</th><th>Conta</th><th>Valor</th><th>Data</th></tr></thead><tbody>${recentes.map(r => `<tr><td>${escaparHTML(r.tipo)}</td><td>${escaparHTML(r.operacao)}</td><td>${escaparHTML(r.numero_conta || '—')}</td><td>${Number(r.valor || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} Kz</td><td>${formatarDataHora(r.criado_em)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="empty-state compact"><div class="empty-icon">—</div><strong>Nenhuma operação registada</strong><p>As operações realizadas no sistema aparecerão aqui.</p></div>`;
    } catch (error) {
        console.error('Dashboard:', error);
        ['dashboardSaldo','dashboardContasCount','dashboardClientesCount','dashboardMovimentosCount','dashboardUtilizadoresCount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        const atividade = document.getElementById('dashboardAtividade');
        if (atividade) atividade.innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
    }
}

function formatarDataHora(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString('pt-PT');
}

function configurarNavegacaoDashboard(utilizador) {
    const dashboard = document.querySelector('.dashboard');
    if (!dashboard) return;

    dashboard.addEventListener('click', async event => {
        const logout = event.target.closest('#logoutButton');
        if (logout) {
            confirmarTerminarSessao();
            return;
        }

        const item = event.target.closest('.nav-item');
        if (!item) return;

        const modulo = item.dataset.modulo || '';
        document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el === item));
        console.log('Módulo selecionado:', modulo || 'dashboard');

        try {
            if (!modulo) {
                mostrarDashboard(utilizador);
                requestAnimationFrame(voltarAoTopoDoDashboard);
                return;
            }
            if (modulo === 'clientes') {
                await mostrarClientes(utilizador);
                requestAnimationFrame(voltarAoTopoDoDashboard);
                return;
            }
            if (['contas','movimentos','caixa','transferencias','credito','risco'].includes(modulo)) {
                await mostrarModuloOperacional(modulo, utilizador);
                requestAnimationFrame(voltarAoTopoDoDashboard);
                return;
            }
            mostrarModuloGenerico(modulo, utilizador);
            requestAnimationFrame(voltarAoTopoDoDashboard);
        } catch (error) {
            console.error(`Erro no módulo ${modulo}:`, error);
            mostrarAvisoModulo('Erro no módulo', error.message || 'Não foi possível abrir o módulo.');
        }
    });
}

function voltarAoTopoDoDashboard() {
    const main = document.querySelector('.dashboard-main');
    if (main) main.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    const content = main?.querySelector('.dashboard-content');
    if (content) content.scrollTop = 0;
}

function confirmarTerminarSessao() {
    mostrarModal(`
        <div class="prisma-confirm-modal">
            <div class="prisma-confirm-icon">↪</div>
            <div class="modal-header">
                <div>
                    <span class="welcome-label">SESSÃO</span>
                    <h2>Terminar sessão?</h2>
                    <p>Tem a certeza de que pretende terminar a sessão atual?</p>
                </div>
                <button type="button" class="modal-close" data-close-modal aria-label="Fechar">×</button>
            </div>
            <div class="modal-actions">
                <button type="button" class="secondary-action" data-close-modal>Cancelar</button>
                <button type="button" class="primary-action" id="confirmLogoutButton">Confirmar</button>
            </div>
        </div>
    `);

    document.getElementById('confirmLogoutButton')?.addEventListener('click', () => {
        fecharModal();
        terminarSessao();
    });
}

function terminarSessao() {
    sessionStorage.removeItem('prismaUtilizador');
    sessionStorage.removeItem('prismaToken');
    location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
    const utilizador = obterSessao();
    if (utilizador) {
        console.log('Sessão encontrada:', utilizador.nomeExibicao);
        mostrarDashboard(utilizador);
    }
});
