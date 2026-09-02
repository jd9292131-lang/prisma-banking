# AUDITORIA REV14

## Objetivo
Auditoria rigorosa da REV13 com foco em regressões de empacotamento Electron, configuração PostgreSQL, integridade estrutural e segurança básica.

## Verificações executadas

- `node --check` em todos os ficheiros JavaScript: **0 erros**.
- `node scripts/verify.js`: **PASSOU**.
- Referências locais via `require(...)`: **nenhuma referência local em falta**.
- Pesquisa de SQL interpolado de forma suspeita: **nenhuma ocorrência encontrada**.
- Pesquisa de `eval` / `new Function`: **nenhuma ocorrência encontrada**.
- Pesquisa de `Math.random()` no backend: **nenhuma ocorrência operacional**.
- `Math.random()` restante: apenas no próprio verificador/auditoria.
- `asarUnpack`: apenas `backend/**/*`.
- Frontend permanece no ASAR.
- Backend contém `node_modules` durante o build através de `prepare:backend`.
- Proteção contra múltiplas instâncias Electron presente.
- Seleção de porta local presente.
- Scheduler de transferências agendadas presente e com `FOR UPDATE SKIP LOCKED`.
- Índice único case-insensitive para nomes de utilizador presente.
- UUID criptograficamente forte nas referências operacionais presente.

## Problema adicional encontrado e corrigido

A REV13 tinha uma inconsistência importante no processo de auditoria/build:

- `verify.js` exigia `backend/.env`, embora o ZIP distribuível pudesse ser entregue sem credenciais locais.
- Isso fazia a auditoria estática falhar antes de chegar às verificações reais.
- O build também não tinha uma barreira explícita que impedisse a criação de um instalador sem configuração PostgreSQL.

### Correção REV14

1. `verify.js` agora trata a ausência de `.env` como aviso durante auditoria estática.
2. Criado `scripts/preflight-build.js`.
3. `pre-dist` e `pre-dist:portable` executam:
   - instalação limpa das dependências do backend;
   - auditoria;
   - preflight obrigatório.
4. O preflight **bloqueia o build** se faltar:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `JWT_SECRET` com pelo menos 32 caracteres
5. Criado `backend/.env.example` sem credenciais reais.

## Limitação deliberadamente mantida

Não foi inventado nem incluído um `.env` real, porque ele contém credenciais específicas do PostgreSQL da máquina de execução.

Portanto, o instalador agora falha cedo e explicitamente se a configuração real não estiver presente, em vez de gerar um `.exe` aparentemente válido que posteriormente abre com `Not Found`, falha no backend ou não consegue conectar à base de dados.

## Estado

**REV14 — aprovada na auditoria estática.**

Ainda não é considerada candidata final até executar, numa máquina Windows com PostgreSQL:

1. `npm install`
2. `npm run verify`
3. `npm run dist`
4. execução do `win-unpacked`
5. execução do instalador NSIS
6. login
7. operações de caixa
8. transferência imediata
9. transferência agendada
10. crédito
11. cheques/cartões
12. formação
13. fecho/reconciliação
14. encerramento e reabertura do aplicativo.
