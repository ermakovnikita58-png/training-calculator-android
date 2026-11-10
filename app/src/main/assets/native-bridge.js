(() => {
  const channel = window.ForgeNative;
  if (!channel?.postMessage) return;
  const send = (action, data = {}) => channel.postMessage(JSON.stringify({ action, ...data }));
  window.AndroidBridge = Object.freeze({
    navigationState: (ready, canGoBack) => send('navigation', { ready, canGoBack }),
    saveBlob: (filename, base64, mime) => send('export', { filename, base64, mime }),
    saveTrainingImportBackup: (filename, base64, request) => send('export', { filename, base64, request, mime: 'application/json' }),
    checkpoint: (payload) => send('checkpoint', { payload }),
    readCheckpoint: () => send('readCheckpoint'),
    deleteCheckpoint: () => send('deleteCheckpoint'),
    diagnostics: () => send('diagnostics')
  });
  channel.onmessage = ({ data }) => {
    try { window.ForgeDevice?.receive(JSON.parse(data)); } catch {}
  };
})();
