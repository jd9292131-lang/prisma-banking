# PRISMA Banking — implementação STABLE REV9

Esta revisão concentra-se em estabilidade de execução, empacotamento e segurança da sessão.

## Correções desta revisão

- Backend e frontend preparados para `app.asar.unpacked`.
- Dependências do backend mantidas em `backend/package.json`.
- `npm run dist` prepara as dependências de produção do backend.
- Resolução explícita do `.env` através de `backend/src/config/env.js`.
- JWT implementado no login.
- Middleware de autenticação para todas as APIs protegidas.
- Middleware de autorização baseado nas permissões da base de dados.
- Operações passam a obter `utilizador_id` do token, não do corpo da requisição.
- Verificação estrutural reforçada em `scripts/verify.js`.

## Teste recomendado

1. Extrair o projeto.
2. Executar `npm install` na raiz.
3. Executar `npm run verify`.
4. Confirmar PostgreSQL e a base `prisma_banking`.
5. Executar `npm start` para validar desenvolvimento.
6. Executar `npm run dist` para gerar o instalador NSIS.
7. Testar o executável instalado.

## Observação de segurança

O sistema é um simulador local. O JWT melhora a separação entre frontend e backend e impede chamadas sem sessão, mas não deve ser tratado como segurança contra um utilizador com controlo administrativo da própria máquina, pois o backend e a configuração pertencem à instalação local.
