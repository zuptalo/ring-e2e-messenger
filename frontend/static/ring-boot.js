// Runs synchronously in <head> before first paint. Sets data-ring-view so CSS can
// show the correct prerender block and avoid flashing the app shell on iOS browsers.
(function () {
  var ua = navigator.userAgent || '';
  var ios =
    /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Macintosh') !== -1 && navigator.maxTouchPoints > 1);
  var standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  var view = standalone ? 'standalone' : ios ? 'coach' : 'browser';
  document.documentElement.setAttribute('data-ring-view', view);
})();
