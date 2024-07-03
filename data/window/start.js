navigator.serviceWorker.register('./worker.js').then(registration => {
  import('./shell.mjs');
}).catch(e => {
  console.error('ServiceWorker registration failed', e);
  alert(e.message);
});
