# Auditoria profunda — REV10

## Resultado

REV10 passou a auditoria estrutural e de regressão após correções adicionais.

### Correções críticas verificadas

1. **Transferências agendadas**
   - Corrigido o cálculo de saldo disponível durante a execução.
   - A própria reserva da transferência não é contada como uma reserva adicional.
   - Origem e destino são bloqueados na mesma consulta e em ordem determinística.
   - Falhas libertam a reserva.
   - Execução continua transacional.

2. **Electron / instância do backend**
   - O Electron deixa de adotar automaticamente um serviço já existente na porta padrão.
   - Uma porta local livre é escolhida antes do arranque.
   - A porta selecionada é enviada ao backend por `PORT`.
   - `API_URL` e `HEALTH_URL` são atualizados com a porta real.

3. **Autenticação**
   - Rate limit de login por IP + identificador.
   - Tentativas são limpas após autenticação válida.
   - Respostas de autenticação continuam com `Cache-Control: no-store`.

4. **Empacotamento**
   - Apenas `backend/**/*` permanece em `asarUnpack`.
   - Frontend permanece no `app.asar`.
   - `PRISMA_FRONTEND_DIR`/`PRISMA_APP_PATH` permitem localizar o frontend.

5. **Regressão**
   - `node --check` em todos os JavaScript fora de `node_modules`.
   - `node scripts/verify.js` passou.

## Limitação

Esta auditoria não substitui o teste integrado em Windows com PostgreSQL nem o build NSIS final. Esses testes devem ser realizados somente depois da auditoria estrutural final.
