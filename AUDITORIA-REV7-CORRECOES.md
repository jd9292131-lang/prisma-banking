# Auditoria e correções — REV7

## Correções implementadas após auditoria REV6

- Substituída a geração concorrente `MAX()+1` de clientes por sequência PostgreSQL `cliente_numero_seq`.
- Substituída a geração concorrente `MAX()+1` de contas por `conta_numero_seq`.
- Adicionadas sequências para cheques e cartões.
- Cheques passaram a reservar saldo através de `contas.valor_reservado_cheques`.
- Emissão de cheque usa transação e bloqueio `FOR UPDATE`.
- Pagamento de cheque debita o saldo e liberta a reserva.
- Cancelamento/devolução de cheque libertam a reserva.
- Levantamentos, transferências imediatas e pagamentos de serviços respeitam saldo reservado por cheques.
- Cartões validam que a conta pertence ao cliente e que ambos estão ativos.
- Geração de número de cartão passou para sequência PostgreSQL.
- `clientesController` foi normalizado para usar o pool PostgreSQL.
- Verificação de sintaxe JavaScript executada em todos os ficheiros JS.

## Nota

Esta revisão ainda deve passar por nova auditoria antes de qualquer teste manual.
