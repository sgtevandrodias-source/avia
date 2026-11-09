// Registra o service worker (cache do app pra abrir offline). Fica num
// arquivo próprio, e não embutido no index.html, porque a política de
// segurança do site (functions/_middleware.js) só aceita scripts em arquivo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
