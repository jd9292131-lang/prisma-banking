/* =========================================================
   PRISMA EDUCACIONAL — RECONCILIAÇÃO BANCÁRIA
   =========================================================
   Módulo de reconciliação bancária.

   Funcionalidades:
   - Seleção de conta através do seletor ERP / F2
   - Pesquisa de contas
   - Nova reconciliação
   - Definição de período
   - Saldo do extrato
   - Histórico de reconciliações
   - Consulta de detalhe
   - Conferência individual de movimentos
   - Adição de movimentos existentes apenas no extrato
   - Finalização da reconciliação
   - Estados:
       PENDENTE
       CONFERIDO
       COM_DIFERENCA
       NAO_IDENTIFICADO
   ========================================================= */

(function () {
    'use strict';

    const MODULO = 'RECONCILIACAO';

    const PERMISSAO_VISUALIZAR = 'RECONCILIACAO_VISUALIZAR';
    const PERMISSAO_OPERAR = 'RECONCILIACAO_OPERAR';

    const TIPOS_ENTRADA = [
        'DEPOSITO',
        'DEPOSITO_INICIAL',
        'TRANSFERENCIA_RECEBIDA'
    ];

    const TIPOS_SAIDA = [
        'LEVANTAMENTO',
        'TRANSFERENCIA_ENVIADA',
        'PAGAMENTO_SERVICO'
    ];

    /* =========================================================
       HELPERS
       ========================================================= */

    const M = window.PRISMA_MODULES || {};

    function esc(valor) {
        return typeof M.esc === 'function'
            ? M.esc(valor)
            : String(valor ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
    }

    function money(valor) {
        if (typeof M.money === 'function') {
            return M.money(valor);
        }

        return `${Number(valor || 0).toLocaleString('pt-PT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} Kz`;
    }

    function date(valor) {
        if (typeof M.date === 'function') {
            return M.date(valor);
        }

        if (!valor) return '—';

        const d = new Date(valor);

        if (Number.isNaN(d.getTime())) {
            return String(valor);
        }

        return d.toLocaleDateString('pt-PT');
    }

    function dateTime(valor) {
        if (!valor) return '—';

        const d = new Date(valor);

        if (Number.isNaN(d.getTime())) {
            return String(valor);
        }

        return d.toLocaleString('pt-PT');
    }

    function permitido(utilizador, permissao) {
        if (typeof M.permitido === 'function') {
            return M.permitido(utilizador, permissao);
        }

        return Boolean(
            utilizador?.permissoes &&
            utilizador.permissoes.includes(permissao)
        );
    }

    async function api(url, options = {}) {
        if (typeof M.api === 'function') {
            return M.api(url, options);
        }

        const headers = new Headers(options.headers || {});
        headers.set('Content-Type', 'application/json');

        const token = sessionStorage.getItem('prismaToken');

        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const resposta = await fetch(url, {
            ...options,
            headers
        });

        const dados = await resposta.json().catch(() => ({}));

        if (resposta.status === 401) {
            sessionStorage.removeItem('prismaUtilizador');
            sessionStorage.removeItem('prismaToken');
            location.reload();

            throw new Error(
                dados.message || 'A sessão expirou.'
            );
        }

        if (!resposta.ok || !dados.success) {
            throw new Error(
                dados.message ||
                `Operação não concluída (HTTP ${resposta.status}).`
            );
        }

        return dados;
    }

    function shell(titulo, breadcrumb, html, utilizador) {
        if (typeof M.shell === 'function') {
            M.shell(
                titulo,
                breadcrumb,
                html,
                utilizador
            );
            return;
        }

        const main = document.querySelector('.dashboard-main');

        if (!main) return;

        main.innerHTML = `
            <header class="dashboard-header">
                <div>
                    <span class="dashboard-breadcrumb">
                        ${esc(breadcrumb)}
                    </span>
                    <h1>${esc(titulo)}</h1>
                </div>
            </header>

            <section class="dashboard-content">
                ${html}
            </section>
        `;
    }

    function toast(mensagem, tipo = 'info') {
        if (typeof M.toast === 'function') {
            M.toast(mensagem, tipo);
            return;
        }

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(mensagem, tipo);
            return;
        }

        console.log(`[${tipo}] ${mensagem}`);
    }

    function mostrarAviso(titulo, mensagem) {
        if (typeof window.mostrarAvisoModulo === 'function') {
            window.mostrarAvisoModulo(titulo, mensagem);
            return;
        }

        toast(`${titulo}: ${mensagem}`, 'error');
    }

    function abrirModal(html) {
        if (typeof M.mostrarModal === 'function') {
            M.mostrarModal(html);
            return;
        }

        if (typeof window.mostrarModal === 'function') {
            window.mostrarModal(html);
            return;
        }

        throw new Error(
            'O sistema de modais do PRISMA não está disponível.'
        );
    }

    function fecharModal() {
        if (typeof M.fecharModal === 'function') {
            M.fecharModal();
            return;
        }

        if (typeof window.fecharModal === 'function') {
            window.fecharModal();
        }
    }

    /* =========================================================
       ESTADO DO MÓDULO
       ========================================================= */

    let contas = [];
    let contaSelecionada = null;

    let filtros = {
        contaId: '',
        estado: ''
    };

    /* =========================================================
       CARREGAR CONTAS
       ========================================================= */

    async function carregarContas() {
        const dados = await api('/api/operacoes/contas');

        contas = Array.isArray(dados.contas)
            ? dados.contas
            : [];

        return contas;
    }

    /* =========================================================
       PREPARAR CONTAS PARA O PICKER ERP / F2
       ========================================================= */

    function contasParaPicker(lista) {
        return lista.map(conta => ({
            value: conta.id,

            label:
                `${conta.numero_conta || '—'} — ` +
                `${conta.cliente_nome || 'Cliente sem nome'}`,

            meta:
                `${conta.tipo_conta || '—'} · ` +
                `Saldo ${money(conta.saldo)} · ` +
                `${conta.numero_cliente || ''} · ` +
                `${conta.estado || '—'}`,

            search:
                `${conta.numero_conta || ''} ` +
                `${conta.cliente_nome || ''} ` +
                `${conta.numero_cliente || ''} ` +
                `${conta.tipo_conta || ''} ` +
                `${conta.estado || ''}`
        }));
    }

    /* =========================================================
       SELETOR DE CONTA — PADRÃO ERP / F2
       ========================================================= */

    function renderSeletorConta() {
        const selecionada = contas.find(
            conta =>
                String(conta.id) ===
                String(contaSelecionada?.id || '')
        );

        return `
            <div class="form-field searchable-field"
                 data-picker="reconciliacaoConta">

                <label for="reconciliacaoContaInput">
                    Conta bancária *
                    <span class="field-shortcut">
                        F2 — tabela completa
                    </span>
                </label>

                <div class="entity-picker"
                     id="reconciliacaoContaPicker">

                    <div class="entity-picker-control">

                        <input
                            type="search"
                            id="reconciliacaoContaInput"
                            class="entity-picker-input"
                            placeholder="Pesquisar conta..."
                            value="${esc(
                                selecionada
                                    ? `${selecionada.numero_conta} — ${selecionada.cliente_nome}`
                                    : ''
                            )}"
                            autocomplete="off"
                            aria-expanded="false"
                            required
                        >

                        <button
                            type="button"
                            class="entity-picker-f2"
                            id="reconciliacaoContaF2"
                            title="Abrir tabela de seleção (F2)"
                        >
                            F2
                        </button>

                    </div>

                    <input
                        type="hidden"
                        name="contaId"
                        id="reconciliacaoContaValue"
                        value="${esc(
                            selecionada?.id || ''
                        )}"
                    >

                    <div
                        class="entity-picker-results"
                        id="reconciliacaoContaResults"
                        hidden
                    ></div>

                </div>

                <small class="reconciliacao-help-text">
                    Pressione F2 para abrir a tabela completa de contas.
                </small>

            </div>
        `;
    }

    function ativarSeletorConta() {
        const input = document.getElementById(
            'reconciliacaoContaInput'
        );

        const value = document.getElementById(
            'reconciliacaoContaValue'
        );

        const results = document.getElementById(
            'reconciliacaoContaResults'
        );

        const botaoF2 = document.getElementById(
            'reconciliacaoContaF2'
        );

        if (!input || !value || !results) {
            return;
        }

        const itens = contasParaPicker(contas);

        function selecionar(item) {
            if (!item) return;

            const conta = contas.find(
                c => String(c.id) === String(item.value)
            );

            if (!conta) return;

            contaSelecionada = conta;

            input.value = item.label;
            value.value = item.value;

            results.hidden = true;
            input.setAttribute(
                'aria-expanded',
                'false'
            );

            atualizarResumoConta();

            input.dispatchEvent(
                new CustomEvent(
                    'prisma:conta-selected',
                    {
                        detail: conta
                    }
                )
            );
        }

        function renderResultados(termo = '') {
            const q = String(termo || '')
                .trim()
                .toLocaleLowerCase('pt-PT');

            const filtrados = itens.filter(item =>
                String(
                    item.search ||
                    `${item.label} ${item.meta || ''}`
                )
                    .toLocaleLowerCase('pt-PT')
                    .includes(q)
            );

            results.innerHTML = filtrados.length
                ? filtrados.map(item => `
                    <button
                        type="button"
                        class="entity-picker-option"
                        data-value="${esc(item.value)}"
                    >
                        <strong>
                            ${esc(item.label)}
                        </strong>

                        <span>
                            ${esc(item.meta || '')}
                        </span>
                    </button>
                `).join('')
                : `
                    <div class="empty-state compact">
                        <strong>
                            Nenhuma conta encontrada
                        </strong>
                    </div>
                `;

            results.hidden = false;

            input.setAttribute(
                'aria-expanded',
                'true'
            );
        }

        input.addEventListener(
            'focus',
            () => renderResultados(input.value)
        );

        input.addEventListener(
            'input',
            () => {
                value.value = '';
                contaSelecionada = null;

                renderResultados(input.value);
                atualizarResumoConta();
            }
        );

        input.addEventListener(
            'keydown',
            event => {

                if (event.key === 'F2') {
                    event.preventDefault();
                    event.stopPropagation();

                    abrirTabelaSelecaoContas();

                    return;
                }

                if (
                    event.key === 'ArrowDown' &&
                    !results.hidden
                ) {
                    event.preventDefault();

                    results
                        .querySelector(
                            '.entity-picker-option'
                        )
                        ?.focus();
                }

                if (event.key === 'Escape') {
                    results.hidden = true;

                    input.setAttribute(
                        'aria-expanded',
                        'false'
                    );
                }
            }
        );

        botaoF2?.addEventListener(
            'click',
            () => abrirTabelaSelecaoContas()
        );

        results.addEventListener(
            'click',
            event => {

                const botao =
                    event.target.closest(
                        '.entity-picker-option'
                    );

                if (!botao) return;

                const item = itens.find(
                    registo =>
                        String(registo.value) ===
                        String(botao.dataset.value)
                );

                selecionar(item);
            }
        );

        results.addEventListener(
            'keydown',
            event => {

                const botao =
                    event.target.closest(
                        '.entity-picker-option'
                    );

                if (!botao) return;

                if (event.key === 'Enter') {
                    event.preventDefault();

                    const item = itens.find(
                        registo =>
                            String(registo.value) ===
                            String(botao.dataset.value)
                    );

                    selecionar(item);
                }

                if (event.key === 'ArrowDown') {
                    event.preventDefault();

                    botao.nextElementSibling?.focus();
                }

                if (event.key === 'ArrowUp') {
                    event.preventDefault();

                    botao.previousElementSibling?.focus();
                }
            }
        );

        document.addEventListener(
            'click',
            event => {
                if (!document.getElementById(
                    'reconciliacaoContaPicker'
                )?.contains(event.target)) {

                    results.hidden = true;

                    input.setAttribute(
                        'aria-expanded',
                        'false'
                    );
                }
            }
        );
    }

    /* =========================================================
       TABELA ERP DE CONTAS
       ========================================================= */

    function abrirTabelaSelecaoContas() {
        const lista = contasParaPicker(contas);

        abrirModal(`
            <div class="modal-header">

                <div>
                    <span class="welcome-label">
                        SELEÇÃO ERP
                    </span>

                    <h2>
                        Contas bancárias
                    </h2>

                    <p class="picker-help">
                        Pesquise pelo número da conta,
                        cliente, nº cliente ou tipo.
                        Clique para selecionar.
                        Duplo clique confirma.
                        F2 ou Enter confirma.
                        Use ↑/↓ para navegar.
                        Esc fecha.
                    </p>
                </div>

                <button
                    class="modal-close"
                    data-close-modal
                    type="button"
                >
                    ×
                </button>

            </div>

            <div class="erp-selector-toolbar">

                <input
                    id="erpReconciliacaoContaSearch"
                    type="search"
                    placeholder="Pesquisar conta..."
                    autocomplete="off"
                >

                <span id="erpReconciliacaoContaCount">
                    ${lista.length} conta(s)
                </span>

            </div>

            <div
                id="erpReconciliacaoContaTable"
                class="table-container"
            ></div>

            <div class="modal-actions full">

                <button
                    type="button"
                    class="secondary-action"
                    data-close-modal
                >
                    Cancelar
                </button>

            </div>
        `);

        const search = document.getElementById(
            'erpReconciliacaoContaSearch'
        );

        const table = document.getElementById(
            'erpReconciliacaoContaTable'
        );

        const count = document.getElementById(
            'erpReconciliacaoContaCount'
        );

        let linhaSelecionada = null;

        function selecionarLinhaVisual(row) {
            table
                .querySelectorAll('tbody tr')
                .forEach(linha =>
                    linha.classList.remove(
                        'erp-row-selected'
                    )
                );

            if (!row) {
                linhaSelecionada = null;
                return;
            }

            row.classList.add(
                'erp-row-selected'
            );

            linhaSelecionada = row;

            row.focus();
        }

        function escolher(value) {
            const item = lista.find(
                registo =>
                    String(registo.value) ===
                    String(value)
            );

            if (!item) return;

            const conta = contas.find(
                c =>
                    String(c.id) ===
                    String(item.value)
            );

            if (!conta) return;

            contaSelecionada = conta;

            const input = document.getElementById(
                'reconciliacaoContaInput'
            );

            const hidden = document.getElementById(
                'reconciliacaoContaValue'
            );

            if (input) {
                input.value = item.label;
            }

            if (hidden) {
                hidden.value = item.value;
            }

            atualizarResumoConta();

            fecharModal();

            input?.focus();
        }

        function render(termo = '') {
            const q = String(termo || '')
                .trim()
                .toLocaleLowerCase('pt-PT');

            const filtrados = lista.filter(
                item =>
                    String(
                        item.search ||
                        `${item.label} ${item.meta || ''}`
                    )
                        .toLocaleLowerCase('pt-PT')
                        .includes(q)
            );

            if (count) {
                count.textContent =
                    `${filtrados.length} conta(s)`;
            }

            if (!table) return;

            table.innerHTML = filtrados.length
                ? `
                    <div class="table-scroll">
                        <table class="data-table erp-selector-table">

                            <thead>
                                <tr>
                                    <th>Conta</th>
                                    <th>Cliente</th>
                                    <th>Tipo</th>
                                    <th>Saldo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>

                            <tbody>

                                ${filtrados.map(item => {

                                    const conta =
                                        contas.find(
                                            c =>
                                                String(c.id) ===
                                                String(item.value)
                                        );

                                    return `
                                        <tr
                                            tabindex="0"
                                            data-erp-value="${esc(
                                                item.value
                                            )}"
                                        >

                                            <td>
                                                <strong>
                                                    ${esc(
                                                        conta?.numero_conta ||
                                                        item.label
                                                    )}
                                                </strong>
                                            </td>

                                            <td>
                                                ${esc(
                                                    conta?.cliente_nome ||
                                                    '—'
                                                )}
                                            </td>

                                            <td>
                                                ${esc(
                                                    conta?.tipo_conta ||
                                                    '—'
                                                )}
                                            </td>

                                            <td>
                                                ${money(
                                                    conta?.saldo
                                                )}
                                            </td>

                                            <td>
                                                ${esc(
                                                    conta?.estado ||
                                                    '—'
                                                )}
                                            </td>

                                        </tr>
                                    `;
                                }).join('')}

                            </tbody>

                        </table>
                    </div>
                `
                : `
                    <div class="empty-state compact">
                        <strong>
                            Nenhuma conta encontrada
                        </strong>

                        <p>
                            Tente outro número,
                            cliente ou tipo de conta.
                        </p>
                    </div>
                `;

            table
                .querySelectorAll('tbody tr')
                .forEach(row => {

                    row.addEventListener(
                        'click',
                        () =>
                            selecionarLinhaVisual(row)
                    );

                    row.addEventListener(
                        'dblclick',
                        () =>
                            escolher(
                                row.dataset.erpValue
                            )
                    );

                    row.addEventListener(
                        'keydown',
                        event => {

                            if (
                                event.key === 'Enter' ||
                                event.key === 'F2'
                            ) {
                                event.preventDefault();

                                escolher(
                                    row.dataset.erpValue
                                );

                                return;
                            }

                            if (
                                event.key === 'ArrowDown'
                            ) {
                                event.preventDefault();

                                const next =
                                    row.nextElementSibling;

                                if (next) {
                                    selecionarLinhaVisual(
                                        next
                                    );
                                }

                                return;
                            }

                            if (
                                event.key === 'ArrowUp'
                            ) {
                                event.preventDefault();

                                const previous =
                                    row.previousElementSibling;

                                if (previous) {
                                    selecionarLinhaVisual(
                                        previous
                                    );
                                }
                            }
                        }
                    );
                });
        }

        search?.addEventListener(
            'input',
            () => render(search.value)
        );

        search?.addEventListener(
            'keydown',
            event => {

                if (event.key === 'Escape') {
                    event.preventDefault();
                    fecharModal();
                    return;
                }

                if (event.key === 'ArrowDown') {
                    const primeira =
                        table?.querySelector(
                            'tbody tr'
                        );

                    if (primeira) {
                        event.preventDefault();
                        selecionarLinhaVisual(
                            primeira
                        );
                    }

                    return;
                }

                if (
                    event.key === 'Enter' ||
                    event.key === 'F2'
                ) {
                    const selecionada =
                        table?.querySelector(
                            'tbody tr.erp-row-selected'
                        );

                    if (selecionada) {
                        event.preventDefault();

                        escolher(
                            selecionada.dataset.erpValue
                        );
                    }
                }
            }
        );

        render();

        setTimeout(
            () => search?.focus(),
            0
        );
    }

    /* =========================================================
       RESUMO DA CONTA
       ========================================================= */

    function atualizarResumoConta() {
        const alvo = document.getElementById(
            'reconciliacaoContaResumo'
        );

        if (!alvo) return;

        if (!contaSelecionada) {
            alvo.innerHTML = `
                <div class="reconciliacao-analise-box">
                    <span>CONTA</span>
                    <strong>
                        Nenhuma conta selecionada
                    </strong>
                </div>
            `;

            return;
        }

        alvo.innerHTML = `
            <div class="reconciliacao-analise-box">

                <span>CONTA SELECIONADA</span>

                <strong>
                    ${esc(contaSelecionada.numero_conta)}
                </strong>

                <small>
                    ${esc(
                        contaSelecionada.cliente_nome ||
                        'Cliente sem nome'
                    )}
                    ·
                    ${esc(
                        contaSelecionada.tipo_conta ||
                        '—'
                    )}
                    ·
                    Saldo atual:
                    ${money(contaSelecionada.saldo)}
                </small>

            </div>
        `;
    }

    /* =========================================================
       ESTADOS
       ========================================================= */

    function estadoLabel(estado) {
        switch (estado) {
            case 'PENDENTE':
                return 'Pendente';

            case 'CONFERIDO':
                return 'Conferido';

            case 'RECONCILIADO':
                return 'Reconciliado';

            case 'COM_DIFERENCA':
                return 'Com diferença';

            case 'NAO_IDENTIFICADO':
                return 'Não identificado';

            default:
                return estado || '—';
        }
    }

    function estadoClass(estado) {
        switch (estado) {
            case 'CONFERIDO':
            case 'RECONCILIADO':
                return 'estado-conferido';

            case 'COM_DIFERENCA':
                return 'estado-diferenca';

            case 'NAO_IDENTIFICADO':
                return 'estado-nao-identificado';

            case 'PENDENTE':
            default:
                return 'estado-pendente';
        }
    }

    function tipoMovimentoLabel(tipo) {
        switch (tipo) {
            case 'DEPOSITO_INICIAL':
                return 'Depósito inicial';

            case 'DEPOSITO':
                return 'Depósito';

            case 'LEVANTAMENTO':
                return 'Levantamento';

            case 'TRANSFERENCIA_ENVIADA':
                return 'Transferência enviada';

            case 'TRANSFERENCIA_RECEBIDA':
                return 'Transferência recebida';

            case 'PAGAMENTO_SERVICO':
                return 'Pagamento de serviço';

            default:
                return tipo || '—';
        }
    }

    function movimentoNatureza(tipo) {
        if (TIPOS_ENTRADA.includes(tipo)) {
            return 'entrada';
        }

        if (tipo === 'TRANSFERENCIA_ENVIADA') {
            return 'saida-transferencia';
        }

        if (TIPOS_SAIDA.includes(tipo)) {
            return 'saida';
        }

        return 'neutro';
    }

    function valorMovimento(movimento) {
        const valor = Number(
            movimento.valor_sistema ??
            movimento.valor_extrato ??
            0
        );

        const tipo =
            movimento.tipo ||
            movimento.tipo_extrato ||
            '';

        const natureza =
            movimentoNatureza(tipo);

        if (natureza === 'entrada') {
            return `+${money(valor)}`;
        }

        if (
            natureza === 'saida' ||
            natureza === 'saida-transferencia'
        ) {
            return `−${money(valor)}`;
        }

        return money(valor);
    }

    /* =========================================================
       NOVA RECONCILIAÇÃO
       ========================================================= */

    async function renderNovaReconciliacao() {
        return `
            <section class="dashboard-panel reconciliacao-nova-panel">

                <div class="panel-header">

                    <div>
                        <span>
                            CONFERÊNCIA BANCÁRIA
                        </span>

                        <h2>
                            Nova reconciliação
                        </h2>
                    </div>

                    <button
                        type="button"
                        class="secondary-action"
                        id="reconciliacaoAtualizarContas"
                    >
                        Atualizar contas
                    </button>

                </div>

                <form
                    id="reconciliacaoNovaForm"
                    class="reconciliacao-form-grid"
                >

                    ${renderSeletorConta()}

                    <div class="form-field">

                        <label for="reconciliacaoPeriodoInicio">
                            Período inicial *
                        </label>

                        <input
                            type="date"
                            id="reconciliacaoPeriodoInicio"
                            name="periodoInicio"
                            required
                        >

                    </div>

                    <div class="form-field">

                        <label for="reconciliacaoPeriodoFim">
                            Período final *
                        </label>

                        <input
                            type="date"
                            id="reconciliacaoPeriodoFim"
                            name="periodoFim"
                            required
                        >

                    </div>

                    <div class="form-field">

                        <label for="reconciliacaoSaldoExtrato">
                            Saldo do extrato
                        </label>

                        <input
                            type="number"
                            id="reconciliacaoSaldoExtrato"
                            name="saldoExtrato"
                            min="0"
                            step="0.01"
                            placeholder="0,00"
                        >

                    </div>

                    <div class="form-field form-group-wide">

                        <label for="reconciliacaoObservacoes">
                            Observações
                        </label>

                        <textarea
                            id="reconciliacaoObservacoes"
                            name="observacoes"
                            rows="3"
                            placeholder="Observações da conferência..."
                        ></textarea>

                    </div>

                    <div
                        id="reconciliacaoContaResumo"
                        class="reconciliacao-analise"
                    ></div>

                    <div
                        class="reconciliacao-form-actions form-group-wide"
                    >

                        <button
                            type="button"
                            class="secondary-action"
                            id="reconciliacaoAnalisarButton"
                        >
                            Analisar período
                        </button>

                        <button
                            type="submit"
                            class="primary-action"
                        >
                            Criar reconciliação
                        </button>

                    </div>

                </form>

                <div
                    id="reconciliacaoAnaliseResultado"
                    class="reconciliacao-analise"
                ></div>

            </section>
        `;
    }

    /* =========================================================
       ANALISAR PERÍODO
       ========================================================= */

    async function analisarPeriodo() {
        const inicio =
            document.getElementById(
                'reconciliacaoPeriodoInicio'
            )?.value;

        const fim =
            document.getElementById(
                'reconciliacaoPeriodoFim'
            )?.value;

        const resultado =
            document.getElementById(
                'reconciliacaoAnaliseResultado'
            );

        if (!contaSelecionada) {
            toast(
                'Selecione uma conta bancária através do F2.',
                'error'
            );
            return;
        }

        if (!inicio || !fim) {
            toast(
                'Informe o período inicial e final.',
                'error'
            );
            return;
        }

        if (inicio > fim) {
            toast(
                'O período inicial não pode ser posterior ao período final.',
                'error'
            );
            return;
        }

        if (resultado) {
            resultado.innerHTML = `
                <div class="loading-state">
                    A preparar análise do período...
                </div>
            `;
        }

        /*
         * A API de criação é responsável pelo cálculo definitivo.
         * Aqui apresentamos a informação operacional antes da criação.
         */
        if (resultado) {
            resultado.innerHTML = `
                <div class="reconciliacao-analise-box">

                    <span>CONTA</span>

                    <strong>
                        ${esc(
                            contaSelecionada.numero_conta
                        )}
                    </strong>

                    <div class="reconciliacao-periodo">
                        <strong>PERÍODO</strong>

                        ${esc(date(inicio))}
                        →
                        ${esc(date(fim))}
                    </div>

                    <p class="reconciliacao-analise-nota">
                        O sistema irá calcular o saldo inicial,
                        entradas, saídas e saldo do sistema
                        no momento da criação da reconciliação.
                    </p>

                </div>
            `;
        }
    }

    /* =========================================================
       CRIAR RECONCILIAÇÃO
       ========================================================= */

    async function criarReconciliacao(event) {
        event.preventDefault();

        if (!permitido(
            window.PRISMA_MODULES.obterSessao?.(),
            PERMISSAO_OPERAR
        )) {
            toast(
                'Não possui permissão para criar reconciliações.',
                'error'
            );
            return;
        }

        const form = event.currentTarget;

        const periodoInicio =
            form.periodoInicio.value;

        const periodoFim =
            form.periodoFim.value;

        const saldoExtrato =
            form.saldoExtrato.value;

        const observacoes =
            form.observacoes.value.trim();

        if (!contaSelecionada?.id) {
            toast(
                'Selecione a conta bancária através do F2.',
                'error'
            );
            return;
        }

        if (!periodoInicio || !periodoFim) {
            toast(
                'Informe o período completo.',
                'error'
            );
            return;
        }

        if (periodoInicio > periodoFim) {
            toast(
                'O período inicial não pode ser posterior ao período final.',
                'error'
            );
            return;
        }

        const payload = {
            contaId: contaSelecionada.id,
            periodoInicio,
            periodoFim,
            saldoExtrato:
                saldoExtrato === ''
                    ? null
                    : Number(saldoExtrato),
            observacoes:
                observacoes || null
        };

        const button =
            form.querySelector(
                'button[type="submit"]'
            );

        if (button) {
            button.disabled = true;
            button.textContent =
                'A criar...';
        }

        try {
            const dados = await api(
                '/api/operacoes/reconciliacoes',
                {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }
            );

            toast(
                dados.message ||
                'Reconciliação criada com sucesso.',
                'success'
            );

            if (dados.reconciliacao?.id) {
                await abrirDetalhe(
                    dados.reconciliacao.id
                );
                return;
            }

            await carregarHistorico();

        } catch (error) {

            toast(
                error.message ||
                'Não foi possível criar a reconciliação.',
                'error'
            );

        } finally {

            if (button) {
                button.disabled = false;
                button.textContent =
                    'Criar reconciliação';
            }
        }
    }

    /* =========================================================
       HISTÓRICO
       ========================================================= */

    async function carregarHistorico() {
        const container =
            document.getElementById(
                'reconciliacoesHistorico'
            );

        if (!container) return;

        container.innerHTML = `
            <div class="loading-state">
                A carregar reconciliações...
            </div>
        `;

        try {

            const params = new URLSearchParams();

            if (filtros.contaId) {
                params.set(
                    'contaId',
                    filtros.contaId
                );
            }

            if (filtros.estado) {
                params.set(
                    'estado',
                    filtros.estado
                );
            }

            const query =
                params.toString()
                    ? `?${params.toString()}`
                    : '';

            const dados = await api(
                `/api/operacoes/reconciliacoes${query}`
            );

            const lista =
                Array.isArray(
                    dados.reconciliacoes
                )
                    ? dados.reconciliacoes
                    : [];

            renderHistorico(
                lista,
                container
            );

        } catch (error) {

            container.innerHTML = `
                <div class="error-state">
                    ${esc(error.message)}
                </div>
            `;
        }
    }

    function renderHistorico(
        lista,
        container
    ) {
        if (!lista.length) {
            container.innerHTML = `
                <div class="empty-state compact">

                    <strong>
                        Nenhuma reconciliação encontrada
                    </strong>

                    <p>
                        Ainda não existem reconciliações
                        para os filtros selecionados.
                    </p>

                </div>
            `;

            return;
        }

        container.innerHTML = `
            <div class="reconciliacao-table-scroll">

                <table class="reconciliacao-data-table">

                    <thead>

                        <tr>
                            <th>Referência</th>
                            <th>Conta / Cliente</th>
                            <th>Período</th>
                            <th>Saldo sistema</th>
                            <th>Saldo extrato</th>
                            <th>Diferença</th>
                            <th>Estado</th>
                            <th>Ação</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${lista.map(rec => `
                            <tr>

                                <td>
                                    <span class="reconciliacao-referencia">
                                        ${esc(
                                            rec.referencia ||
                                            '—'
                                        )}
                                    </span>
                                </td>

                                <td>

                                    <strong>
                                        ${esc(
                                            rec.numero_conta ||
                                            '—'
                                        )}
                                    </strong>

                                    <br>

                                    <span>
                                        ${esc(
                                            rec.cliente_nome ||
                                            '—'
                                        )}
                                    </span>

                                </td>

                                <td>
                                    ${esc(
                                        date(
                                            rec.periodo_inicio
                                        )
                                    )}
                                    →
                                    ${esc(
                                        date(
                                            rec.periodo_fim
                                        )
                                    )}
                                </td>

                                <td>
                                    ${money(
                                        rec.saldo_sistema
                                    )}
                                </td>

                                <td>
                                    ${
                                        rec.saldo_extrato ===
                                        null ||
                                        rec.saldo_extrato ===
                                        undefined
                                            ? '—'
                                            : money(
                                                rec.saldo_extrato
                                            )
                                    }
                                </td>

                                <td>
                                    ${money(
                                        rec.diferenca
                                    )}
                                </td>

                                <td>
                                    <span
                                        class="reconciliacao-estado ${estadoClass(
                                            rec.estado
                                        )}"
                                    >
                                        ${esc(
                                            estadoLabel(
                                                rec.estado
                                            )
                                        )}
                                    </span>
                                </td>

                                <td>

                                    <button
                                        type="button"
                                        class="table-action"
                                        data-reconciliacao-view="${esc(
                                            rec.id
                                        )}"
                                    >
                                        Abrir
                                    </button>

                                </td>

                            </tr>
                        `).join('')}

                    </tbody>

                </table>

            </div>
        `;

        container
            .querySelectorAll(
                '[data-reconciliacao-view]'
            )
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () =>
                        abrirDetalhe(
                            button.dataset
                                .reconciliacaoView
                        )
                );
            });
    }

    /* =========================================================
       DETALHE
       ========================================================= */

    async function abrirDetalhe(id) {
        try {

            const dados = await api(
                `/api/operacoes/reconciliacoes/${encodeURIComponent(id)}`
            );

            renderDetalhe(
                dados.reconciliacao,
                dados.movimentos || []
            );

        } catch (error) {

            toast(
                error.message ||
                'Não foi possível abrir a reconciliação.',
                'error'
            );
        }
    }

    function renderDetalhe(
        rec,
        movimentos
    ) {
        const main =
            document.querySelector(
                '.dashboard-main'
            );

        if (!main) return;

        const podeOperar =
            permitido(
                window.PRISMA_MODULES.obterSessao?.(),
                PERMISSAO_OPERAR
            );

        const podeFinalizar =
            podeOperar &&
            rec.estado !== 'RECONCILIADO';

        main.innerHTML = `
            <header class="dashboard-header">

                <div>

                    <span class="dashboard-breadcrumb">
                        PRISMA / GESTÃO / RECONCILIAÇÃO
                    </span>

                    <h1>
                        ${esc(
                            rec.referencia ||
                            'Reconciliação bancária'
                        )}
                    </h1>

                </div>

            </header>

            <section class="dashboard-content reconciliacao-page">

                <div class="page-toolbar">

                    <div>

                        <span class="welcome-label">
                            CONFERÊNCIA BANCÁRIA
                        </span>

                        <h2>
                            ${esc(
                                rec.referencia ||
                                'Reconciliação'
                            )}
                        </h2>

                        <p>
                            ${esc(
                                rec.numero_conta ||
                                '—'
                            )}
                            ·
                            ${esc(
                                rec.cliente_nome ||
                                '—'
                            )}
                        </p>

                    </div>

                    <div class="reconciliacao-header-actions">

                        <button
                            type="button"
                            class="secondary-action"
                            id="reconciliacaoVoltar"
                        >
                            Voltar ao histórico
                        </button>

                        <span
                            class="reconciliacao-estado ${estadoClass(
                                rec.estado
                            )}"
                        >
                            ${esc(
                                estadoLabel(
                                    rec.estado
                                )
                            )}
                        </span>

                    </div>

                </div>

                <section class="reconciliacao-resumo-grid">

                    ${renderResumoCard(
                        'Conta',
                        rec.numero_conta || '—',
                        'conta'
                    )}

                    ${renderResumoCard(
                        'Saldo inicial',
                        money(rec.saldo_inicial),
                        'saldo'
                    )}

                    ${renderResumoCard(
                        'Total entradas',
                        `+${money(
                            rec.total_entradas
                        )}`,
                        'entrada'
                    )}

                    ${renderResumoCard(
                        'Total saídas',
                        `−${money(
                            rec.total_saidas
                        )}`,
                        'saida'
                    )}

                    ${renderResumoCard(
                        'Saldo sistema',
                        money(rec.saldo_sistema),
                        'sistema'
                    )}

                    ${renderResumoCard(
                        'Saldo extrato',
                        rec.saldo_extrato === null ||
                        rec.saldo_extrato === undefined
                            ? '—'
                            : money(
                                rec.saldo_extrato
                            ),
                        'extrato'
                    )}

                    ${renderResumoCard(
                        'Diferença',
                        money(rec.diferenca),
                        Number(rec.diferenca || 0) === 0
                            ? 'sem-diferenca'
                            : 'diferenca'
                    )}

                </section>

                <section class="dashboard-panel">

                    <div class="panel-header">

                        <div>

                            <span>
                                MOVIMENTOS
                            </span>

                            <h2>
                                Movimentos da reconciliação
                            </h2>

                        </div>

                        <strong>
                            ${movimentos.length}
                        </strong>

                    </div>

                    <div
                        class="reconciliacao-movimentos-area"
                    >

                        ${renderTabelaMovimentos(
                            rec,
                            movimentos,
                            podeOperar
                        )}

                    </div>

                </section>

                ${
                    podeOperar
                        ? renderAreaMovimentoExtrato(
                            rec
                        )
                        : ''
                }

                ${
                    podeFinalizar
                        ? renderAreaFinalizacao(
                            rec
                        )
                        : renderAreaFinalizada(
                            rec
                        )
                }

            </section>
        `;

        document
            .getElementById(
                'reconciliacaoVoltar'
            )
            ?.addEventListener(
                'click',
                () =>
                    renderModulo(
                        window.PRISMA_MODULES.obterSessao?.()
                    )
            );

        ativarEventosMovimentos(
            rec,
            movimentos,
            podeOperar
        );

        ativarEventoExtrato(
            rec
        );

        ativarEventoFinalizacao(
            rec
        );
    }

    function renderResumoCard(
        label,
        valor,
        classe
    ) {
        return `
            <div
                class="reconciliacao-resumo-card ${esc(
                    classe
                )}"
            >

                <span>
                    ${esc(label)}
                </span>

                <strong>
                    ${esc(valor)}
                </strong>

            </div>
        `;
    }

    /* =========================================================
       TABELA DE MOVIMENTOS
       ========================================================= */

    function renderTabelaMovimentos(
        rec,
        movimentos,
        podeOperar
    ) {
        if (!movimentos.length) {
            return `
                <div class="empty-state compact">
                    Não existem movimentos nesta reconciliação.
                </div>
            `;
        }

        return `
            <div class="reconciliacao-table-scroll">

                <table class="reconciliacao-data-table">

                    <thead>

                        <tr>
                            <th>Data</th>
                            <th>Referência</th>
                            <th>Operação</th>
                            <th>Sistema</th>
                            <th>Extrato</th>
                            <th>Diferença</th>
                            <th>Estado</th>
                            <th>Ação</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${movimentos.map(movimento => {

                            const tipo =
                                movimento.tipo ||
                                movimento.tipo_extrato ||
                                '';

                            const natureza =
                                movimentoNatureza(
                                    tipo
                                );

                            const diferenca =
                                Number(
                                    movimento.diferenca ||
                                    0
                                );

                            const movimentoId =
                                movimento.movimento_id;

                            const externalOnly =
                                !movimentoId;

                            return `
                                <tr>

                                    <td>
                                        ${esc(
                                            dateTime(
                                                movimento.data_extrato ||
                                                movimento.movimento_criado_em ||
                                                movimento.criado_em
                                            )
                                        )}
                                    </td>

                                    <td>
                                        <span
                                            class="reconciliacao-referencia"
                                        >
                                            ${esc(
                                                movimento.referencia ||
                                                movimento.referencia_extrato ||
                                                '—'
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        <span
                                            class="reconciliacao-tipo ${esc(
                                                natureza
                                            )}"
                                        >
                                            ${esc(
                                                tipoMovimentoLabel(
                                                    tipo
                                                )
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        ${
                                            movimento.valor_sistema ===
                                            null ||
                                            movimento.valor_sistema ===
                                            undefined
                                                ? '—'
                                                : valorMovimento({
                                                    ...movimento,
                                                    valor_sistema:
                                                        movimento.valor_sistema,
                                                    tipo:
                                                        movimento.tipo
                                                })
                                        }
                                    </td>

                                    <td>
                                        ${
                                            movimento.valor_extrato ===
                                            null ||
                                            movimento.valor_extrato ===
                                            undefined
                                                ? '—'
                                                : money(
                                                    movimento.valor_extrato
                                                )
                                        }
                                    </td>

                                    <td>
                                        <span class="${
                                            Math.abs(
                                                diferenca
                                            ) < 0.01
                                                ? 'valor-sem-diferenca'
                                                : 'valor-com-diferenca'
                                        }">
                                            ${money(
                                                diferenca
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        <span
                                            class="reconciliacao-estado ${estadoClass(
                                                movimento.estado
                                            )}"
                                        >
                                            ${esc(
                                                estadoLabel(
                                                    movimento.estado
                                                )
                                            )}
                                        </span>
                                    </td>

                                    <td>

                                        ${
                                            podeOperar &&
                                            !externalOnly
                                                ? `
                                                    <button
                                                        type="button"
                                                        class="table-action"
                                                        data-recon-conferir="${esc(
                                                            movimentoId
                                                        )}"
                                                    >
                                                        Conferir
                                                    </button>
                                                `
                                                : externalOnly
                                                    ? `
                                                        <span class="texto-bloqueado">
                                                            Extrato
                                                        </span>
                                                    `
                                                    : '—'
                                        }

                                    </td>

                                </tr>
                            `;
                        }).join('')}

                    </tbody>

                </table>

            </div>
        `;
    }

    /* =========================================================
       CONFERÊNCIA INDIVIDUAL
       ========================================================= */

    function ativarEventosMovimentos(
        rec,
        movimentos,
        podeOperar
    ) {
        if (!podeOperar) return;

        document
            .querySelectorAll(
                '[data-recon-conferir]'
            )
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        const movimento =
                            movimentos.find(
                                item =>
                                    String(
                                        item.movimento_id
                                    ) ===
                                    String(
                                        button.dataset
                                            .reconConferir
                                    )
                            );

                        if (!movimento) {
                            toast(
                                'Movimento não encontrado.',
                                'error'
                            );
                            return;
                        }

                        abrirConferenciaMovimento(
                            rec,
                            movimento
                        );
                    }
                );
            });
    }

    function abrirConferenciaMovimento(
        rec,
        movimento
    ) {
        abrirModal(`
            <div class="modal-header">

                <div>

                    <span class="welcome-label">
                        CONFERÊNCIA
                    </span>

                    <h2>
                        ${esc(
                            tipoMovimentoLabel(
                                movimento.tipo
                            )
                        )}
                    </h2>

                    <p>
                        ${esc(
                            movimento.referencia ||
                            'Sem referência'
                        )}
                    </p>

                </div>

                <button
                    type="button"
                    class="modal-close"
                    data-close-modal
                >
                    ×
                </button>

            </div>

            <div class="reconciliacao-conferencia-box">

                <div class="reconciliacao-conferencia-grid">

                    <div>
                        <span>Data</span>
                        <strong>
                            ${esc(
                                dateTime(
                                    movimento.movimento_criado_em
                                )
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Valor sistema</span>
                        <strong>
                            ${money(
                                movimento.valor_sistema
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Saldo posterior</span>
                        <strong>
                            ${money(
                                movimento.saldo_posterior
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Referência</span>
                        <strong>
                            ${esc(
                                movimento.referencia ||
                                '—'
                            )}
                        </strong>
                    </div>

                </div>

            </div>

            <form
                id="reconciliacaoConferenciaForm"
                class="form-grid"
            >

                <div class="form-field">

                    <label for="reconValorExtrato">
                        Valor no extrato *
                    </label>

                    <input
                        type="number"
                        id="reconValorExtrato"
                        name="valorExtrato"
                        min="0"
                        step="0.01"
                        required
                        value="${
                            movimento.valor_extrato ??
                            ''
                        }"
                    >

                </div>

                <div class="form-field">

                    <label for="reconEstadoMovimento">
                        Estado
                    </label>

                    <select
                        id="reconEstadoMovimento"
                        name="estado"
                    >
                        <option value="PENDENTE">
                            Pendente
                        </option>

                        <option value="CONFERIDO">
                            Conferido
                        </option>

                        <option value="COM_DIFERENCA">
                            Com diferença
                        </option>
                    </select>

                </div>

                <div class="form-field full">

                    <label for="reconObservacaoMovimento">
                        Observação
                    </label>

                    <textarea
                        id="reconObservacaoMovimento"
                        name="observacao"
                        rows="3"
                    >${esc(
                        movimento.observacao || ''
                    )}</textarea>

                </div>

                <div class="modal-actions full">

                    <button
                        type="button"
                        class="secondary-action"
                        data-close-modal
                    >
                        Cancelar
                    </button>

                    <button
                        type="submit"
                        class="primary-action"
                    >
                        Guardar conferência
                    </button>

                </div>

            </form>
        `);

        const form =
            document.getElementById(
                'reconciliacaoConferenciaForm'
            );

        const estado =
            document.getElementById(
                'reconEstadoMovimento'
            );

        if (estado) {
            estado.value =
                movimento.estado || 'PENDENTE';
        }

        form?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const valor =
                    form.valorExtrato.value;

                const estadoValor =
                    form.estado.value;

                const observacao =
                    form.observacao.value.trim();

                if (
                    valor === '' ||
                    !Number.isFinite(
                        Number(valor)
                    ) ||
                    Number(valor) < 0
                ) {
                    toast(
                        'Informe um valor de extrato válido.',
                        'error'
                    );
                    return;
                }

                const button =
                    form.querySelector(
                        'button[type="submit"]'
                    );

                if (button) {
                    button.disabled = true;
                    button.textContent =
                        'A guardar...';
                }

                try {

                    const dados =
                        await api(
                            `/api/operacoes/reconciliacoes/${encodeURIComponent(
                                rec.id
                            )}/movimentos/${encodeURIComponent(
                                movimento.movimento_id
                            )}`,
                            {
                                method: 'PATCH',

                                body: JSON.stringify({
                                    valorExtrato:
                                        Number(valor),

                                    estado:
                                        estadoValor,

                                    observacao:
                                        observacao ||
                                        null
                                })
                            }
                        );

                    toast(
                        dados.message ||
                        'Conferência guardada.',
                        'success'
                    );

                    fecharModal();

                    await abrirDetalhe(
                        rec.id
                    );

                } catch (error) {

                    toast(
                        error.message ||
                        'Não foi possível guardar a conferência.',
                        'error'
                    );

                } finally {

                    if (button) {
                        button.disabled = false;
                        button.textContent =
                            'Guardar conferência';
                    }
                }
            }
        );
    }

    /* =========================================================
       MOVIMENTO EXISTENTE APENAS NO EXTRATO
       ========================================================= */

    function renderAreaMovimentoExtrato(rec) {
        return `
            <section class="dashboard-panel reconciliacao-extrato-area">

                <div class="panel-header">

                    <div>

                        <span>
                            EXTRATO
                        </span>

                        <h2>
                            Movimento não identificado
                        </h2>

                    </div>

                </div>

                <div class="reconciliacao-extrato-box">

                    <p class="reconciliacao-help-text">
                        Utilize esta área quando existir
                        no extrato bancário um movimento
                        que não esteja registado no PRISMA.
                    </p>

                    <form
                        id="reconciliacaoExtratoForm"
                        class="reconciliacao-extrato-form"
                    >

                        <div class="form-field">

                            <label>
                                Data do extrato *
                            </label>

                            <input
                                type="date"
                                name="dataExtrato"
                                required
                            >

                        </div>

                        <div class="form-field">

                            <label>
                                Referência
                            </label>

                            <input
                                type="text"
                                name="referenciaExtrato"
                                maxlength="100"
                                placeholder="Referência do extrato"
                            >

                        </div>

                        <div class="form-field">

                            <label>
                                Tipo
                            </label>

                            <select name="tipoExtrato">

                                <option value="">
                                    Selecionar
                                </option>

                                <option value="DEPOSITO">
                                    Depósito
                                </option>

                                <option value="LEVANTAMENTO">
                                    Levantamento
                                </option>

                                <option value="TRANSFERENCIA">
                                    Transferência
                                </option>

                                <option value="PAGAMENTO">
                                    Pagamento
                                </option>

                                <option value="OUTRO">
                                    Outro
                                </option>

                            </select>

                        </div>

                        <div class="form-field">

                            <label>
                                Valor *
                            </label>

                            <input
                                type="number"
                                name="valorExtrato"
                                min="0"
                                step="0.01"
                                required
                                placeholder="0,00"
                            >

                        </div>

                        <div class="form-field form-group-wide">

                            <label>
                                Descrição
                            </label>

                            <textarea
                                name="descricaoExtrato"
                                rows="2"
                                placeholder="Descrição apresentada no extrato..."
                            ></textarea>

                        </div>

                        <div class="form-field form-group-wide">

                            <label>
                                Observação
                            </label>

                            <textarea
                                name="observacao"
                                rows="2"
                                placeholder="Observação da conferência..."
                            ></textarea>

                        </div>

                        <div
                            class="reconciliacao-extrato-actions form-group-wide"
                        >

                            <button
                                type="submit"
                                class="primary-action"
                            >
                                Adicionar movimento do extrato
                            </button>

                        </div>

                    </form>

                </div>

            </section>
        `;
    }

    function ativarEventoExtrato(rec) {
        const form =
            document.getElementById(
                'reconciliacaoExtratoForm'
            );

        if (!form) return;

        form.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const dataExtrato =
                    form.dataExtrato.value;

                const valorExtrato =
                    form.valorExtrato.value;

                if (!dataExtrato) {
                    toast(
                        'A data do extrato é obrigatória.',
                        'error'
                    );
                    return;
                }

                if (
                    valorExtrato === '' ||
                    !Number.isFinite(
                        Number(valorExtrato)
                    ) ||
                    Number(valorExtrato) < 0
                ) {
                    toast(
                        'Informe um valor de extrato válido.',
                        'error'
                    );
                    return;
                }

                const button =
                    form.querySelector(
                        'button[type="submit"]'
                    );

                if (button) {
                    button.disabled = true;
                    button.textContent =
                        'A adicionar...';
                }

                try {

                    const dados =
                        await api(
                            `/api/operacoes/reconciliacoes/${encodeURIComponent(
                                rec.id
                            )}/movimentos-extrato`,
                            {
                                method: 'POST',

                                body: JSON.stringify({
                                    dataExtrato,

                                    referenciaExtrato:
                                        form.referenciaExtrato.value.trim() ||
                                        null,

                                    descricaoExtrato:
                                        form.descricaoExtrato.value.trim() ||
                                        null,

                                    tipoExtrato:
                                        form.tipoExtrato.value ||
                                        null,

                                    valorExtrato:
                                        Number(
                                            valorExtrato
                                        ),

                                    observacao:
                                        form.observacao.value.trim() ||
                                        null
                                })
                            }
                        );

                    toast(
                        dados.message ||
                        'Movimento do extrato adicionado.',
                        'success'
                    );

                    form.reset();

                    await abrirDetalhe(
                        rec.id
                    );

                } catch (error) {

                    toast(
                        error.message ||
                        'Não foi possível adicionar o movimento.',
                        'error'
                    );

                } finally {

                    if (button) {
                        button.disabled = false;
                        button.textContent =
                            'Adicionar movimento do extrato';
                    }
                }
            }
        );
    }

    /* =========================================================
       FINALIZAÇÃO
       ========================================================= */

    function renderAreaFinalizacao(rec) {
        return `
            <section class="dashboard-panel reconciliacao-finalizacao-area">

                <div class="panel-header">

                    <div>

                        <span>
                            FECHO DA CONFERÊNCIA
                        </span>

                        <h2>
                            Finalizar reconciliação
                        </h2>

                    </div>

                </div>

                <div class="reconciliacao-finalizacao-box">

                    <p>
                        A reconciliação só será marcada como
                        <strong>Reconciliada</strong> quando
                        todos os movimentos estiverem conferidos
                        e o saldo do sistema coincidir com o
                        saldo do extrato.
                    </p>

                    <form
                        id="reconciliacaoFinalizacaoForm"
                        class="reconciliacao-finalizacao-form"
                    >

                        <div class="form-field">

                            <label>
                                Saldo final do extrato *
                            </label>

                            <input
                                type="number"
                                name="saldoExtrato"
                                min="0"
                                step="0.01"
                                required
                                value="${
                                    rec.saldo_extrato ??
                                    ''
                                }"
                            >

                        </div>

                        <div
                            class="reconciliacao-finalizacao-actions"
                        >

                            <button
                                type="submit"
                                class="primary-action"
                            >
                                Finalizar reconciliação
                            </button>

                        </div>

                    </form>

                </div>

            </section>
        `;
    }

    function renderAreaFinalizada(rec) {
        if (rec.estado !== 'RECONCILIADO') {
            return '';
        }

        return `
            <section class="dashboard-panel">

                <div class="reconciliacao-finalizada-box">

                    <strong>
                        Reconciliação finalizada
                    </strong>

                    <p>
                        Esta reconciliação foi concluída
                        e não pode receber novos movimentos.
                    </p>

                    ${
                        rec.reconciliado_em
                            ? `
                                <small>
                                    Finalizada em:
                                    ${esc(
                                        dateTime(
                                            rec.reconciliado_em
                                        )
                                    )}
                                </small>
                            `
                            : ''
                    }

                </div>

            </section>
        `;
    }

    function ativarEventoFinalizacao(rec) {
        const form =
            document.getElementById(
                'reconciliacaoFinalizacaoForm'
            );

        if (!form) return;

        form.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const saldoExtrato =
                    form.saldoExtrato.value;

                if (
                    saldoExtrato === '' ||
                    !Number.isFinite(
                        Number(saldoExtrato)
                    ) ||
                    Number(saldoExtrato) < 0
                ) {
                    toast(
                        'Informe um saldo de extrato válido.',
                        'error'
                    );
                    return;
                }

                const button =
                    form.querySelector(
                        'button[type="submit"]'
                    );

                if (button) {
                    button.disabled = true;
                    button.textContent =
                        'A finalizar...';
                }

                try {

                    const dados =
                        await api(
                            `/api/operacoes/reconciliacoes/${encodeURIComponent(
                                rec.id
                            )}/finalizar`,
                            {
                                method: 'POST',

                                body: JSON.stringify({
                                    saldoExtrato:
                                        Number(
                                            saldoExtrato
                                        )
                                })
                            }
                        );

                    toast(
                        dados.message ||
                        'Reconciliação finalizada.',
                        dados.reconciliacao?.estado ===
                        'RECONCILIADO'
                            ? 'success'
                            : 'info'
                    );

                    await abrirDetalhe(
                        rec.id
                    );

                } catch (error) {

                    toast(
                        error.message ||
                        'Não foi possível finalizar a reconciliação.',
                        'error'
                    );

                } finally {

                    if (button) {
                        button.disabled = false;
                        button.textContent =
                            'Finalizar reconciliação';
                    }
                }
            }
        );
    }

    /* =========================================================
       HISTÓRICO — FILTROS
       ========================================================= */

    function renderFiltrosHistorico() {
        return `
            <section class="dashboard-panel">

                <div class="panel-header">

                    <div>

                        <span>
                            HISTÓRICO
                        </span>

                        <h2>
                            Reconciliações bancárias
                        </h2>

                    </div>

                    <button
                        type="button"
                        class="secondary-action"
                        id="reconciliacaoAtualizarHistorico"
                    >
                        Atualizar
                    </button>

                </div>

                <div class="reconciliacao-form-grid">

                    <div class="form-field">

                        <label>
                            Conta
                        </label>

                        <select
                            id="reconciliacaoFiltroConta"
                        >

                            <option value="">
                                Todas as contas
                            </option>

                            ${contas.map(
                                conta => `
                                    <option
                                        value="${esc(
                                            conta.id
                                        )}"
                                    >
                                        ${esc(
                                            conta.numero_conta
                                        )}
                                        —
                                        ${esc(
                                            conta.cliente_nome ||
                                            ''
                                        )}
                                    </option>
                                `
                            ).join('')}

                        </select>

                    </div>

                    <div class="form-field">

                        <label>
                            Estado
                        </label>

                        <select
                            id="reconciliacaoFiltroEstado"
                        >

                            <option value="">
                                Todos
                            </option>

                            <option value="PENDENTE">
                                Pendente
                            </option>

                            <option value="RECONCILIADO">
                                Reconciliado
                            </option>

                            <option value="COM_DIFERENCA">
                                Com diferença
                            </option>

                        </select>

                    </div>

                </div>

                <div id="reconciliacoesHistorico">

                    <div class="loading-state">
                        A carregar reconciliações...
                    </div>

                </div>

            </section>
        `;
    }

    function ativarFiltrosHistorico() {
        const conta =
            document.getElementById(
                'reconciliacaoFiltroConta'
            );

        const estado =
            document.getElementById(
                'reconciliacaoFiltroEstado'
            );

        const atualizar = () => {

            filtros.contaId =
                conta?.value || '';

            filtros.estado =
                estado?.value || '';

            carregarHistorico();
        };

        conta?.addEventListener(
            'change',
            atualizar
        );

        estado?.addEventListener(
            'change',
            atualizar
        );

        document
            .getElementById(
                'reconciliacaoAtualizarHistorico'
            )
            ?.addEventListener(
                'click',
                carregarHistorico
            );
    }

    /* =========================================================
       PÁGINA PRINCIPAL
       ========================================================= */

    async function renderModulo(utilizador) {

        if (!permitido(
            utilizador,
            PERMISSAO_VISUALIZAR
        )) {
            mostrarAviso(
                'Sem permissão',
                'Não possui permissão para visualizar a reconciliação bancária.'
            );

            return;
        }

        try {

            await carregarContas();

        } catch (error) {

            mostrarAviso(
                'Erro',
                error.message ||
                'Não foi possível carregar as contas.'
            );

            return;
        }

        contaSelecionada = null;

        shell(
            'Reconciliação Bancária',
            'PRISMA / GESTÃO / RECONCILIAÇÃO',
            `
                <section
                    class="dashboard-content reconciliacao-page"
                >

                    <div class="page-toolbar">

                        <div>

                            <span class="welcome-label">
                                CONFERÊNCIA BANCÁRIA
                            </span>

                            <h2>
                                Reconciliação Bancária
                            </h2>

                            <p>
                                Compare os movimentos registados
                                no PRISMA com o extrato bancário.
                            </p>

                        </div>

                    </div>

                    ${await renderNovaReconciliacao()}

                    ${renderFiltrosHistorico()}

                </section>
            `,
            utilizador
        );

        ativarSeletorConta();

        atualizarResumoConta();

        document
            .getElementById(
                'reconciliacaoNovaForm'
            )
            ?.addEventListener(
                'submit',
                criarReconciliacao
            );

        document
            .getElementById(
                'reconciliacaoAnalisarButton'
            )
            ?.addEventListener(
                'click',
                analisarPeriodo
            );

        document
            .getElementById(
                'reconciliacaoAtualizarContas'
            )
            ?.addEventListener(
                'click',
                async () => {

                    try {

                        await carregarContas();

                        contaSelecionada =
                            null;

                        const picker =
                            document.querySelector(
                                '[data-picker="reconciliacaoConta"]'
                            );

                        if (picker) {
                            picker.outerHTML =
                                renderSeletorConta();

                            ativarSeletorConta();
                        }

                        atualizarResumoConta();

                        const filtro =
                            document.getElementById(
                                'reconciliacaoFiltroConta'
                            );

                        if (filtro) {
                            filtro.innerHTML = `
                                <option value="">
                                    Todas as contas
                                </option>

                                ${contas.map(
                                    conta => `
                                        <option
                                            value="${esc(
                                                conta.id
                                            )}"
                                        >
                                            ${esc(
                                                conta.numero_conta
                                            )}
                                            —
                                            ${esc(
                                                conta.cliente_nome ||
                                                ''
                                            )}
                                        </option>
                                    `
                                ).join('')}
                            `;
                        }

                        toast(
                            'Lista de contas atualizada.',
                            'success'
                        );

                    } catch (error) {

                        toast(
                            error.message ||
                            'Não foi possível atualizar as contas.',
                            'error'
                        );
                    }
                }
            );

        ativarFiltrosHistorico();

        await carregarHistorico();
    }

    /* =========================================================
       API PÚBLICA DO MÓDULO
       ========================================================= */

    window.PRISMA_MODULES =
        window.PRISMA_MODULES || {};

    window.PRISMA_MODULES.reconciliacao =
        renderModulo;

})();
