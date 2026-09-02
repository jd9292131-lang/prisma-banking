# AUDITORIA PROFUNDA — PRISMA Banking v0.13.3 REV15(2)

## Resultado

Foi realizada uma revisão estática e estrutural da distribuição, com foco especial em bootstrap da base de dados, Electron/ASAR e emissão de extratos/comprovativos sem depender de navegador externo.

## Correções aplicadas

### 1. Bootstrap de uma base PostgreSQL vazia — CRÍTICO
`initialize.js` assumia que `perfis`, `permissoes`, `perfil_permissoes`, `usuarios` e `clientes` já existiam. Isso contradizia a promessa de inicialização automática e podia fazer uma instalação limpa falhar antes de o servidor arrancar.

Foi acrescentada a criação idempotente destas tabelas e dos perfis FORMADOR/FORMANDO antes das migrações que dependem delas.

### 2. Extratos PDF no Electron — ALTO
O backend já gerava `/api/documentos/extrato/:contaId.pdf`, mas o frontend não o consumia. Foi adicionada uma ação `Extrato PDF` na ficha da conta, usando o token de sessão e carregando o PDF numa janela interna.

### 3. Comprovativo de movimento — ALTO
A emissão do comprovativo de movimento agora:
1. regista o comprovativo no backend;
2. recebe o ID persistido;
3. solicita o PDF autenticado ao backend;
4. abre o PDF numa janela interna do Electron.

### 4. `window.open` / Electron — ALTO
O Electron passa a permitir exclusivamente `about:blank` para janelas secundárias criadas pelo sistema. URLs externas continuam bloqueadas/encaminhadas para o sistema operativo.

### 5. Impressão e CSP — MÉDIO
Foi removido o script inline que executava `window.print()` no documento HTML. O evento `load` é associado pelo código da aplicação. O botão de impressão dos relatórios também deixou de usar `onclick` inline.

### 6. Auditoria preventiva
`verify.js` foi ampliado para impedir regressões nestas áreas:
- rotas PDF;
- estrutura de `comprovativos`;
- bootstrap das tabelas nucleares;
- abertura de documentos no Electron;
- ausência de abertura HTTP externa para documentos.

## Validações executadas

- `node --check` em todos os JavaScript: **OK**
- `node scripts/verify.js`: **OK**
- `npm ci --dry-run --ignore-scripts` na raiz: **OK**
- `npm ci --dry-run --omit=dev --ignore-scripts` no backend: **OK**
- verificação de handlers HTML inline relevantes: **OK** para os casos de CSP auditados

## Limitação conhecida

O ZIP de auditoria não contém `backend/.env`. Portanto não é possível validar uma ligação real ao PostgreSQL nem executar o instalador final com as credenciais locais. O `preflight-build.js` continua corretamente configurado para bloquear um build sem essa configuração.

## Estado

**Estruturalmente aprovado para a próxima fase de testes**, mas ainda não deve ser chamado de versão final até executar o build real e os testes funcionais com PostgreSQL na máquina de destino.
