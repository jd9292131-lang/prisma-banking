# PRISMA Banking v0.13

## Objetivo
Aplicação local de formação bancária, com interface desktop inspirada em sistemas ERP clássicos/Windows 7. Não é um banco real e não processa dinheiro real.

## 1. Requisitos
- Windows 10/11 x64
- Node.js LTS (para desenvolvimento/build)
- PostgreSQL local
- Base de dados configurada no `backend/.env`

## 2. Desenvolvimento
Terminal 1:
```powershell
cd backend
npm install
npm start
```

Ou, para abrir como desktop depois de instalar as dependências da raiz:
```powershell
npm install
npm start
```

## 3. Gerar o instalador .EXE
Na pasta raiz:
```powershell
npm install
npm run dist
```

O instalador NSIS será criado em:
`dist\PRISMA-Banking-0.13.0-x64.exe`

Versão portátil:
```powershell
npm run dist:portable
```

## 4. Autenticação
O acesso utiliza `Código do operador + palavra-passe`.

- Formandos podem criar o próprio acesso.
- O código é atribuído automaticamente pelo servidor (`OP-000001`, etc.).
- A criação de FORMADOR não está disponível no registo público.
- O perfil FORMADOR deve ser administrado pela gestão do sistema/base de dados.

## 5. Clientes
A ficha de cliente inclui número de BI. A pesquisa do módulo Clientes aceita nome, BI, NIF, telefone e número de cliente. O número de conta permanece consultável a partir do módulo Contas/seletores F2.

## 6. PDF
Endpoints disponíveis:
- `/api/documentos/extrato/:contaId.pdf`
- `/api/documentos/comprovativo/:id.pdf`

Os documentos são pedagógicos e identificados como documentos de simulação.

## 7. Nota de instalação
A aplicação desktop continua a depender do PostgreSQL local configurado. O Electron apenas substitui o navegador e inicia o servidor local automaticamente.

Para uma distribuição realmente autónoma numa sala de formação, a próxima etapa deve criar um instalador que também configure/verifique o serviço PostgreSQL, a base de dados e os parâmetros de instalação.


## v0.13.3 — correções profissionais

- Serviço local Electron com carregamento explícito de `backend/.env`.
- Diagnóstico de erro do PostgreSQL antes da abertura da interface.
- Ícone do Windows definido pelo logótipo PRISMA (`prisma-banking.ico`).
- F2 no módulo Clientes abre a tabela completa de seleção.
- Na tabela F2: clique seleciona a linha; duplo clique confirma.
- Campo Clientes mostra apenas os resultados normais durante a digitação.
- Reforço de contraste e legibilidade da navegação lateral.
