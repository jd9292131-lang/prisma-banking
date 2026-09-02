# Auditoria REV7 → REV8

## Falha crítica
O backend desempacotado procurava o frontend em `app.asar.unpacked/frontend`, mas o build desempacota apenas `backend/**/*`. O frontend permanece em `app.asar/frontend`.

## Correção
`electron-main.js` agora passa `PRISMA_FRONTEND_DIR` com o caminho exato de `app.getAppPath()/frontend`. `paths.js` também suporta diretamente `app.asar/frontend` e mantém os fallbacks anteriores.
