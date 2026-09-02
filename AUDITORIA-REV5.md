# Auditoria REV5

## Problema crítico encontrado

A auditoria independente encontrou uma regressão no `backend/src/server.js`:

```js
const FRONTEND_INDEX = FRONTEND_INDEX;
```

Apesar de passar na verificação de sintaxe JavaScript, essa linha falha em execução com erro de inicialização por auto-referência da variável. Isto impediria o backend de arrancar e, consequentemente, o Electron não conseguiria abrir a aplicação.

## Correção

A construção do caminho foi restaurada para:

```js
const FRONTEND_INDEX = path.join(FRONTEND_DIR, 'index.html');
```

O `scripts/verify.js` também foi reforçado para falhar se essa regressão voltar a aparecer.

## Validações realizadas

- Sintaxe de todos os ficheiros JavaScript do projeto.
- `npm run verify`.
- Presença dos ficheiros essenciais.
- Configuração de `asarUnpack` para backend e frontend.
- Integridade do arquivo ZIP.
- Ausência de `node_modules` e `dist` no ZIP final.

## Resultado

A REV5 corrige uma falha de arranque real encontrada antes do teste do utilizador.
