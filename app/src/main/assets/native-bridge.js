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
    diagnostics: () => send('diagnostics'),
    scanBarcode: () => send('scanBarcode'),
    preferences: () => send('preferences'),
    analyticsConsent: enabled => send('analyticsConsent', { enabled }),
    crashConsent: enabled => send('crashConsent', { enabled }),
    notificationConsent: enabled => send('notificationConsent', { enabled }),
    analyticsEvent: event => send('analyticsEvent', { event }),
    diagnosticEvent: category => send('diagnosticEvent', { category }),
    restDeadline: deadline => send('restDeadline', { deadline }),
    storeCloudSession: session => send('storeCloudSession', { session }),
    readCloudSession: () => send('readCloudSession'),
    healthRead: () => send('healthRead'),
    healthDisconnect: () => send('healthDisconnect')
  });
  window.ForgeAnalytics = event => window.AndroidBridge.analyticsEvent(event);
  window.addEventListener('error', () => AndroidBridge.diagnosticEvent('web_error'));
  window.addEventListener('unhandledrejection', () => AndroidBridge.diagnosticEvent('web_rejection'));
  channel.onmessage = ({ data }) => {
    try {
      const result = JSON.parse(data);
      if (result.kind.startsWith('cloud')) window.ForgeCloudSession?.(result);
      else window.ForgeDevice?.receive(result);
    } catch {}
  };
})();
