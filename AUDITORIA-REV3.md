# Auditoria interna — STABLE REV3

## Ciclo aplicado
Correção -> auditoria estática -> correção -> nova auditoria.

## Correções desta revisão
- Proteção básica contra tentativas excessivas no registo público de formandos.
- Respostas de login/registo marcadas como `Cache-Control: no-store`.
- `verify.js` reforçado para detectar regressões de caminhos do frontend e identidade do operador.
- Documentada a decisão de manter backend e frontend em `app.asar.unpacked`: o backend é executado localmente e serve o frontend por Express.

## Auditoria pós-correção
- Sintaxe JavaScript.
- Integridade da estrutura.
- Regras de build.
- Caminhos de desenvolvimento e empacotamento.
- Dependências essenciais.
- JWT e identidade autenticada.
- Ausência de `criadoPor` vindo do body nos controladores críticos.
