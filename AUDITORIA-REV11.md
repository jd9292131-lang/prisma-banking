# Auditoria REV11

## Correções desta revisão

1. **Concorrência do caixa físico**
   - Operações de caixa agora usam `pg_advisory_xact_lock` dentro da transação.
   - Isso impede que duas operações simultâneas leiam o mesmo saldo físico e ultrapassem o numerário disponível.

2. **Validade de cartões**
   - O backend valida formato/data.
   - Não permite emitir cartão já vencido.

3. **Validade de cheques**
   - O backend valida a data de validade na emissão.
   - Não permite emitir cheque com validade passada.
   - Não permite pagar cheque já fora da validade.

## Auditoria técnica

- `node --check` em todos os JavaScript fora de `node_modules`: PASSOU.
- `node scripts/verify.js`: PASSOU.
- `asarUnpack`: somente backend: PASSOU.
- Frontend dentro do ASAR: configuração PASSOU.
- Backend com dependências separadas: PASSOU.
- Middleware global de autenticação: PASSOU.
- Rate limit de login: PASSOU.
- Identidade do operador via JWT: PASSOU.
- Reservas de cheques e transferências: PASSOU.
- Scheduler de transferências: PASSOU.
- Lock de caixa físico: PASSOU.

## Limitação

Ainda não houve execução integrada do `.exe`/NSIS em Windows nesta sessão. A validação final deve ser feita no ambiente Windows com PostgreSQL, mas somente depois de uma nova auditoria independente desta revisão.
