const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prismaConnection', {
    conectar: (serverUrl) => {
        return ipcRenderer.invoke(
            'prisma:connect-server',
            serverUrl
        );
    },

    cancelar: () => {
        return ipcRenderer.invoke(
            'prisma:cancel-connect'
        );
    }
});