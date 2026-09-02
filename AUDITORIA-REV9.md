# Auditoria REV8 → REV9

## Objetivo

Correção rigorosa antes de qualquer teste manual. Esta revisão trata falhas de consistência de operações, empacotamento Electron e validação de estrutura.

## Correções aplicadas

### 1. Transferências agendadas
- Criada reserva financeira `contas.valor_reservado_transferencias`.
- O valor comprometido deixa de ficar disponível para levantamentos, pagamentos, cheques e novas transferências.
- Criado índice `idx_transferencias_agendadas`.
- Criado processamento automático de transferências vencidas na inicialização e a cada 30 segundos.
- Transferências concluídas geram movimentos de saída/entrada.
- Transferências impossíveis são marcadas como `FALHOU` e a reserva é libertada quando aplicável.
- O processamento usa transações e `FOR UPDATE SKIP LOCKED`.

### 2. Concorrência de transferências
- Contas de origem/destino internas são bloqueadas em ordem determinística (`ORDER BY id`) para reduzir risco de deadlock em transferências simultâneas.

### 3. Crédito
- Criação de crédito agora valida cliente ativo, tipo, valor, prazo, taxa, rendimento, encargos e entrada inicial.
- A criação recalcula prestação, juros e capital no backend.
- Simulação recebeu as mesmas validações essenciais.

### 4. Análise de risco
- Validação de cliente ativo.
- Validação de existência do crédito.
- Validação de correspondência crédito → cliente.
- Normalização dos valores monetários.

### 5. Cheques e operações
- Levantamentos, pagamentos de serviços e emissão/pagamento de cheques passam a respeitar também reservas de transferências agendadas.

### 6. Empacotamento
- Apenas `backend/**/*` permanece em `asarUnpack`.
- O frontend permanece no `app.asar`.
- O backend recebe `PRISMA_APP_PATH` e `PRISMA_ENV_FILE` do Electron.
- O resolvedor de frontend possui fallback para desenvolvimento e instalações empacotadas.

### 7. Verificação automática
- `scripts/verify.js` foi atualizado para a arquitetura atual.
- A verificação ignora `node_modules`, `dist` e `.git` durante a análise de JavaScript.
- O verificador agora exige a infraestrutura de reservas e o scheduler das transferências agendadas.

## Verificações executadas

- `node --check` em todos os JavaScript do projeto: **PASSOU**.
- `node scripts/verify.js`: **PASSOU**.
- Configuração `files`: backend e frontend presentes: **PASSOU**.
- `asarUnpack`: somente backend: **PASSOU**.
- Dependências de backend separadas da raiz: **PASSOU**.
- JWT mínimo e configuração de autenticação: **PASSOU**.
- Middleware global de autenticação para `/api`: **PASSOU**.
- Verificação de identidade do operador: **PASSOU**.
- Estrutura de reserva de transferências: **PASSOU**.
- Scheduler de transferências: **PASSOU**.

## Limitação desta auditoria

Ainda não foi declarado teste integrado final. A validação real deve incluir PostgreSQL em Windows, inicialização do Electron empacotado, login, abertura de conta, caixa, transferência imediata, transferência agendada, cheque, crédito, cartões, formação, documentos e build NSIS.


## Auditoria complementar REV9 → REV10

### Correções adicionais

- Corrigido o cálculo de disponibilidade no processamento de transferências agendadas: a própria reserva da transferência não pode ser contada como uma nova necessidade de saldo.
- O scheduler passa a bloquear origem e destino na mesma consulta e ordem determinística.
- O Electron deixa de reutilizar arbitrariamente qualquer backend que esteja na porta 3000. Seleciona uma porta local livre e inicia a sua própria instância.
- Adicionado rate limit de login por IP + identificador, com limpeza após autenticação válida.
- O verificador passou a proteger estas regras contra regressões.

### Problemas que esta auditoria procurou especificamente

- backend externo/antigo a responder na porta padrão;
- saldo disponível incorretamente calculado para transferências agendadas;
- deadlocks entre origem/destino;
- brute force básico de autenticação;
- divergência entre versão declarada e estrutura do pacote.
