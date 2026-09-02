# PRISMA Banking — Arquitetura STABLE REV10

## Objetivo

Aplicação educacional local para simulação de operações bancárias. O sistema não é um banco real e não depende de Internet para funcionar.

## Estrutura

```text
PRISMA-BANKING/
├── electron-main.js
├── package.json
├── package-lock.json
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── assets/
│   └── js/
│       ├── app.js
│       ├── dashboard.js
│       └── modules/
├── backend/
│   ├── .env
│   ├── package.json
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── database/
│       ├── middleware/
│       ├── routes/
│       └── server.js
└── scripts/
    └── verify.js
```

## Empacotamento Electron

O `electron-builder` mantém apenas o `backend` em `app.asar.unpacked`, porque ele precisa de executar como processo Node separado. O `frontend` permanece dentro de `app.asar` e é localizado pelo backend através de `PRISMA_APP_PATH`/Electron.

```text
resources/
├── app.asar
│   └── frontend/
└── app.asar.unpacked/
    └── backend/
    │   ├── node_modules/
    │   ├── src/
    │   ├── .env
    │   └── package.json
```

## Autenticação

O login gera um JWT de curta duração configurado por `JWT_EXPIRES_IN`. Os endpoints protegidos exigem:

```text
Authorization: Bearer <token>
```

O ID do operador utilizado para auditoria vem do token (`req.user.id`) e não de um campo enviado pelo frontend.

## Autorização

As permissões são verificadas no backend através de:

```text
middleware/auth.js
        ↓
middleware/permissoes.js
        ↓
controller
```

O frontend continua a esconder menus sem permissão, mas isso é apenas uma camada de UX. A decisão de segurança é sempre feita no backend.

## Banco de dados

A inicialização é idempotente: tabelas, índices, permissões e relações necessárias são criados apenas quando não existem.

## Dependências

As dependências do backend pertencem exclusivamente a `backend/package.json`. O `package.json` raiz contém apenas as dependências necessárias para Electron/build.

## Validação antes do build

Executar:

```powershell
npm install
npm run verify
```

O `verify` valida estrutura, dependências essenciais, JWT, módulos frontend e configuração do Electron Builder.

## Estado

`0.13.3-STABLE-REV10` — versão estrutural candidata a teste, após auditoria estática. O teste integrado em Windows com PostgreSQL e o build NSIS continua obrigatório antes de declarar estabilidade final.
