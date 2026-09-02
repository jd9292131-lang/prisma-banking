# PRISMA Banking v0.13.3 — Auditoria REV15

## Objetivo

Auditoria focada na estabilidade da cadeia Electron → backend local → frontend, além de regressões no processo de build.

## Correções aplicadas

### 1. Reutilização segura do backend existente

O Electron verificava a porta disponível antes de verificar se já existia uma API local funcional. Isso podia criar uma segunda instância em `3001`, `3002`, etc. quando o backend de desenvolvimento já estivesse ativo em `3000`.

**Correção:** a porta padrão `3000` é agora testada primeiro. Se `/api/health` responder `200`, o Electron reutiliza essa API e não cria outro backend.

### 2. Build reprodutível

A auditoria passou a exigir `backend/package-lock.json` e os scripts essenciais do `package.json` raiz:

- `start`
- `dist`
- `dist:portable`
- `prepare:backend`
- `pre-dist`
- `pre-dist:portable`
- `verify`
- `preflight:build`

### 3. Preflight de configuração

O preflight continua bloqueando o instalador quando `backend/.env` não existe ou quando faltam:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET` com pelo menos 32 caracteres

Foi realizado um teste positivo com um `.env` temporário e o ficheiro foi removido antes da criação do artefacto.

## Verificações executadas

- `node --check electron-main.js` → **OK**
- `node scripts/verify.js` → **OK**
- `node scripts/preflight-build.js` sem `.env` → **bloqueou corretamente (exit 1)**
- `node scripts/preflight-build.js` com configuração temporária válida → **OK**
- `.env` temporário removido antes do empacotamento → **OK**
- `node_modules` não incluído no artefacto → **OK**

## Estado

**REV15 — aprovada na auditoria estática e de preflight.**

### Limitação restante

A validação final do `.exe` continua a exigir ambiente Windows real com PostgreSQL instalado e configurado. A auditoria não considera isso validado apenas por inspeção do ZIP.
