# AUDITORIA CHECKMATE — REV15-2

Data: 28/08/2026

## Alterações corretivas incluídas

1. Comprovativos
- Removido o fluxo legado que criava documentos HTML com `document.write()`.
- Os comprovativos genéricos do dashboard passam agora pelo fluxo persistente:
  operação -> API -> tabela `comprovativos` -> PDFKit -> janela interna do Electron.
- A lista de comprovativos reabre o PDF persistente pelo ID, sem reconstruir HTML no frontend.
- O gerador PDF passou a suportar `dados.linhas`, preservando os campos específicos do comprovativo.
- Adicionada paginação defensiva para listas longas de linhas.

2. Serviço local Electron
- A verificação de uma API já ativa deixou de aceitar qualquer servidor que responda HTTP 200.
- Agora valida a identidade esperada do PRISMA (`success`, `environment=simulation`, `internetRequired=false`).
- Isto reduz o risco de o Electron reutilizar por engano um serviço diferente na porta 3000.

3. Auditoria automática
- `scripts/verify.js` passou a bloquear regressões do fluxo legado de comprovativos.
- O verificador exige o fluxo persistente da API e a renderização de linhas estruturadas no PDF.
- O verificador exige a validação de identidade do serviço local.

## Verificações executadas

- `node --check` em todos os 40 ficheiros JavaScript: APROVADO.
- `node scripts/verify.js`: APROVADO.
- `npm ci --dry-run` na raiz: APROVADO.
- `npm ci --prefix backend --dry-run`: APROVADO.
- `preflight-build.js` com configuração `.env` de teste baseada no exemplo: APROVADO.

## Limitação conhecida do ZIP

O ZIP continua sem `backend/.env` e sem `node_modules`, conforme a origem fornecida.
Isto é correto para não transportar a palavra-passe do PostgreSQL nem dependências instaladas.
Para construir o instalador localmente, é necessário restaurar um `backend/.env` válido antes do build.
