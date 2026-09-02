# AUDITORIA REV12 → REV13

## Falhas encontradas
- Sequência `operador_codigo_seq` podia saltar o primeiro código numa base sem códigos existentes.
- Registo concorrente não tinha garantia explícita de unicidade case-insensitive do nome de utilizador.
- Movimento de pagamento de cheque ainda usava `Date.now() + Math.random()`.
- Pagamento de serviços não rejeitava explicitamente `NaN` e comissão negativa.
- Fecho de caixa não validava explicitamente saldo físico finito e não negativo.

## Correções
- Corrigido `setval` da sequência de operadores.
- Criado índice único `LOWER(nome_utilizador)`.
- Movimento de cheque passou para UUID.
- Reforçadas validações de pagamentos e fecho de caixa.
- `verify.js` passou a verificar estas regressões.

## Limite da auditoria
A auditoria estática não substitui o build e execução real do `.exe` em Windows com PostgreSQL.
