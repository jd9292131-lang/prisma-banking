# Auditoria REV4

## Correções
- O carregamento de configuração agora respeita `PRISMA_ENV_FILE`, evitando divergência entre desenvolvimento e Electron empacotado.
- `dotenv` passou a usar `quiet: true`, eliminando mensagens de inicialização desnecessárias.
- O servidor valida a existência de `frontend/index.html` antes de iniciar.
- O frontend deixou de enviar `utilizadorId` em operações cuja identidade já vem do token autenticado.
- A gestão de notas passou a listar apenas utilizadores do perfil `FORMANDO`.
- A preparação do backend para distribuição usa `npm ci`, garantindo instalação reprodutível a partir do `package-lock.json`.

## Auditoria pós-correção
- Sintaxe JavaScript: validada com `node --check`.
- Verificador interno: `node scripts/verify.js`.
- Integridade do ZIP: validada.
- `node_modules` e `dist`: ausentes do arquivo final.
