/* =========================================================
   PRISMA EDUCACIONAL — DASHBOARD.JS
   UI operacional do Banking

   Destaques:
   - Seletores de entidades com pesquisa
   - F2 abre tabela de seleção ao estilo ERP/PRIMAVERA
   - Clientes + histórico
   - Contas + documentação + depósito inicial
   - Movimentos
   - Caixa + serviços + conferência/fecho
   - Transferências
   - Crédito + amortização
   - Análise de risco
   ========================================================= */

/* =========================================================
   API / HELPERS
   ========================================================= */

async function apiJSON(url, options = {}) {
    if (window.PRISMA_MODULES?.api) {
        return window.PRISMA_MODULES.api(url, options);
    }

    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    const token = sessionStorage.getItem('prismaToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const resposta = await fetch(url, { ...options, headers });
    const dados = await resposta.json().catch(() => ({}));
    if (resposta.status === 401) {
        sessionStorage.removeItem('prismaUtilizador');
        sessionStorage.removeItem('prismaToken');
        location.reload();
        throw new Error(dados.message || 'A sessão expirou.');
    }
    if (!resposta.ok || !dados.success) {
        const mensagem = dados.message || `Operação não concluída (HTTP ${resposta.status}).`;
        console.error('Falha na API:', { url, status: resposta.status, dados });
        throw new Error(mensagem);
    }
    return dados;
}

async function carregarClientesOptions() {
    const dados = await apiJSON('/api/clientes');
    return Array.isArray(dados.clientes) ? dados.clientes : [];
}

async function carregarContasOptions() {
    const dados = await apiJSON('/api/operacoes/contas');
    return Array.isArray(dados.contas) ? dados.contas : [];
}

function moeda(valor) {
    return `${Number(valor || 0).toLocaleString('pt-PT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} Kz`;
}

function detalhe(label, valor) {
    return `<div><span>${escaparHTML(label)}</span><strong>${escaparHTML(valor)}</strong></div>`;
}

function option(value, label, selected = '') {
    return `<option value="${escaparHTML(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escaparHTML(label)}</option>`;
}

function formatarData(valor) {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString('pt-PT');
}

/* =========================================================
   CLIENTES
   ========================================================= */

async function mostrarClientes(utilizador) {
    const permissoes = utilizador.permissoes || [];
    if (!permissoes.includes('CLIENTES_VISUALIZAR')) {
        mostrarAvisoModulo('Sem permissão', 'Não possui permissão para visualizar clientes.');
        return;
    }

    const main = document.querySelector('.dashboard-main');
    if (!main) return;

    main.innerHTML = `
        <header class="dashboard-header">
            <div>
                <span class="dashboard-breadcrumb">PRISMA / OPERAÇÕES / CLIENTES</span>
                <h1>Clientes</h1>
            </div>
            ${renderHeaderUser(utilizador)}
        </header>

        <section class="dashboard-content clientes-page">
            <div class="page-toolbar">
                <div>
                    <span class="welcome-label">GESTÃO DE CLIENTES</span>
                    <h2>Clientes</h2>
                    <p>Consulte, pesquise e gira os clientes registados no sistema.</p>
                </div>
                ${permissoes.includes('CLIENTES_CRIAR') ? '<button type="button" class="primary-action" id="novoClienteButton">+ Novo cliente</button>' : ''}
            </div>

            <section class="dashboard-panel">
                <div class="panel-header">
                    <div><span>REGISTO DE CLIENTES</span><h2>Clientes registados</h2></div>
                    <div id="clientesCount">—</div>
                </div>
                <div class="clientes-filtros">
                    <div class="cliente-search">
                        <label for="pesquisaCliente">Pesquisar <span class="field-shortcut">F2 — tabela completa</span></label>
                        <input type="search" id="pesquisaCliente" placeholder="Nome, BI, NIF, telefone, nº cliente ou conta...">
                    </div>
                    <div>
                        <label for="filtroTipoCliente">Tipo</label>
                        <select id="filtroTipoCliente">
                            <option value="">Todos</option>
                            <option value="PARTICULAR">Particular</option>
                            <option value="EMPRESA">Empresa</option>
                        </select>
                    </div>
                    <div>
                        <label for="filtroEstadoCliente">Estado</label>
                        <select id="filtroEstadoCliente">
                            <option value="">Todos</option>
                            <option value="ATIVO">Ativo</option>
                            <option value="INATIVO">Inativo</option>
                        </select>
                    </div>
                </div>
                <div id="clientesTableContainer" class="table-container">
                    <div class="loading-state">A carregar clientes...</div>
                </div>
            </section>
        </section>
    `;

    document.getElementById('novoClienteButton')?.addEventListener('click', () => mostrarFormularioCliente(utilizador));

    let clientes = [];
    const pesquisa = document.getElementById('pesquisaCliente');
    const tipo = document.getElementById('filtroTipoCliente');
    const estado = document.getElementById('filtroEstadoCliente');

    async function atualizarTabela() {
        try {
            if (!clientes.length) clientes = await carregarClientesOptions();

            const termo = String(pesquisa?.value || '').trim().toLocaleLowerCase('pt-PT');
            const tipoValor = tipo?.value || '';
            const estadoValor = estado?.value || '';

            const filtrados = clientes.filter(cliente => {
                const texto = [
                    cliente.numero_cliente,
                    cliente.nome_completo,
                    cliente.nif,
                    cliente.numero_bi,
                    cliente.telefone,
                    cliente.email,
                    cliente.cidade
                ].join(' ').toLocaleLowerCase('pt-PT');

                return (!termo || texto.includes(termo))
                    && (!tipoValor || cliente.tipo_cliente === tipoValor)
                    && (!estadoValor || cliente.estado === estadoValor);
            });

            renderTabelaClientes(filtrados, utilizador);
            const contador = document.getElementById('clientesCount');
            if (contador) contador.textContent = `${filtrados.length} cliente(s)`;
        } catch (error) {
            document.getElementById('clientesTableContainer').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        }
    }

    pesquisa?.addEventListener('input', atualizarTabela);
    tipo?.addEventListener('change', atualizarTabela);
    estado?.addEventListener('change', atualizarTabela);

    /*
     * F2 — selector ERP no próprio módulo Clientes.
     * O campo de pesquisa continua a mostrar apenas resultados normais
     * durante a digitação. F2 abre a tabela completa para pesquisa,
     * navegação por teclado e seleção por duplo clique.
     */
    pesquisa?.addEventListener('keydown', event => {
        if (event.key !== 'F2') return;

        event.preventDefault();
        event.stopPropagation();

        const itens = clientesParaPicker(clientes);

        abrirTabelaSelecao({
            titulo: 'Clientes',
            itens,
            selecionar: cliente => {
                if (!cliente) return;
                pesquisa.value = cliente.label;
                atualizarTabela();
                pesquisa.focus();
            }
        });
    });

    await atualizarTabela();
}

function renderTabelaClientes(clientes, utilizador) {
    const container = document.getElementById('clientesTableContainer');
    if (!container) return;

    if (!clientes.length) {
        container.innerHTML = '<div class="empty-state compact"><div class="empty-icon">♙</div><strong>Nenhum cliente encontrado</strong><p>Altere os filtros ou crie um novo cliente.</p></div>';
        return;
    }

    const permissoes = utilizador.permissoes || [];
    const podeEditar = permissoes.includes('CLIENTES_EDITAR');
    const podeEliminar = permissoes.includes('CLIENTES_ELIMINAR');

    container.innerHTML = `
        <div class="table-scroll">
            <table class="data-table">
                <thead><tr>
                    <th>Nº Cliente</th><th>Nome</th><th>BI</th><th>NIF</th><th>Telefone</th>
                    <th>Cidade</th><th>Tipo</th><th>Estado</th><th>Ações</th>
                </tr></thead>
                <tbody>
                    ${clientes.map(cliente => `
                        <tr>
                            <td><strong>${escaparHTML(cliente.numero_cliente)}</strong></td>
                            <td>${escaparHTML(cliente.nome_completo)}</td>
                            <td>${escaparHTML(cliente.numero_bi || '—')}</td>
                            <td>${escaparHTML(cliente.nif || '—')}</td>
                            <td>${escaparHTML(cliente.telefone || '—')}</td>
                            <td>${escaparHTML(cliente.cidade || '—')}</td>
                            <td>${escaparHTML(cliente.tipo_cliente || '—')}</td>
                            <td><span class="status-badge ${cliente.estado === 'ATIVO' ? 'active' : 'inactive'}">${escaparHTML(cliente.estado || '—')}</span></td>
                            <td>
                                <div class="table-actions">
                                    <button class="table-action" data-cliente-view="${cliente.id}">Ver</button>
                                    ${podeEditar ? `<button class="table-action" data-cliente-edit="${cliente.id}">Editar</button>` : ''}
                                    ${podeEditar ? `<button class="table-action ${cliente.estado === 'ATIVO' ? 'danger' : ''}" data-cliente-state="${cliente.id}" data-estado="${cliente.estado === 'ATIVO' ? 'INATIVO' : 'ATIVO'}">${cliente.estado === 'ATIVO' ? 'Desativar' : 'Ativar'}</button>` : ''}
                                    ${podeEliminar ? `<button class="table-action danger" data-cliente-delete="${cliente.id}">Eliminar</button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.querySelectorAll('[data-cliente-view]').forEach(btn => btn.addEventListener('click', () => abrirCliente(btn.dataset.clienteView)));
    container.querySelectorAll('[data-cliente-edit]').forEach(btn => btn.addEventListener('click', () => mostrarFormularioCliente(utilizador, btn.dataset.clienteEdit)));
    container.querySelectorAll('[data-cliente-state]').forEach(btn => btn.addEventListener('click', () => alterarEstadoCliente(btn.dataset.clienteState, btn.dataset.estado, utilizador)));
    container.querySelectorAll('[data-cliente-delete]').forEach(btn => btn.addEventListener('click', () => confirmarEliminarCliente(btn.dataset.clienteDelete, utilizador)));
}

async function abrirCliente(id) {
    try {
        const dados = await apiJSON(`/api/clientes/${encodeURIComponent(id)}`);
        const cliente = dados.cliente;
        const contas = (await carregarContasOptions()).filter(c => String(c.cliente_id) === String(id));

        mostrarModal(`
            <div class="modal-header">
                <div><span class="welcome-label">FICHA DO CLIENTE</span><h2>${escaparHTML(cliente.nome_completo)}</h2><p>${escaparHTML(cliente.numero_cliente)} · ${escaparHTML(cliente.tipo_cliente || 'PARTICULAR')}</p></div>
                <button class="modal-close" data-close-modal>×</button>
            </div>
            <div class="detail-grid">
                ${detalhe('Nº Cliente', cliente.numero_cliente)}
                ${detalhe('NIF', cliente.nif || '—')}
                ${detalhe('Telefone', cliente.telefone || '—')}
                ${detalhe('Email', cliente.email || '—')}
                ${detalhe('Cidade', cliente.cidade || '—')}
                ${detalhe('Estado', cliente.estado || '—')}
            </div>
            <div class="panel-header"><div><span>RELACIONAMENTO</span><h2>Contas do cliente</h2></div><strong>${contas.length}</strong></div>
            <div class="table-container">
                ${contas.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Conta</th><th>Tipo</th><th>Saldo</th><th>Estado</th><th></th></tr></thead><tbody>${contas.map(c=>`<tr><td><strong>${escaparHTML(c.numero_conta)}</strong></td><td>${escaparHTML(c.tipo_conta)}</td><td>${moeda(c.saldo)}</td><td>${escaparHTML(c.estado)}</td><td><button type="button" class="table-action" data-cliente-conta="${c.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state compact">Este cliente ainda não possui contas.</div>'}
            </div>
            <div id="historicoClienteResultado"></div>
            <div class="modal-actions full">
                <button type="button" class="primary-action" id="historicoClienteButton">Consultar histórico</button>
                <button type="button" class="secondary-action" data-close-modal>Fechar</button>
            </div>
        `);

        document.querySelectorAll('[data-cliente-conta]').forEach(btn => btn.addEventListener('click', () => abrirConta(btn.dataset.clienteConta)));
        document.getElementById('historicoClienteButton')?.addEventListener('click', async () => {
            const alvo = document.getElementById('historicoClienteResultado');
            if (!alvo) return;
            alvo.innerHTML = '<div class="loading-state">A carregar histórico...</div>';
            try {
                const dadosHistorico = await apiJSON(`/api/operacoes/clientes/${encodeURIComponent(id)}/historico`);
                const rows = dadosHistorico.historico || [];
                alvo.innerHTML = rows.length
                    ? `<div class="panel-header"><div><span>MOVIMENTOS</span><h2>Histórico financeiro</h2></div><strong>${rows.length}</strong></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Conta</th><th>Operação</th><th>Valor</th><th>Saldo</th><th>Referência</th></tr></thead><tbody>${rows.map(row => `<tr><td>${formatarDataHora(row.criado_em)}</td><td>${escaparHTML(row.numero_conta || '—')}</td><td>${escaparHTML(row.tipo || '—')}</td><td>${moeda(row.valor)}</td><td>${moeda(row.saldo_posterior)}</td><td>${escaparHTML(row.referencia || '—')}</td></tr>`).join('')}</tbody></table></div>`
                    : '<div class="empty-state compact">Este cliente ainda não possui movimentos.</div>';
            } catch (error) {
                alvo.innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
            }
        });
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

async function mostrarFormularioCliente(utilizador, id = null) {
    let cliente = null;
    if (id) {
        try {
            cliente = (await apiJSON(`/api/clientes/${encodeURIComponent(id)}`)).cliente;
        } catch (error) {
            mostrarToast(error.message, 'error');
            return;
        }
    }

    const editar = Boolean(cliente);

    mostrarModal(`
        <div class="modal-header">
            <div><span class="welcome-label">${editar ? 'EDIÇÃO' : 'NOVO REGISTO'}</span><h2>${editar ? 'Editar cliente' : 'Novo cliente'}</h2></div>
            <button class="modal-close" data-close-modal>×</button>
        </div>
        <form id="clienteForm" class="form-grid">
            <div class="form-field full"><label>Nome completo *</label><input name="nomeCompleto" required value="${escaparHTML(cliente?.nome_completo || '')}"></div>
            <div class="form-field"><label>NIF</label><input name="nif" value="${escaparHTML(cliente?.nif || '')}"></div>
            <div class="form-field"><label>Nº BI</label><input name="numeroBI" value="${escaparHTML(cliente?.numero_bi || '')}"></div>
            <div class="form-field"><label>Data de nascimento</label><input type="date" name="dataNascimento" value="${String(cliente?.data_nascimento || '').slice(0, 10)}"></div>
            <div class="form-field"><label>Sexo</label><select name="sexo"><option value="">Selecionar</option>${option('M','Masculino',cliente?.sexo)}${option('F','Feminino',cliente?.sexo)}${option('OUTRO','Outro',cliente?.sexo)}</select></div>
            <div class="form-field"><label>Telefone</label><input name="telefone" value="${escaparHTML(cliente?.telefone || '')}"></div>
            <div class="form-field"><label>Email</label><input type="email" name="email" value="${escaparHTML(cliente?.email || '')}"></div>
            <div class="form-field full"><label>Endereço</label><input name="endereco" value="${escaparHTML(cliente?.endereco || '')}"></div>
            <div class="form-field"><label>Cidade</label><input name="cidade" value="${escaparHTML(cliente?.cidade || '')}"></div>
            <div class="form-field"><label>Tipo de cliente</label><select name="tipoCliente">${option('PARTICULAR','Particular',cliente?.tipo_cliente || 'PARTICULAR')}${option('EMPRESA','Empresa',cliente?.tipo_cliente)}</select></div>
            ${editar ? `<div class="form-field"><label>Estado</label><select name="estado">${option('ATIVO','Ativo',cliente?.estado || 'ATIVO')}${option('INATIVO','Inativo',cliente?.estado)}</select></div>` : ''}
            <div class="modal-actions full"><button type="button" class="secondary-action" data-close-modal>Cancelar</button><button type="submit" class="primary-action">${editar ? 'Guardar alterações' : 'Criar cliente'}</button></div>
        </form>
    `);

    document.getElementById('clienteForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = Object.fromEntries(new FormData(form).entries());
        try {
            const dados = await apiJSON(editar ? `/api/clientes/${encodeURIComponent(id)}` : '/api/clientes', {
                method: editar ? 'PUT' : 'POST',
                body: JSON.stringify(payload)
            });
            fecharModal();
            await mostrarClientes(utilizador);
            mostrarToast(editar ? 'Cliente atualizado com sucesso.' : `Cliente ${dados.cliente.numero_cliente} criado com sucesso.`, 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
        }
    });
}


async function confirmarEliminarCliente(id, utilizador) {
    let cliente;

    try {
        cliente = (await apiJSON(`/api/clientes/${encodeURIComponent(id)}`)).cliente;
    } catch (error) {
        mostrarToast(error.message, 'error');
        return;
    }

    mostrarModal(`
        <div class="prisma-confirm-modal">
            <div class="prisma-confirm-icon danger">!</div>
            <div class="modal-header">
                <div>
                    <span class="welcome-label">ELIMINAÇÃO DE CLIENTE</span>
                    <h2>Eliminar cliente?</h2>
                    <p>
                        Pretende eliminar permanentemente
                        <strong>${escaparHTML(cliente.nome_completo)}</strong>
                        (${escaparHTML(cliente.numero_cliente)})?
                    </p>
                    <p class="warning-text">
                        Esta operação só será permitida se o cliente não possuir
                        contas, créditos ou histórico financeiro associado.
                    </p>
                </div>
                <button type="button" class="modal-close" data-close-modal aria-label="Fechar">×</button>
            </div>
            <div class="modal-actions">
                <button type="button" class="secondary-action" data-close-modal>Cancelar</button>
                <button type="button" class="primary-action danger-action" id="confirmDeleteCliente">Eliminar</button>
            </div>
        </div>
    `);

    document.getElementById('confirmDeleteCliente')?.addEventListener('click', async () => {
        const button = document.getElementById('confirmDeleteCliente');
        if (!button) return;

        button.disabled = true;
        button.textContent = 'A eliminar...';

        try {
            const dados = await apiJSON(`/api/clientes/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                body: JSON.stringify({})
            });

            fecharModal();
            await mostrarClientes(utilizador);
            mostrarToast(dados.message || 'Cliente eliminado com sucesso.', 'success');
            window.dispatchEvent(new CustomEvent('prisma:dashboard-refresh'));
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Eliminar';
            mostrarToast(error.message, 'error');
        }
    });
}

async function alterarEstadoCliente(id, estado, utilizador) {
    const acao = estado === 'ATIVO' ? 'ativar' : 'desativar';
    if (!confirm(`Deseja ${acao} este cliente?`)) return;
    try {
        await apiJSON(`/api/clientes/${encodeURIComponent(id)}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado })
        });
        await mostrarClientes(utilizador);
        mostrarToast(`Cliente ${estado === 'ATIVO' ? 'ativado' : 'desativado'} com sucesso.`, 'success');
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

/* =========================================================
   SELETOR ERP / F2
   ========================================================= */

function clientesParaPicker(clientes) {
    return clientes.map(cliente => ({
        value: cliente.id,
        label: `${cliente.numero_cliente} — ${cliente.nome_completo}`,
        meta: `${cliente.nif || 'Sem NIF'} · ${cliente.telefone || 'Sem telefone'} · ${cliente.cidade || 'Sem cidade'}`,
        search: `${cliente.numero_cliente} ${cliente.nome_completo} ${cliente.nif || ''} ${cliente.telefone || ''} ${cliente.email || ''} ${cliente.cidade || ''}`
    }));
}

function contasParaPicker(contas) {
    return contas.map(conta => ({
        value: conta.id,
        label: `${conta.numero_conta} — ${conta.cliente_nome}`,
        meta: `${conta.tipo_conta} · Saldo ${moeda(conta.saldo)} · ${conta.numero_cliente || ''}`,
        search: `${conta.numero_conta} ${conta.cliente_nome} ${conta.numero_cliente || ''} ${conta.tipo_conta || ''}`
    }));
}

function criarSeletorPesquisa({ id, name, label, placeholder = 'Pesquisar...', itens = [], valorInicial = '', obrigatorio = true }) {
    const selecionado = itens.find(item => String(item.value) === String(valorInicial));
    return `
        <div class="form-field searchable-field" data-picker="${escaparHTML(id)}">
            <label for="${escaparHTML(id)}Input">${escaparHTML(label)}${obrigatorio ? ' *' : ''}</label>
            <div class="entity-picker" id="${escaparHTML(id)}Picker">
                <div class="entity-picker-control">
                    <input type="search" id="${escaparHTML(id)}Input" class="entity-picker-input" placeholder="${escaparHTML(placeholder)}" value="${escaparHTML(selecionado?.label || '')}" autocomplete="off" aria-expanded="false" ${obrigatorio ? 'required' : ''}>
                    <button type="button" class="entity-picker-f2" title="Abrir tabela de seleção (F2)">F2</button>
                </div>
                <input type="hidden" name="${escaparHTML(name)}" id="${escaparHTML(id)}Value" value="${escaparHTML(valorInicial)}">
                <div class="entity-picker-results" id="${escaparHTML(id)}Results" hidden></div>
            </div>
        </div>
    `;
}

function ativarSeletorPesquisa({ id, itens = [], onSelect } = {}) {
    const picker = document.getElementById(`${id}Picker`);
    const input = document.getElementById(`${id}Input`);
    const value = document.getElementById(`${id}Value`);
    const results = document.getElementById(`${id}Results`);
    const f2 = picker?.querySelector('.entity-picker-f2');
    if (!picker || !input || !value || !results) return;

    const filtrar = termo => {
        const q = String(termo || '').trim().toLocaleLowerCase('pt-PT');
        return itens.filter(item => {
            const texto = String(item.search || `${item.label} ${item.meta || ''}`).toLocaleLowerCase('pt-PT');
            return !q || texto.includes(q);
        }).slice(0, 30);
    };

    const render = termo => {
        const filtrados = filtrar(termo).slice(0, 3);
        results.innerHTML = filtrados.length
            ? filtrados.map(item => `<button type="button" class="entity-picker-option" data-value="${escaparHTML(item.value)}"><strong>${escaparHTML(item.label)}</strong>${item.meta ? `<span>${escaparHTML(item.meta)}</span>` : ''}</button>`).join('')
            : '<div class="entity-picker-empty">Nenhum registo encontrado.</div>';
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    };

    const selecionar = item => {
        if (!item) return;
        value.value = item.value;
        input.value = item.label;
        results.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        onSelect?.(item);
    };

    input.addEventListener('focus', () => render(input.value));
    input.addEventListener('input', () => {
        value.value = '';
        render(input.value);
        onSelect?.(null);
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'F2') {
            event.preventDefault();
            event.stopPropagation();
            abrirTabelaSelecao({ id, titulo: input.closest('.searchable-field')?.querySelector('label')?.textContent?.replace(' *', '') || 'Seleção', itens, selecionar });
            return;
        }
        if (event.key === 'ArrowDown' && results.hidden === false) {
            event.preventDefault();
            results.querySelector('.entity-picker-option')?.focus();
        }
        if (event.key === 'Escape') {
            results.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        }
    });

    f2?.addEventListener('click', () => {
        abrirTabelaSelecao({ id, titulo: input.closest('.searchable-field')?.querySelector('label')?.textContent?.replace(' *', '') || 'Seleção', itens, selecionar });
    });

    results.addEventListener('click', event => {
        const botao = event.target.closest('.entity-picker-option');
        if (!botao) return;
        selecionar(itens.find(item => String(item.value) === String(botao.dataset.value)));
    });

    results.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const botao = event.target.closest('.entity-picker-option');
            if (botao) selecionar(itens.find(item => String(item.value) === String(botao.dataset.value)));
        }
    });

    document.addEventListener('click', event => {
        if (!picker.contains(event.target)) {
            results.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        }
    });
}

function abrirTabelaSelecao({ titulo, itens, selecionar }) {
    const lista = Array.isArray(itens) ? itens : [];

    mostrarModal(`
        <div class="modal-header">
            <div>
                <span class="welcome-label">SELEÇÃO ERP</span>
                <h2>${escaparHTML(titulo)}</h2>
                <p class="picker-help">Pesquise pelo texto. Clique para selecionar. Duplo clique confirma. F2 ou Enter confirma a linha selecionada. Use ↑/↓ para navegar. Esc fecha.</p>
            </div>
            <button class="modal-close" data-close-modal>×</button>
        </div>
        <div class="erp-selector-toolbar">
            <input id="erpSelectorSearch" type="search" placeholder="Pesquisar registo..." autocomplete="off">
            <span id="erpSelectorCount">${lista.length} registo(s)</span>
        </div>
        <div id="erpSelectorTable" class="table-container"></div>
        <div class="modal-actions full">
            <button type="button" class="secondary-action" data-close-modal>Cancelar</button>
        </div>
    `);

    const search = document.getElementById('erpSelectorSearch');
    const table = document.getElementById('erpSelectorTable');
    const count = document.getElementById('erpSelectorCount');

    function render(termo = '') {
        const q = String(termo || '').trim().toLocaleLowerCase('pt-PT');
        const filtrados = lista.filter(item => String(item.search || `${item.label} ${item.meta || ''}`).toLocaleLowerCase('pt-PT').includes(q));
        if (count) count.textContent = `${filtrados.length} registo(s)`;
        table.innerHTML = filtrados.length
            ? `<div class="table-scroll"><table class="data-table erp-selector-table"><thead><tr><th>Registo</th><th>Detalhes</th></tr></thead><tbody>${filtrados.map(item => `<tr tabindex="0" data-erp-value="${escaparHTML(item.value)}"><td><strong>${escaparHTML(item.label)}</strong></td><td>${escaparHTML(item.meta || '')}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="empty-state compact"><strong>Nenhum registo encontrado</strong><p>Tente outro nome, número, NIF ou código.</p></div>';

        let linhaSelecionada = null;

        const selecionarLinhaVisual = row => {
            table.querySelectorAll('tbody tr').forEach(linha => linha.classList.remove('erp-row-selected'));
            row?.classList.add('erp-row-selected');
            linhaSelecionada = row || null;
            row?.focus();
        };

        table.querySelectorAll('tbody tr').forEach(row => {
            row.addEventListener('click', () => selecionarLinhaVisual(row));
            row.addEventListener('dblclick', () => escolher(row.dataset.erpValue));
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === 'F2') {
                    event.preventDefault();
                    escolher(row.dataset.erpValue);
                }
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    const next = row.nextElementSibling;
                    if (next) selecionarLinhaVisual(next);
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    const prev = row.previousElementSibling;
                    if (prev) selecionarLinhaVisual(prev);
                }
            });
        });

        /*
         * Não selecionar nem focar automaticamente a primeira linha.
         * Isto é importante para o comportamento ERP: enquanto o
         * utilizador escreve no campo de pesquisa, o foco permanece
         * no campo e nenhum cliente é escolhido por acidente.
         */
        table.dataset.getSelectedValue = () => linhaSelecionada?.dataset.erpValue || '';
    }

    function escolher(value) {
        const item = lista.find(registo => String(registo.value) === String(value));
        if (!item) return;
        selecionar(item);
        fecharModal();
    }

    search?.addEventListener('input', () => render(search.value));
    search?.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            fecharModal();
            return;
        }

        if (event.key === 'ArrowDown') {
            const primeira = table.querySelector('tbody tr');
            if (primeira) {
                event.preventDefault();
                selecionarLinhaVisual(primeira);
            }
            return;
        }

        if (event.key === 'Enter' || event.key === 'F2') {
            const selecionada = table.querySelector('tbody tr.erp-row-selected');
            if (selecionada) {
                event.preventDefault();
                escolher(selecionada.dataset.erpValue);
            }
        }
    });

    table?.addEventListener('keydown', event => {
        if (event.key === 'F2') {
            const selecionada = table.querySelector('tbody tr.erp-row-selected') || table.querySelector('tbody tr');
            if (selecionada) {
                event.preventDefault();
                escolher(selecionada.dataset.erpValue);
            }
        }
    });

    render();
    setTimeout(() => search?.focus(), 0);
}

/* =========================================================
   CONTAS
   ========================================================= */

async function renderContasReal(main, utilizador) {
    const clientes = await carregarClientesOptions();
    const clienteItems = clientesParaPicker(clientes);

    main.innerHTML = layoutModuloReal('Contas', 'PRISMA / OPERAÇÕES / CONTAS', `
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>ABERTURA</span><h2>Abertura de conta</h2></div></div>
            <form id="contaForm" class="form-grid">
                ${criarSeletorPesquisa({ id:'contaCliente', name:'clienteId', label:'Cliente', placeholder:'Pesquisar nº, nome, NIF ou telefone...', itens:clienteItems })}
                <div class="form-field">
                    <label for="tipoConta">Tipo de conta *</label>
                    <select id="tipoConta" name="tipoConta" required>
                        <option value="ORDEM">Conta à ordem</option>
                        <option value="PRAZO">Conta a prazo</option>
                        <option value="SALARIO">Conta salário</option>
                        <option value="POUPANCA">Conta poupança</option>
                    </select>
                </div>
                <div class="form-field"><label for="depositoInicial">Depósito inicial (Kz)</label><input id="depositoInicial" name="depositoInicial" type="number" min="0" step="0.01" value="0"></div>
                <div class="form-field full">
                    <label>Documentação</label>
                    <div class="check-list">
                        <label><input type="checkbox" name="docBI" checked> BI/Documento verificado</label>
                        <label><input type="checkbox" name="docNIF"> NIF verificado</label>
                        <label><input type="checkbox" name="docComprovativo"> Comprovativo de morada</label>
                    </div>
                </div>
                <div class="modal-actions full"><button class="primary-action" type="submit">Abrir conta</button></div>
            </form>
            <div id="contaResultado"></div>
        </section>
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>CONSULTA</span><h2>Contas abertas</h2></div><button type="button" class="secondary-action" id="refreshContas">Atualizar</button></div>
            <div class="clientes-filtros">
                <div class="cliente-search"><label for="pesquisaConta">Pesquisar</label><input id="pesquisaConta" type="search" placeholder="Nº conta, cliente, nº cliente ou tipo..."></div>
                <div><label for="filtroTipoConta">Tipo</label><select id="filtroTipoConta"><option value="">Todos</option><option value="ORDEM">À ordem</option><option value="PRAZO">A prazo</option><option value="SALARIO">Salário</option><option value="POUPANCA">Poupança</option></select></div>
                <div><label for="filtroEstadoConta">Estado</label><select id="filtroEstadoConta"><option value="">Todos</option><option value="ATIVA">Ativa</option><option value="INATIVA">Inativa</option></select></div>
            </div>
            <div id="contasTable" class="table-container"><div class="loading-state">A carregar...</div></div>
        </section>
    `, utilizador);

    ativarSeletorPesquisa({ id:'contaCliente', itens:clienteItems });

    document.getElementById('contaForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const dados = new FormData(form);
        if (!dados.get('clienteId')) {
            mostrarToast('Selecione um cliente existente. Use F2 no campo Cliente.', 'error');
            document.getElementById('contaClienteInput')?.focus();
            return;
        }
        try {
            const resposta = await apiJSON('/api/operacoes/contas', {
                method: 'POST',
                body: JSON.stringify({
                    clienteId: dados.get('clienteId'), tipoConta: dados.get('tipoConta'),
                    depositoInicial: Number(dados.get('depositoInicial') || 0),
                    documentos: [
                        { tipo:'BI', estado:dados.get('docBI') ? 'VALIDO' : 'PENDENTE' },
                        { tipo:'NIF', estado:dados.get('docNIF') ? 'VALIDO' : 'PENDENTE' },
                        { tipo:'COMPROVATIVO_MORADA', estado:dados.get('docComprovativo') ? 'VALIDO' : 'PENDENTE' }
                    ]
                })
            });
            const conta = resposta.conta;
            document.getElementById('contaResultado').innerHTML = `<div class="success-state"><strong>Conta ${escaparHTML(conta.numero_conta)} aberta com sucesso.</strong><p>Depósito inicial: ${moeda(conta.deposito_inicial)} · Saldo: ${moeda(conta.saldo)}</p><button type="button" class="secondary-action" id="imprimirContaComprovativo">Emitir comprovativo</button></div>`;
            document.getElementById('imprimirContaComprovativo')?.addEventListener('click', () => imprimirComprovativo('Abertura de conta', [['Nº Conta', conta.numero_conta],['Tipo', conta.tipo_conta],['Cliente', clienteItems.find(i => String(i.value) === String(conta.cliente_id))?.label || '—'],['Depósito inicial', moeda(conta.deposito_inicial)],['Saldo', moeda(conta.saldo)]]));
            form.reset();
            document.getElementById('contaClienteValue').value='';
            document.getElementById('contaClienteInput').value='';
            await carregarTabelaContas();
            window.dispatchEvent(new CustomEvent('prisma:dashboard-refresh'));
        } catch (error) {
            document.getElementById('contaResultado').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        }
    });

    document.getElementById('refreshContas')?.addEventListener('click', carregarTabelaContas);
    document.getElementById('pesquisaConta')?.addEventListener('input', carregarTabelaContas);
    document.getElementById('filtroTipoConta')?.addEventListener('change', carregarTabelaContas);
    document.getElementById('filtroEstadoConta')?.addEventListener('change', carregarTabelaContas);

    async function carregarTabelaContas() {
        const alvo = document.getElementById('contasTable');
        if (!alvo) return;
        try {
            const contas = await carregarContasOptions();
            const termo = String(document.getElementById('pesquisaConta')?.value || '').trim().toLocaleLowerCase('pt-PT');
            const tipo = document.getElementById('filtroTipoConta')?.value || '';
            const estado = document.getElementById('filtroEstadoConta')?.value || '';
            const filtradas = contas.filter(c => {
                const texto = `${c.numero_conta || ''} ${c.cliente_nome || ''} ${c.numero_cliente || ''} ${c.tipo_conta || ''}`.toLocaleLowerCase('pt-PT');
                return (!termo || texto.includes(termo)) && (!tipo || c.tipo_conta === tipo) && (!estado || c.estado === estado);
            });
            alvo.innerHTML = filtradas.length
                ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Conta</th><th>Cliente</th><th>Tipo</th><th>Saldo</th><th>Estado</th><th>Ação</th></tr></thead><tbody>${filtradas.map(c => `<tr><td><strong>${escaparHTML(c.numero_conta)}</strong></td><td>${escaparHTML(c.cliente_nome)}</td><td>${escaparHTML(c.tipo_conta)}</td><td>${moeda(c.saldo)}</td><td><span class="status-badge ${c.estado === 'ATIVA' ? 'active' : 'inactive'}">${escaparHTML(c.estado)}</span></td><td><button type="button" class="table-action" data-conta-view="${c.id}">Ver / histórico</button></td></tr>`).join('')}</tbody></table></div>`
                : '<div class="empty-state compact">Nenhuma conta encontrada.</div>';
            alvo.querySelectorAll('[data-conta-view]').forEach(btn => btn.addEventListener('click', () => abrirConta(btn.dataset.contaView)));
        } catch (error) {
            alvo.innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        }
    }

    await carregarTabelaContas();
}

async function abrirConta(id) {
    try {
        const dados = await apiJSON(`/api/operacoes/contas/${encodeURIComponent(id)}`);
        const conta = dados.conta;
        const historico = (await apiJSON(`/api/operacoes/contas/${encodeURIComponent(id)}/historico`)).movimentos || [];
        mostrarModal(`
            <div class="modal-header"><div><span class="welcome-label">FICHA DA CONTA</span><h2>${escaparHTML(conta.numero_conta)}</h2><p>${escaparHTML(conta.cliente_nome)} · ${escaparHTML(conta.tipo_conta)}</p></div><button class="modal-close" data-close-modal>×</button></div>
            <div class="detail-grid">
                ${detalhe('Cliente', `${conta.numero_cliente} — ${conta.cliente_nome}`)}
                ${detalhe('NIF', conta.cliente_nif || '—')}
                ${detalhe('Tipo', conta.tipo_conta)}
                ${detalhe('Saldo', moeda(conta.saldo))}
                ${detalhe('Estado', conta.estado)}
                ${detalhe('Abertura', formatarDataHora(conta.data_abertura))}
            </div>
            <div class="panel-header"><div><span>MOVIMENTOS</span><h2>Histórico da conta</h2></div></div>
            <div class="table-container">${historico.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Operação</th><th>Valor</th><th>Saldo</th><th>Referência</th></tr></thead><tbody>${historico.map(m=>`<tr><td>${formatarDataHora(m.criado_em)}</td><td>${escaparHTML(m.tipo)}</td><td>${moeda(m.valor)}</td><td>${moeda(m.saldo_posterior)}</td><td>${escaparHTML(m.referencia || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state compact">Nenhum movimento registado.</div>'}</div>
            <div class="modal-actions full">
                <button type="button" class="secondary-action" id="imprimirContaFicha">Emitir ficha</button>
                ${window.PRISMA_MODULES.permitido(obterSessao(), 'DOCUMENTOS_VISUALIZAR') ? '<button type="button" class="primary-action" id="emitirExtratoConta">Extrato PDF</button>' : ''}
                <button type="button" class="secondary-action" data-close-modal>Fechar</button>
            </div>
        `);
        document.getElementById('imprimirContaFicha')?.addEventListener('click',()=>imprimirComprovativo('Ficha de conta', [['Nº Conta',conta.numero_conta],['Cliente',conta.cliente_nome],['Tipo',conta.tipo_conta],['Saldo',moeda(conta.saldo)],['Estado',conta.estado]]));
        document.getElementById('emitirExtratoConta')?.addEventListener('click', async () => {
            try {
                await window.PRISMA_MODULES.abrirPDF(`/api/documentos/extrato/${encodeURIComponent(id)}.pdf`, `extrato-${conta.numero_conta}.pdf`);
            } catch (error) {
                mostrarToast(error.message || 'Não foi possível gerar o extrato.', 'error');
            }
        });
    } catch(error){ mostrarToast(error.message,'error'); }
}

/* =========================================================
   MOVIMENTOS / HISTÓRICO
   ========================================================= */

async function renderMovimentosReal(main, utilizador) {
    const [clientes, contas] = await Promise.all([carregarClientesOptions(), carregarContasOptions()]);
    const clienteItems = clientesParaPicker(clientes);
    const contaItems = contasParaPicker(contas);

    main.innerHTML = layoutModuloReal('Movimentos', 'PRISMA / OPERAÇÕES / MOVIMENTOS', `
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>HISTÓRICO</span><h2>Consultar movimentos</h2></div></div>
            <div class="form-grid">
                ${criarSeletorPesquisa({ id:'movCliente', name:'clienteId', label:'Cliente', placeholder:'Pesquisar cliente...', itens:clienteItems, obrigatorio:false })}
                ${criarSeletorPesquisa({ id:'movConta', name:'contaId', label:'Conta', placeholder:'Pesquisar conta...', itens:contaItems, obrigatorio:false })}
                <div class="form-field"><label for="movTipo">Operação</label><select id="movTipo"><option value="">Todas</option><option value="DEPOSITO">Depósito</option><option value="LEVANTAMENTO">Levantamento</option><option value="TRANSFERENCIA_ENVIADA">Transferência enviada</option><option value="TRANSFERENCIA_RECEBIDA">Transferência recebida</option><option value="PAGAMENTO_SERVICO">Pagamento de serviço</option><option value="DEPOSITO_INICIAL">Depósito inicial</option></select></div>
                <div class="form-field"><label for="movPesquisa">Pesquisa</label><input id="movPesquisa" type="search" placeholder="Referência, descrição, conta..."></div>
            </div>
            <div id="movimentosTable" class="table-container"><div class="loading-state">A carregar...</div></div>
        </section>
    `, utilizador);

    ativarSeletorPesquisa({ id:'movCliente', itens:clienteItems, onSelect: item => { if (item) { document.getElementById('movContaValue').value=''; document.getElementById('movContaInput').value=''; } render(); } });
    ativarSeletorPesquisa({ id:'movConta', itens:contaItems, onSelect: () => render() });

    const tipo = document.getElementById('movTipo');
    const pesquisa = document.getElementById('movPesquisa');
    tipo?.addEventListener('change', render);
    pesquisa?.addEventListener('input', render);

    let movimentos = [];
    try {
        movimentos = (await apiJSON('/api/operacoes/movimentos')).movimentos || [];
    } catch (error) {
        document.getElementById('movimentosTable').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        return;
    }

    function render() {
        const clienteId = document.getElementById('movClienteValue')?.value || '';
        const contaId = document.getElementById('movContaValue')?.value || '';
        const tipoValor = tipo?.value || '';
        const termo = String(pesquisa?.value || '').trim().toLocaleLowerCase('pt-PT');

        const contaIdsDoCliente = clienteId
            ? contas.filter(c => String(c.cliente_id) === String(clienteId)).map(c => String(c.id))
            : null;

        const filtrados = movimentos.filter(m => {
            const texto = `${m.numero_conta || ''} ${m.cliente_nome || ''} ${m.tipo || ''} ${m.referencia || ''} ${m.descricao || ''}`.toLocaleLowerCase('pt-PT');
            return (!contaId || String(m.conta_id) === String(contaId))
                && (!contaIdsDoCliente || contaIdsDoCliente.includes(String(m.conta_id)))
                && (!tipoValor || m.tipo === tipoValor)
                && (!termo || texto.includes(termo));
        });

const alvo = document.getElementById('movimentosTable');
if (!alvo) return;

if (!filtrados.length) {
    alvo.innerHTML = `
        <div class="empty-state compact">
            <strong>Nenhum movimento encontrado.</strong>
            <p>Use F2 para selecionar um cliente ou conta existente.</p>
        </div>
    `;
    return;
}

/*
 * Configuração visual dos tipos de movimento.
 * O valor armazenado na BD é positivo.
 * O sinal apresentado depende do tipo da operação.
 */
function configurarMovimento(tipo) {
    const mapa = {
        DEPOSITO: {
            classe: 'entrada',
            sinal: '+',
            label: 'Depósito'
        },
        DEPOSITO_INICIAL: {
            classe: 'entrada',
            sinal: '+',
            label: 'Depósito inicial'
        },
        LEVANTAMENTO: {
            classe: 'saida',
            sinal: '−',
            label: 'Levantamento'
        },
        TRANSFERENCIA_RECEBIDA: {
            classe: 'entrada',
            sinal: '+',
            label: 'Transferência recebida'
        },
        TRANSFERENCIA_ENVIADA: {
            classe: 'saida-transferencia',
            sinal: '−',
            label: 'Transferência enviada'
        },
        PAGAMENTO_SERVICO: {
            classe: 'saida',
            sinal: '−',
            label: 'Pagamento de serviço'
        }
    };

    return mapa[tipo] || {
        classe: 'neutro',
        sinal: '',
        label: String(tipo || 'Movimento').replaceAll('_', ' ')
    };
}

/*
 * Iniciais do cliente.
 * Ex.: João Manuel -> JM
 */
function iniciaisCliente(nome) {
    const partes = String(nome || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!partes.length) return '—';

    if (partes.length === 1) {
        return partes[0].substring(0, 2).toUpperCase();
    }

    return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

/*
 * Apenas 13 movimentos ficam visíveis.
 * Os restantes continuam dentro da área com scroll.
 */
const movimentosVisiveis = filtrados.slice(0, 13);

const linhas = movimentosVisiveis.map(m => {
    const config = configurarMovimento(m.tipo);
    const valorNumerico = Number(m.valor || 0);

    const valorFormatado = `${config.sinal}${moeda(valorNumerico)}`;

    const nomeCliente = m.cliente_nome || 'Cliente não identificado';
    const iniciais = iniciaisCliente(nomeCliente);

    return `
        <tr
            class="movement-row"
            data-movimento-index="${movimentos.indexOf(m)}"
            tabindex="0"
            title="Clique para consultar o movimento e emitir comprovativo"
        >
            <td class="movimento-data">
                <span>${escaparHTML(formatarDataHora(m.criado_em))}</span>
            </td>

            <td>
                <strong class="movimento-conta">
                    ${escaparHTML(m.numero_conta || '—')}
                </strong>
            </td>

            <td>
                <div class="movimento-cliente">
                    <span class="movimento-avatar">
                        ${escaparHTML(iniciais)}
                    </span>

                    <span class="movimento-cliente-nome">
                        ${escaparHTML(nomeCliente)}
                    </span>
                </div>
            </td>

            <td>
                <span class="movimento-tipo ${config.classe}">
                    ${escaparHTML(config.label)}
                </span>
            </td>

            <td>
                <strong class="movimento-valor ${config.classe}">
                    ${escaparHTML(valorFormatado)}
                </strong>
            </td>

            <td>
                <span class="movimento-saldo">
                    ${escaparHTML(moeda(m.saldo_posterior))}
                </span>
            </td>

            <td>
                <span class="movimento-referencia">
                    ${escaparHTML(m.referencia || '—')}
                </span>
            </td>
        </tr>
    `;
}).join('');

/*
 * Totais calculados sobre TODOS os movimentos filtrados,
 * não apenas sobre as 13 linhas visíveis.
 */
const totalDepositos = filtrados.reduce((total, m) => {
    if (['DEPOSITO', 'DEPOSITO_INICIAL', 'TRANSFERENCIA_RECEBIDA'].includes(m.tipo)) {
        return total + Number(m.valor || 0);
    }

    return total;
}, 0);

const totalLevantamentos = filtrados.reduce((total, m) => {
    if (['LEVANTAMENTO', 'TRANSFERENCIA_ENVIADA', 'PAGAMENTO_SERVICO'].includes(m.tipo)) {
        return total + Number(m.valor || 0);
    }

    return total;
}, 0);

/*
 * O saldo final só é apresentado quando existe uma única conta
 * no contexto atual. Assim evitamos somar saldos de contas diferentes.
 */
let saldoFinal = null;

if (contaId) {
    saldoFinal = filtrados.length
        ? Number(filtrados[0].saldo_posterior || 0)
        : null;
} else {
    const contasPresentes = [...new Set(
        filtrados.map(m => String(m.conta_id))
    )];

    if (contasPresentes.length === 1 && filtrados.length) {
        saldoFinal = Number(filtrados[0].saldo_posterior || 0);
    }
}

const saldoFinalHTML = saldoFinal !== null
    ? moeda(saldoFinal)
    : 'Selecione uma conta';

/*
 * Renderização final.
 */
alvo.innerHTML = `
    <div class="movimentos-table-scroll">
        <table class="data-table movimentos-data-table">
            <thead>
                <tr>
                    <th>Data / Hora</th>
                    <th>Conta</th>
                    <th>Cliente</th>
                    <th>Operação</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Referência</th>
                </tr>
            </thead>

            <tbody>
                ${linhas}
            </tbody>
        </table>
    </div>

    <div class="movimentos-info">
        <span>
            A mostrar <strong>${movimentosVisiveis.length}</strong>
            de <strong>${filtrados.length}</strong> movimento(s)
        </span>
        ${
            filtrados.length > 13
                ? '<span>Use o scroll vertical para consultar os restantes.</span>'
                : ''
        }
    </div>

    <div class="movimentos-resumo">

        <div class="movimento-resumo-card entrada">
            <span>Total Depósitos</span>
            <strong>+${escaparHTML(moeda(totalDepositos))}</strong>
        </div>

        <div class="movimento-resumo-card saida">
            <span>Total Levantamentos</span>
            <strong>−${escaparHTML(moeda(totalLevantamentos))}</strong>
        </div>

        <div class="movimento-resumo-card saldo">
            <span>Saldo Final</span>
            <strong>${escaparHTML(saldoFinalHTML)}</strong>
        </div>

    </div>
`;
        alvo.querySelectorAll('[data-movimento-index]').forEach(row => {
            const abrir = () => {
                const movimento = movimentos[Number(row.dataset.movimentoIndex)];
                if (movimento) abrirDetalheMovimento(movimento);
            };
            row.addEventListener('click', abrir);
            row.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    abrir();
                }
            });
        });
    }

    render();
}

/* =========================================================
   DETALHE / COMPROVATIVO DE MOVIMENTO
   ========================================================= */

function abrirDetalheMovimento(movimento) {
    const tipo = movimento.tipo || 'MOVIMENTO';
    const valor = moeda(movimento.valor);
    const saldo = moeda(movimento.saldo_posterior);
    const referencia = movimento.referencia || '—';

    mostrarModal(`
        <div class="modal-header">
            <div>
                <span class="welcome-label">DETALHE DA OPERAÇÃO</span>
                <h2>${escaparHTML(tipo.replaceAll('_', ' '))}</h2>
                <p>${escaparHTML(referencia)}</p>
            </div>
            <button type="button" class="modal-close" data-close-modal>×</button>
        </div>

        <div class="movement-detail-highlight">
            <span>VALOR DA OPERAÇÃO</span>
            <strong>${escaparHTML(valor)}</strong>
            <small>${escaparHTML(movimento.criado_em ? formatarDataHora(movimento.criado_em) : 'Data não disponível')}</small>
        </div>

        <div class="detail-grid">
            ${detalhe('Referência', referencia)}
            ${detalhe('Nº Conta', movimento.numero_conta || '—')}
            ${detalhe('Cliente', movimento.cliente_nome || '—')}
            ${detalhe('Tipo', tipo.replaceAll('_', ' '))}
            ${detalhe('Saldo após operação', saldo)}
            ${detalhe('Descrição', movimento.descricao || '—')}
        </div>

        <div class="receipt-info-box">
            <strong>Comprovativo da operação</strong>
            <p>Este documento apresenta os dados registados no ambiente de formação. A emissão não altera o movimento nem o saldo.</p>
        </div>

        <div class="modal-actions full">
            <button type="button" class="primary-action" id="emitirComprovativoMovimento">
                Emitir comprovativo
            </button>
            <button type="button" class="secondary-action" data-close-modal>
                Fechar
            </button>
        </div>
    `);

    document.getElementById('emitirComprovativoMovimento')?.addEventListener('click', () => {
        imprimirComprovativoMovimento(movimento);
    });
}

/* =========================================================
   CAIXA
   ========================================================= */

async function renderCaixaReal(main, utilizador) {
    const contas = await carregarContasOptions();
    const contaItems = contasParaPicker(contas);

    main.innerHTML = layoutModuloReal('Caixa', 'PRISMA / OPERAÇÕES / CAIXA', `
        <div class="module-tabs">
            <button type="button" class="module-tab active" data-caixa-tab="movimento">Operação de caixa</button>
            <button type="button" class="module-tab" data-caixa-tab="servico">Pagamento de serviços</button>
            <button type="button" class="module-tab" data-caixa-tab="resumo">Resumo</button>
            <button type="button" class="module-tab" data-caixa-tab="historico">Histórico</button>
            <button type="button" class="module-tab" data-caixa-tab="fecho">Conferência / Fecho</button>
        </div>
        <div id="caixaContent"></div>
    `, utilizador);

    const content = document.getElementById('caixaContent');

    async function renderTab(tab) {
        document.querySelectorAll('[data-caixa-tab]').forEach(button => button.classList.toggle('active', button.dataset.caixaTab === tab));

        if (tab === 'movimento') {
            content.innerHTML = `
                <section class="dashboard-panel">
                    <div class="panel-header"><div><span>CAIXA</span><h2>Depósito / Levantamento</h2></div></div>
                    <form id="caixaForm" class="form-grid">
                        <div class="form-field"><label>Operação *</label><select name="tipo"><option value="DEPOSITO">Depósito em numerário</option><option value="LEVANTAMENTO">Levantamento</option></select></div>
                        ${criarSeletorPesquisa({ id:'caixaConta', name:'contaId', label:'Conta', placeholder:'Pesquisar conta, cliente ou nº...', itens:contaItems })}
                        <div class="form-field"><label>Valor (Kz) *</label><input name="valor" type="number" min="0.01" step="0.01" required></div>
                        <div class="form-field full"><label>Descrição</label><input name="descricao"></div>
                        <div class="modal-actions full"><button class="primary-action" type="submit">Executar operação</button></div>
                    </form>
                    <div id="caixaResult"></div>
                </section>
            `;
            ativarSeletorPesquisa({ id:'caixaConta', itens:contaItems });
            document.getElementById('caixaForm')?.addEventListener('submit', async event => {
                event.preventDefault();
                const form = event.currentTarget;
                const dados = new FormData(form);
                if (!dados.get('contaId')) {
                    mostrarToast('Selecione uma conta com F2.', 'error');
                    return;
                }
                const confirmado = await confirmarOperacao(
                    dados.get('tipo') === 'DEPOSITO' ? 'Confirmar depósito' : 'Confirmar levantamento',
                    `${dados.get('tipo') === 'DEPOSITO' ? 'Depositar' : 'Levantar'} ${moeda(dados.get('valor'))} na conta selecionada?`
                );
                if (!confirmado) return;

                const botao = form.querySelector('button[type=submit]');
                if (botao) botao.disabled = true;
                try {
                    const resposta = await apiJSON('/api/operacoes/caixa', {
                        method:'POST',
                        body:JSON.stringify({
                            tipo:dados.get('tipo'),
                            contaId:dados.get('contaId'),
                            valor:Number(dados.get('valor')),
                            descricao:dados.get('descricao')
                        })
                    });
                    document.getElementById('caixaResult').innerHTML = `<div class="success-state"><strong>Operação concluída.</strong><p>Novo saldo: ${moeda(resposta.saldo)} · Referência: ${escaparHTML(resposta.movimento.referencia)}</p><button type="button" class="secondary-action" id="imprimirCaixaRecibo">Emitir recibo</button></div>`;
                    document.getElementById('imprimirCaixaRecibo')?.addEventListener('click', () => imprimirComprovativo('Recibo de caixa', [['Operação', dados.get('tipo')],['Conta', contaItems.find(i => String(i.value) === String(dados.get('contaId')))?.label || '—'],['Valor', moeda(dados.get('valor'))],['Saldo após operação', moeda(resposta.saldo)],['Referência', resposta.movimento.referencia]]));
                    form.reset();
                    document.getElementById('caixaContaValue').value='';
                    document.getElementById('caixaContaInput').value='';
                } catch (error) {
                    document.getElementById('caixaResult').innerHTML = `<div class="error-state"><strong>Operação não concluída.</strong><p>${escaparHTML(error.message)}</p></div>`;
                    mostrarToast(error.message, 'error');
                } finally {
                    const botao = form.querySelector('button[type=submit]');
                    if (botao) botao.disabled = false;
                }
            });
        }

        if (tab === 'servico') {
            content.innerHTML = `
                <section class="dashboard-panel">
                    <div class="panel-header"><div><span>PAGAMENTOS</span><h2>Pagamento de serviços</h2></div></div>
                    <form id="servicoForm" class="form-grid">
                        ${criarSeletorPesquisa({ id:'servicoConta', name:'contaId', label:'Conta', placeholder:'Pesquisar conta ou cliente...', itens:contaItems })}
                        <div class="form-field"><label>Entidade *</label><input name="entidade" required placeholder="Ex.: ENDE, EPAL, Unitel..."></div>
                        <div class="form-field"><label>Referência do serviço *</label><input name="referenciaServico" required></div>
                        <div class="form-field"><label>Valor (Kz) *</label><input name="valor" type="number" min="0.01" step="0.01" required></div>
                        <div class="form-field"><label>Comissão (Kz)</label><input name="comissao" type="number" min="0" step="0.01" value="0"></div>
                        <div class="modal-actions full"><button class="primary-action" type="submit">Pagar serviço</button></div>
                    </form>
                    <div id="servicoResult"></div>
                </section>
            `;
            ativarSeletorPesquisa({ id:'servicoConta', itens:contaItems });
            document.getElementById('servicoForm')?.addEventListener('submit', async event => {
                event.preventDefault();
                const form = event.currentTarget;
                const dados = new FormData(form);
                if (!dados.get('contaId')) { mostrarToast('Selecione uma conta com F2.', 'error'); return; }
                try {
                    const resposta = await apiJSON('/api/operacoes/pagamentos-servicos', {
                        method:'POST',
                        body:JSON.stringify({
                            contaId:dados.get('contaId'), entidade:dados.get('entidade'), referenciaServico:dados.get('referenciaServico'),
                            valor:Number(dados.get('valor')), comissao:Number(dados.get('comissao') || 0)
                        })
                    });
                    document.getElementById('servicoResult').innerHTML = `<div class="success-state"><strong>Pagamento realizado.</strong><p>Saldo: ${moeda(resposta.saldo)} · Referência: ${escaparHTML(resposta.movimento.referencia)}</p><button type="button" class="secondary-action" id="imprimirServico">Emitir comprovativo</button></div>`;
                    document.getElementById('imprimirServico')?.addEventListener('click', () => imprimirComprovativo('Pagamento de serviço', [['Entidade', dados.get('entidade')],['Referência do serviço', dados.get('referenciaServico')],['Valor', moeda(dados.get('valor'))],['Comissão', moeda(dados.get('comissao'))],['Saldo após operação', moeda(resposta.saldo)],['Referência', resposta.movimento.referencia]]));
                    form.reset();
                    document.getElementById('servicoContaValue').value='';
                    document.getElementById('servicoContaInput').value='';
                } catch (error) {
                    document.getElementById('servicoResult').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
                }
            });
        }

        if (tab === 'resumo') {
            content.innerHTML = `
                <section class="dashboard-panel">
                    <div class="panel-header"><div><span>POSIÇÃO DE CAIXA</span><h2>Resumo operacional</h2></div><button type="button" class="secondary-action" id="refreshCaixaResumo">Atualizar</button></div>
                    <div class="dashboard-cards">
                        <article class="dashboard-card"><div class="card-icon">Kz</div><div><span>SALDO DE CAIXA</span><strong id="caixaSaldoResumo">A carregar...</strong></div></article>
                        <article class="dashboard-card"><div class="card-icon">↓</div><div><span>ENTRADAS HOJE</span><strong id="caixaEntradasResumo">A carregar...</strong></div></article>
                        <article class="dashboard-card"><div class="card-icon">↑</div><div><span>SAÍDAS HOJE</span><strong id="caixaSaidasResumo">A carregar...</strong></div></article>
                        <article class="dashboard-card"><div class="card-icon">#</div><div><span>OPERAÇÕES HOJE</span><strong id="caixaOperacoesResumo">A carregar...</strong></div></article>
                    </div>
                    <div id="caixaUltimoFecho"></div>
                </section>
            `;
            async function carregarResumo() {
                try {
                    const dados = await apiJSON('/api/operacoes/caixa/resumo');
                    document.getElementById('caixaSaldoResumo').textContent = moeda(dados.resumo.saldo);
                    document.getElementById('caixaEntradasResumo').textContent = moeda(dados.resumo.entradas);
                    document.getElementById('caixaSaidasResumo').textContent = moeda(dados.resumo.saidas);
                    document.getElementById('caixaOperacoesResumo').textContent = dados.resumo.operacoes;
                    const f = dados.ultimoFecho;
                    document.getElementById('caixaUltimoFecho').innerHTML = f
                        ? `<div class="session-details"><div><span>Último fecho</span><strong>${formatarDataHora(f.criado_em)}</strong></div><div><span>Estado</span><strong>${escaparHTML(f.estado)}</strong></div><div><span>Saldo sistema</span><strong>${moeda(f.saldo_sistema)}</strong></div><div><span>Diferença</span><strong>${moeda(f.diferenca)}</strong></div></div>`
                        : '<div class="empty-state compact">Ainda não existe um fecho de caixa registado.</div>';
                } catch(error) { document.getElementById('caixaUltimoFecho').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`; }
            }
            document.getElementById('refreshCaixaResumo')?.addEventListener('click', carregarResumo);
            await carregarResumo();
        }

        if (tab === 'historico') {
            content.innerHTML = `
                <section class="dashboard-panel">
                    <div class="panel-header"><div><span>RASTREABILIDADE</span><h2>Histórico de caixa</h2></div></div>
                    <div id="historicoCaixaTable" class="table-container"><div class="loading-state">A carregar histórico...</div></div>
                </section>
            `;
            try {
                const dados = await apiJSON('/api/operacoes/caixa/historico');
                const rows = dados.operacoes || [];
                document.getElementById('historicoCaixaTable').innerHTML = rows.length
                    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Referência</th><th>Operação</th><th>Conta</th><th>Cliente</th><th>Valor</th><th>Saldo caixa</th><th>Operador</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${formatarDataHora(r.criado_em)}</td><td>${escaparHTML(r.referencia)}</td><td>${escaparHTML(r.tipo)}</td><td>${escaparHTML(r.numero_conta || '—')}</td><td>${escaparHTML(r.cliente_nome || '—')}</td><td>${moeda(r.valor)}</td><td>${moeda(r.saldo_caixa_posterior)}</td><td>${escaparHTML(r.operador || '—')}</td></tr>`).join('')}</tbody></table></div>`
                    : '<div class="empty-state compact">Nenhuma operação de caixa registada.</div>';
            } catch(error) { document.getElementById('historicoCaixaTable').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`; }
        }

        if (tab === 'fecho') {
            content.innerHTML = `
                <section class="dashboard-panel">
                    <div class="panel-header"><div><span>CONFERÊNCIA</span><h2>Conferência e fecho de caixa</h2></div></div>
                    <form id="fechoForm" class="form-grid">
                        <div class="form-field"><label>Saldo físico contado (Kz) *</label><input name="saldoFisico" type="number" step="0.01" required></div>
                        <div class="form-field"><label>Observações</label><input name="observacoes"></div>
                        <div class="modal-actions full"><button class="primary-action" type="submit">Conferir e fechar caixa</button></div>
                    </form>
                    <div id="fechoResult"></div>
                </section>
            `;
            document.getElementById('fechoForm')?.addEventListener('submit', async event => {
                event.preventDefault();
                const form = event.currentTarget;
                const dados = new FormData(form);
                try {
                    const resposta = await apiJSON('/api/operacoes/caixa/fecho', {
                        method:'POST',
                        body:JSON.stringify({ saldoFisico:Number(dados.get('saldoFisico')), observacoes:dados.get('observacoes') })
                    });
                    const fecho = resposta.fecho;
                    const estado = fecho.estado === 'CONFERIDO' ? 'success-state' : 'error-state';
                    document.getElementById('fechoResult').innerHTML = `<div class="${estado}"><strong>${escaparHTML(fecho.estado)}</strong><p>Saldo sistema: ${moeda(fecho.saldo_sistema)} · Saldo físico: ${moeda(fecho.saldo_fisico)} · Diferença: ${moeda(fecho.diferenca)}</p><button type="button" class="secondary-action" id="imprimirFecho">Emitir comprovativo de fecho</button></div>`;
                    document.getElementById('imprimirFecho')?.addEventListener('click', () => imprimirComprovativo('Fecho de caixa', [['Saldo sistema', moeda(fecho.saldo_sistema)],['Saldo físico', moeda(fecho.saldo_fisico)],['Diferença', moeda(fecho.diferenca)],['Estado', fecho.estado],['Observações', fecho.observacoes || '—']]));
                } catch (error) {
                    document.getElementById('fechoResult').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
                }
            });
        }
    }

    document.querySelectorAll('[data-caixa-tab]').forEach(button => button.addEventListener('click', () => renderTab(button.dataset.caixaTab)));
    await renderTab('movimento');
}

/* =========================================================
   TRANSFERÊNCIAS
   ========================================================= */

async function renderTransferenciasReal(main, utilizador) {
    const contas = await carregarContasOptions();
    const contaItems = contasParaPicker(contas);

    main.innerHTML = layoutModuloReal('Transferências', 'PRISMA / OPERAÇÕES / TRANSFERÊNCIAS', `
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>TRANSFERÊNCIA</span><h2>Nova transferência</h2></div></div>
            <form id="trfForm" class="form-grid">
                ${criarSeletorPesquisa({ id:'trfOrigem', name:'origemId', label:'Conta de origem', placeholder:'Pesquisar conta ou cliente...', itens:contaItems })}
                ${criarSeletorPesquisa({ id:'trfDestino', name:'destinoId', label:'Conta de destino (mesmo banco)', placeholder:'Pesquisar conta ou cliente...', itens:contaItems, obrigatorio:false })}
                <div class="form-field"><label>Tipo</label><select name="tipo"><option value="NACIONAL">Nacional</option><option value="INTERBANCARIA">Outro banco</option></select></div>
                <div class="form-field"><label>Modalidade</label><select name="modalidade"><option value="IMEDIATA">Imediata</option><option value="AGENDADA">Agendada</option></select></div>
                <div class="form-field"><label>Banco de destino</label><input name="bancoDestino" placeholder="Necessário para transferência interbancária"></div>
                <div class="form-field"><label>Data agendada</label><input name="dataAgendada" type="datetime-local"></div>
                <div class="form-field"><label>Valor (Kz) *</label><input name="valor" type="number" min="0.01" step="0.01" required></div>
                <div class="form-field"><label>Comissão (Kz)</label><input name="comissao" type="number" min="0" step="0.01" value="0"></div>
                <div class="form-field full"><label>Descrição</label><input name="descricao"></div>
                <div class="modal-actions full"><button class="primary-action" type="submit">Registar transferência</button></div>
            </form>
            <div id="trfResult"></div>
        </section>
        <section class="dashboard-panel"><div class="panel-header"><div><span>INFORMAÇÃO</span><h2>Regras da simulação</h2></div></div><div class="session-details"><div><span>Interna</span><strong>Conta de destino selecionada</strong></div><div><span>Interbancária</span><strong>Banco de destino obrigatório</strong></div><div><span>Agendada</span><strong>Registo fica pendente para execução</strong></div><div><span>Comprovativo</span><strong>Disponível após conclusão</strong></div></div></section>
    `, utilizador);

    ativarSeletorPesquisa({ id:'trfOrigem', itens:contaItems });
    ativarSeletorPesquisa({ id:'trfDestino', itens:contaItems });

    const tipoTransferencia = document.querySelector('#trfForm [name=tipo]');
    const modalidadeTransferencia = document.querySelector('#trfForm [name=modalidade]');
    const destinoPicker = document.getElementById('trfDestinoPicker')?.closest('.searchable-field');
    const bancoInput = document.querySelector('#trfForm [name=bancoDestino]');
    const dataInput = document.querySelector('#trfForm [name=dataAgendada]');

    function atualizarCamposTransferencia() {
        const interbancaria = tipoTransferencia?.value === 'INTERBANCARIA';
        const agendada = modalidadeTransferencia?.value === 'AGENDADA';
        if (destinoPicker) destinoPicker.style.display = interbancaria ? 'none' : '';
        const destinoValue = document.getElementById('trfDestinoValue');
        const destinoInput = document.getElementById('trfDestinoInput');
        if (interbancaria) {
            if (destinoValue) destinoValue.value = '';
            if (destinoInput) destinoInput.value = '';
        }
        if (bancoInput) bancoInput.required = interbancaria;
        if (dataInput) dataInput.required = agendada;
    }
    tipoTransferencia?.addEventListener('change', atualizarCamposTransferencia);
    modalidadeTransferencia?.addEventListener('change', atualizarCamposTransferencia);
    atualizarCamposTransferencia();

    document.getElementById('trfForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const dados = new FormData(form);
        const tipo = dados.get('tipo');
        const modalidade = dados.get('modalidade');
        if (!dados.get('origemId')) { mostrarToast('Selecione a conta de origem com F2.', 'error'); return; }
        if (tipo === 'NACIONAL' && !dados.get('destinoId')) { mostrarToast('Selecione a conta de destino com F2.', 'error'); return; }
        if (tipo === 'INTERBANCARIA' && !String(dados.get('bancoDestino') || '').trim()) { mostrarToast('Indique o banco de destino.', 'error'); return; }
        if (modalidade === 'AGENDADA' && !dados.get('dataAgendada')) { mostrarToast('Indique a data da transferência agendada.', 'error'); return; }
        if (tipo === 'NACIONAL' && dados.get('origemId') === dados.get('destinoId')) { mostrarToast('A conta de destino deve ser diferente da origem.', 'error'); return; }

        const contaOrigemLabel = contaItems.find(i => String(i.value) === String(dados.get('origemId')))?.label || 'Conta selecionada';
        const contaDestinoLabel = contaItems.find(i => String(i.value) === String(dados.get('destinoId')))?.label || (tipo === 'INTERBANCARIA' ? String(dados.get('bancoDestino') || 'Outro banco') : 'Conta de destino');
        const confirmado = await confirmarOperacao(
            'Confirmar transferência',
            `Transferir ${moeda(dados.get('valor'))} de ${contaOrigemLabel} para ${contaDestinoLabel}?`
        );
        if (!confirmado) return;

        const botao = form.querySelector('button[type=submit]');
        if (botao) botao.disabled = true;
        try {
            const resposta = await apiJSON('/api/operacoes/transferencias', {
                method:'POST',
                body:JSON.stringify({
                    origemId:dados.get('origemId'), destinoId:dados.get('destinoId') || null,
                    bancoDestino:dados.get('bancoDestino'), tipo:dados.get('tipo'), modalidade:dados.get('modalidade'),
                    valor:Number(dados.get('valor')), comissao:Number(dados.get('comissao') || 0), descricao:dados.get('descricao'),
                    dataAgendada:dados.get('dataAgendada') || null
                })
            });

            const transferencia = resposta.transferencia;
            document.getElementById('trfResult').innerHTML = `<div class="success-state"><strong>Transferência ${escaparHTML(transferencia.referencia)} registada.</strong><p>Estado: ${escaparHTML(transferencia.estado)} · Valor: ${moeda(transferencia.valor)}</p><button type="button" class="secondary-action" id="imprimirTransferencia">Emitir comprovativo</button></div>`;
            document.getElementById('imprimirTransferencia')?.addEventListener('click', () => imprimirComprovativo('Comprovativo de transferência', [['Referência', transferencia.referencia],['Tipo', transferencia.tipo],['Modalidade', transferencia.modalidade],['Valor', moeda(transferencia.valor)],['Comissão', moeda(transferencia.comissao)],['Estado', transferencia.estado]]));
            form.reset();
            ['trfOrigem','trfDestino'].forEach(id => { document.getElementById(`${id}Value`).value=''; document.getElementById(`${id}Input`).value=''; });
        } catch (error) {
            document.getElementById('trfResult').innerHTML = `<div class="error-state"><strong>Transferência não concluída.</strong><p>${escaparHTML(error.message)}</p></div>`;
            mostrarToast(error.message, 'error');
        } finally {
            const botao = form.querySelector('button[type=submit]');
            if (botao) botao.disabled = false;
        }
    });
}

/* =========================================================
   CRÉDITO
   ========================================================= */

async function renderCreditoReal(main, utilizador) {
    const clientes = await carregarClientesOptions();
    const clienteItems = clientesParaPicker(clientes);

    main.innerHTML = layoutModuloReal('Crédito', 'PRISMA / OPERAÇÕES / CRÉDITO', `
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>SIMULAÇÃO</span><h2>Proposta de crédito</h2></div></div>
            <form id="credForm" class="form-grid">
                ${criarSeletorPesquisa({ id:'credCliente', name:'clienteId', label:'Cliente', placeholder:'Pesquisar nº, nome, NIF ou telefone...', itens:clienteItems })}
                <div class="form-field"><label>Tipo</label><select name="tipoCredito"><option value="PESSOAL">Crédito pessoal</option><option value="AUTOMOVEL">Crédito automóvel</option><option value="HABITACAO">Crédito habitação</option><option value="EMPRESA">Crédito para empresas</option></select></div>
                <div class="form-field"><label>Valor solicitado</label><input name="valorSolicitado" type="number" min="0.01" step="0.01" required></div>
                <div class="form-field"><label>Prazo (meses)</label><input name="prazoMeses" type="number" min="1" required></div>
                <div class="form-field"><label>Taxa anual (%)</label><input name="taxaJuro" type="number" min="0" step="0.01" value="10" required></div>
                <div class="form-field"><label>Rendimento mensal</label><input name="rendimento" type="number" min="0" step="0.01" required></div>
                <div class="form-field"><label>Encargos mensais</label><input name="encargos" type="number" min="0" step="0.01" value="0"></div>
                <div class="form-field"><label>Entrada inicial</label><input name="entradaInicial" type="number" min="0" step="0.01" value="0"></div>
                <div class="modal-actions full"><button class="primary-action" type="submit">Calcular crédito</button></div>
            </form>
            <div id="credResult"></div>
        </section>
    `, utilizador);

    ativarSeletorPesquisa({ id:'credCliente', itens:clienteItems });

    document.getElementById('credForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const dados = new FormData(event.currentTarget);
        if (!dados.get('clienteId')) { mostrarToast('Selecione o cliente com F2.', 'error'); return; }
        const payload = Object.fromEntries(dados.entries());

        try {
            const resposta = await apiJSON('/api/operacoes/credito/simular', {
                method:'POST', body:JSON.stringify(payload)
            });
            const s = resposta.simulacao;
            const plano = s.planoAmortizacao || [];
            document.getElementById('credResult').innerHTML = `
                <section class="dashboard-panel credit-result">
                    <div class="panel-header"><div><span>RESULTADO</span><h2>Simulação financeira</h2></div></div>
<div class="dashboard-cards">
    <article class="dashboard-card">
        <div>
            <span>PRESTAÇÃO MENSAL</span>
            <strong>${moeda(s.prestacao)}</strong>
        </div>
    </article>

    <article class="dashboard-card">
        <div>
            <span>JUROS TOTAIS</span>
            <strong>${moeda(s.jurosTotais)}</strong>
        </div>
    </article>

    <article class="dashboard-card">
        <div>
            <span>CAPITAL EM DÍVIDA</span>
            <strong>${moeda(s.capital)}</strong>
        </div>
    </article>

    <article class="dashboard-card">
        <div>
            <span>CAPACIDADE MENSAL DISPONÍVEL</span>
            <strong>${moeda(s.capacidadeMensal)}</strong>
        </div>
    </article>

    <article class="dashboard-card">
        <div>
            <span>ESFORÇO DO NOVO CRÉDITO</span>
            <strong>${Number(s.taxaEsforco || 0).toFixed(2)}%</strong>
        </div>
    </article>

    <article class="dashboard-card">
        <div>
            <span>ESFORÇO TOTAL</span>
            <strong>${Number(s.taxaEsforcoTotal || 0).toFixed(2)}%</strong>
        </div>
    </article>
</div>
                    <div class="table-scroll"><table class="data-table"><thead><tr><th>Mês</th><th>Prestação</th><th>Juros</th><th>Capital</th><th>Saldo</th></tr></thead><tbody>${plano.map(linha => `<tr><td>${linha.mes}</td><td>${moeda(linha.prestacao)}</td><td>${moeda(linha.juros)}</td><td>${moeda(linha.capital)}</td><td>${moeda(linha.saldo)}</td></tr>`).join('')}</tbody></table></div>
                    <div class="modal-actions"><button type="button" class="primary-action" id="guardarCredito">Guardar proposta</button><button type="button" class="secondary-action" id="imprimirCredito">Emitir simulação</button></div>
                </section>
            `;

            document.getElementById('guardarCredito')?.addEventListener('click', async () => {
                try {
                    await apiJSON('/api/operacoes/credito', { method:'POST', body:JSON.stringify(payload) });
                    mostrarToast('Proposta de crédito guardada.', 'success');
                } catch (error) { mostrarToast(error.message, 'error'); }
            });

            document.getElementById('imprimirCredito')?.addEventListener('click', () => imprimirComprovativo('Simulação de crédito', [['Cliente', clienteItems.find(i => String(i.value) === String(payload.clienteId))?.label || '—'],['Tipo', payload.tipoCredito],['Capital', moeda(s.capital)],['Prestação', moeda(s.prestacao)],['Juros totais', moeda(s.jurosTotais)],['Capacidade mensal disponível', moeda(s.capacidadeMensal)],
['Esforço do novo crédito', `${Number(s.taxaEsforco || 0).toFixed(2)}%`],
['Esforço total', `${Number(s.taxaEsforcoTotal || 0).toFixed(2)}%`]]));
        } catch (error) {
            document.getElementById('credResult').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        }
    });
}

/* =========================================================
   RISCO
   ========================================================= */

async function renderRiscoReal(main, utilizador) {
    const clientes = await carregarClientesOptions();
    const clienteItems = clientesParaPicker(clientes);

    main.innerHTML = layoutModuloReal('Análise de risco', 'PRISMA / CRÉDITO / RISCO', `
        <section class="dashboard-panel">
            <div class="panel-header"><div><span>DECISÃO DE CRÉDITO</span><h2>Analisar capacidade financeira</h2></div></div>
            <form id="riscoForm" class="form-grid">
                ${criarSeletorPesquisa({ id:'riscoCliente', name:'clienteId', label:'Cliente', placeholder:'Pesquisar nº, nome, NIF ou telefone...', itens:clienteItems })}
                <div class="form-field"><label>Rendimento mensal</label><input name="rendimento" type="number" min="0" step="0.01" required></div>
                <div class="form-field"><label>Despesas mensais</label><input name="despesas" type="number" min="0" step="0.01" required></div>
                <div class="form-field"><label>Outros créditos</label><input name="outrosCreditos" type="number" min="0" step="0.01" value="0"></div>
                <div class="modal-actions full"><button class="primary-action" type="submit">Analisar risco</button></div>
            </form>
            <div id="riscoResult"></div>
        </section>
    `, utilizador);

    ativarSeletorPesquisa({ id:'riscoCliente', itens:clienteItems });

    document.getElementById('riscoForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const dados = new FormData(event.currentTarget);
        if (!dados.get('clienteId')) { mostrarToast('Selecione o cliente com F2.', 'error'); return; }

        try {
            const resposta = await apiJSON('/api/operacoes/risco', {
                method:'POST',
                body:JSON.stringify(Object.fromEntries(dados.entries()))
            });
            const analise = resposta.analise;
            const classe = analise.decisao === 'APROVAR' ? 'success-state' : analise.decisao === 'APROVAR_COM_CONDICOES' ? 'warning-state' : 'error-state';
            const titulo = analise.decisao === 'APROVAR' ? '✅ Aprovar' : analise.decisao === 'APROVAR_COM_CONDICOES' ? '⚠️ Aprovar com condições' : '❌ Recusar';
            document.getElementById('riscoResult').innerHTML = `<div class="${classe}"><h3>${titulo}</h3><p><strong>Score:</strong> ${Number(analise.score).toFixed(0)}</p><p><strong>Capacidade financeira:</strong> ${moeda(analise.capacidade)}</p><p>${escaparHTML(analise.justificacao)}</p></div>`;
        } catch (error) {
            document.getElementById('riscoResult').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        }
    });
}

/* =========================================================
   NAVEGAÇÃO OPERACIONAL
   ========================================================= */

async function mostrarModuloOperacional(modulo, utilizador) {
    const main = document.querySelector('.dashboard-main');
    if (!main) return;

    const permissoes = utilizador.permissoes || [];
    const required = {
        contas:'CONTAS_VISUALIZAR',
        movimentos:'MOVIMENTOS_VISUALIZAR',
        caixa:'CAIXA_OPERAR',
        transferencias:'TRANSFERENCIAS_OPERAR',
        credito:'CREDITO_SIMULAR',
        risco:'CREDITO_SIMULAR'
    }[modulo];

    if (required && !permissoes.includes(required)) {
        mostrarAvisoModulo('Sem permissão', 'O seu perfil não possui acesso a este módulo.');
        return;
    }

    if (modulo === 'contas') return renderContasReal(main, utilizador);
    if (modulo === 'movimentos') return renderMovimentosReal(main, utilizador);
    if (modulo === 'caixa') return renderCaixaReal(main, utilizador);
    if (modulo === 'transferencias') return renderTransferenciasReal(main, utilizador);
    if (modulo === 'credito') return renderCreditoReal(main, utilizador);
    if (modulo === 'risco') return renderRiscoReal(main, utilizador);

    mostrarModuloGenerico(modulo, utilizador);
}

function layoutModuloReal(titulo, breadcrumb, conteudo, utilizador) {
    return `
        <header class="dashboard-header">
            <div><span class="dashboard-breadcrumb">${escaparHTML(breadcrumb)}</span><h1>${escaparHTML(titulo)}</h1></div>
            ${renderHeaderUser(utilizador)}
        </header>
        <section class="dashboard-content">
            <div class="page-toolbar"><div><span class="welcome-label">PRISMA EDUCACIONAL</span><h2>${escaparHTML(titulo)}</h2><p>Operação educacional em ambiente de simulação.</p></div></div>
            ${conteudo}
        </section>
    `;
}

/* =========================================================
   MÓDULOS AINDA SEM MOTOR ESPECÍFICO
   ========================================================= */

async function renderComprovativosReal(main, utilizador) {
    if (!main) return;
    if (!(utilizador.permissoes || []).includes('COMPROVATIVOS_EMITIR')) {
        mostrarAvisoModulo('Sem permissão', 'O seu perfil não possui acesso aos comprovativos.');
        return;
    }

    main.innerHTML = layoutModuloReal('Comprovativos', 'PRISMA / FORMAÇÃO / COMPROVATIVOS', `
        <section class="dashboard-panel">
            <div class="panel-header">
                <div><span>DOCUMENTAÇÃO</span><h2>Comprovativos emitidos</h2></div>
                <div id="comprovativosCount">—</div>
            </div>
            <div class="clientes-filtros">
                <div class="cliente-search">
                    <label for="comprovativoPesquisa">Pesquisar</label>
                    <input id="comprovativoPesquisa" type="search" placeholder="Nº documento, referência, cliente ou conta...">
                </div>
                <div class="form-field">
                    <label for="comprovativoTipo">Tipo</label>
                    <select id="comprovativoTipo">
                        <option value="">Todos</option>
                        <option value="MOVIMENTO">Movimento</option>
                        <option value="TRANSFERENCIA">Transferência</option>
                        <option value="CAIXA">Caixa</option>
                    </select>
                </div>
            </div>
            <div id="comprovativosTable" class="table-container"><div class="loading-state">A carregar comprovativos...</div></div>
        </section>
    `, utilizador);

    let documentos = [];
    try {
        documentos = (await apiJSON('/api/operacoes/comprovativos')).comprovativos || [];
    } catch (error) {
        document.getElementById('comprovativosTable').innerHTML = `<div class="error-state">${escaparHTML(error.message)}</div>`;
        return;
    }

    const pesquisa = document.getElementById('comprovativoPesquisa');
    const tipo = document.getElementById('comprovativoTipo');
    const alvo = document.getElementById('comprovativosTable');

    function render() {
        const termo = String(pesquisa?.value || '').trim().toLocaleLowerCase('pt-PT');
        const filtroTipo = tipo?.value || '';
        const filtrados = documentos.filter(d => {
            const dados = typeof d.dados === 'string' ? (() => { try { return JSON.parse(d.dados); } catch { return {}; } })() : (d.dados || {});
            const texto = `${d.numero_documento || ''} ${d.titulo || ''} ${d.tipo_documento || ''} ${d.cliente_nome || ''} ${d.numero_conta || ''} ${dados.referencia || ''}`.toLocaleLowerCase('pt-PT');
            return (!termo || texto.includes(termo)) && (!filtroTipo || d.tipo_documento === filtroTipo);
        });

        document.getElementById('comprovativosCount').textContent = `${filtrados.length} registo(s)`;
        alvo.innerHTML = filtrados.length ? `
            <div class="table-scroll">
                <table class="data-table">
                    <thead><tr><th>Data</th><th>Nº Documento</th><th>Tipo</th><th>Cliente</th><th>Conta</th><th>Operador</th><th>Ação</th></tr></thead>
                    <tbody>
                        ${filtrados.map(d => `<tr class="receipt-row" data-receipt-id="${escaparHTML(d.id)}">
                            <td>${formatarDataHora(d.criado_em)}</td>
                            <td><strong>${escaparHTML(d.numero_documento)}</strong></td>
                            <td>${escaparHTML(d.tipo_documento)}</td>
                            <td>${escaparHTML(d.cliente_nome || '—')}</td>
                            <td>${escaparHTML(d.numero_conta || '—')}</td>
                            <td>${escaparHTML(d.operador || '—')}</td>
                            <td><button type="button" class="secondary-action receipt-print" data-receipt-id="${escaparHTML(d.id)}">Reemitir</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        ` : '<div class="empty-state compact"><strong>Nenhum comprovativo encontrado.</strong><p>Os comprovativos emitidos a partir das operações aparecerão aqui.</p></div>';

        alvo.querySelectorAll('.receipt-print').forEach(btn => btn.addEventListener('click', async event => {
            event.stopPropagation();
            const documento = documentos.find(d => String(d.id) === String(btn.dataset.receiptId));
            if (!documento) return;
            try {
                await window.PRISMA_MODULES.abrirPDF(
                    `/api/documentos/comprovativo/${encodeURIComponent(documento.id)}.pdf`,
                    `${documento.numero_documento || 'comprovativo'}.pdf`
                );
            } catch (error) {
                mostrarToast(error.message || 'Não foi possível abrir o comprovativo.', 'error');
            }
        }));
    }

    pesquisa?.addEventListener('input', render);
    tipo?.addEventListener('change', render);
    render();
}

function mostrarModuloGenerico(modulo, utilizador) {
    const moduloPRISMA = window.PRISMA_MODULES?.[modulo];

    if (typeof moduloPRISMA === 'function') {
        return moduloPRISMA(utilizador);
    }

    const configs = {
        'comprovativos': ['Comprovativos','Consulta e emissão de comprovativos.','COMPROVATIVOS_EMITIR']
    };

    if (modulo === 'comprovativos' && typeof renderComprovativosReal === 'function') {
        return renderComprovativosReal(document.querySelector('.dashboard-main'), utilizador);
    }

    const config = configs[modulo];
    if (!config) {
        mostrarAvisoModulo('Módulo indisponível', 'Este módulo ainda não foi configurado.');
        return;
    }

    if (config[2] && !(utilizador.permissoes || []).includes(config[2])) {
        mostrarAvisoModulo('Sem permissão', 'O seu perfil não possui acesso a este módulo.');
        return;
    }

    const main = document.querySelector('.dashboard-main');
    if (!main) return;

    main.innerHTML = layoutModuloReal(
        config[0],
        `PRISMA / ${String(modulo).toUpperCase()}`,
        `<section class="dashboard-panel"><div class="empty-state"><strong>${escaparHTML(config[0])}</strong><p>${escaparHTML(config[1])}</p></div></section>`,
        utilizador
    );
}

/* =========================================================
   MODAL / TOAST / COMPROVATIVOS
   ========================================================= */

function mostrarModal(conteudo) {
    fecharModal();
    const overlay = document.createElement('div');
    overlay.id = 'prismaModal';
    overlay.className = 'prisma-modal-overlay';
    overlay.innerHTML = `<div class="prisma-modal">${conteudo}</div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('[data-close-modal]')) fecharModal();
    });

    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            fecharModal();
        }
    });
}

function fecharModalComEscape(event) {
    if (event.key === 'Escape') fecharModal();
}

function fecharModal() {
    document.getElementById('prismaModal')?.remove();
}

async function confirmarOperacao(titulo, mensagem, confirmarTexto = 'Confirmar') {
    return new Promise(resolve => {
        mostrarModal(`
            <div class="modal-header">
                <div>
                    <span class="welcome-label">CONFIRMAÇÃO</span>
                    <h2>${escaparHTML(titulo)}</h2>
                </div>
                <button type="button" class="modal-close" data-close-modal>×</button>
            </div>
            <div class="confirmation-content">
                <p>${escaparHTML(mensagem)}</p>
            </div>
            <div class="modal-actions full">
                <button type="button" class="secondary-action" id="cancelarOperacao">Cancelar</button>
                <button type="button" class="primary-action" id="confirmarOperacao">${escaparHTML(confirmarTexto)}</button>
            </div>
        `);
        let resolvido = false;
        const terminar = valor => {
            if (resolvido) return;
            resolvido = true;
            fecharModal();
            resolve(valor);
        };
        document.getElementById('cancelarOperacao')?.addEventListener('click', () => terminar(false));
        document.getElementById('confirmarOperacao')?.addEventListener('click', () => terminar(true));
        document.getElementById('prismaModal')?.addEventListener('click', event => {
            if (event.target.id === 'prismaModal' || event.target.closest('[data-close-modal]')) terminar(false);
        }, { once: true });
        document.getElementById('prismaModal')?.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                terminar(false);
            }
        });
        setTimeout(() => document.getElementById('confirmarOperacao')?.focus(), 0);
    });
}

function mostrarToast(mensagem, tipo = 'success') {
    document.querySelector('.prisma-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `prisma-toast ${tipo}`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function mostrarAvisoModulo(titulo, mensagem) {
    const main = document.querySelector('.dashboard-main');
    if (!main) return;
    main.innerHTML = layoutModuloReal(titulo, 'PRISMA / SISTEMA', `<section class="dashboard-panel"><div class="empty-state"><div class="empty-icon">!</div><strong>${escaparHTML(titulo)}</strong><p>${escaparHTML(mensagem)}</p></div></section>`, obterSessao());
}

async function imprimirComprovativoMovimento(movimento) {
    const tipo = (movimento.tipo || 'MOVIMENTO').replaceAll('_', ' ');
    const referencia = movimento.referencia || '—';
    const linhas = [
        ['Data e hora', movimento.criado_em ? formatarDataHora(movimento.criado_em) : '—'],
        ['Referência', referencia],
        ['Nº Conta', movimento.numero_conta || '—'],
        ['Cliente', movimento.cliente_nome || '—'],
        ['Operação', tipo],
        ['Valor', moeda(movimento.valor)],
        ['Saldo após operação', moeda(movimento.saldo_posterior)],
        ['Descrição', movimento.descricao || '—']
    ];

    try {
        const dados = await apiJSON('/api/operacoes/comprovativos', {
            method: 'POST',
            body: JSON.stringify({
                tipoDocumento: 'MOVIMENTO',
                titulo: 'COMPROVATIVO DE MOVIMENTO',
                movimentoId: movimento.id || null,
                clienteId: movimento.cliente_id || null,
                contaId: movimento.conta_id || null,
                dados: { referencia, linhas }
            })
        });

        const idComprovativo = dados.comprovativo?.id;
        const numeroDocumento = dados.comprovativo?.numero_documento || referencia;
        if (!idComprovativo) throw new Error('O servidor não devolveu o identificador do comprovativo.');

        await window.PRISMA_MODULES.abrirPDF(
            `/api/documentos/comprovativo/${encodeURIComponent(idComprovativo)}.pdf`,
            `${numeroDocumento}.pdf`
        );
        mostrarToast(`Comprovativo ${numeroDocumento} emitido.`);
    } catch (error) {
        mostrarToast(error.message || 'Não foi possível emitir o comprovativo.', 'error');
    }
}


async function imprimirComprovativo(titulo, linhas) {
    try {
        const referenciaLinha = Array.isArray(linhas)
            ? linhas.find(linha => String(linha?.[0] || '').toLowerCase().includes('referência'))
            : null;
        const valorLinha = Array.isArray(linhas)
            ? linhas.find(linha => ['valor', 'saldo', 'capital'].some(chave =>
                String(linha?.[0] || '').toLowerCase().startsWith(chave)
            ))
            : null;

        const dados = {
            referencia: referenciaLinha?.[1] || null,
            valor: valorLinha?.[1] || null,
            linhas: Array.isArray(linhas)
                ? linhas
                    .filter(linha => Array.isArray(linha) && linha.length >= 2)
                    .map(([label, valor]) => [String(label ?? ''), String(valor ?? '')])
                : []
        };

        const resposta = await apiJSON('/api/operacoes/comprovativos', {
            method: 'POST',
            body: JSON.stringify({
                tipoDocumento: 'OPERACAO',
                titulo: String(titulo || 'Comprovativo de operação'),
                dados
            })
        });

        const comprovativo = resposta.comprovativo;
        if (!comprovativo?.id) {
            throw new Error('O servidor não devolveu o identificador do comprovativo.');
        }

        await window.PRISMA_MODULES.abrirPDF(
            `/api/documentos/comprovativo/${encodeURIComponent(comprovativo.id)}.pdf`,
            `${comprovativo.numero_documento || 'comprovativo'}.pdf`
        );

        mostrarToast(`Comprovativo ${comprovativo.numero_documento || ''} emitido.`);
    } catch (error) {
        mostrarToast(error.message || 'Não foi possível emitir o comprovativo.', 'error');
    }
}
