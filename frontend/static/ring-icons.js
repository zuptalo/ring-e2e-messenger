// Runs in <head> after icon <link> tags. Firefox iOS resolves some favicon URLs
// relative to the page; absolutize while the document is still parsing.
(function () {
  var origin = location.origin;
  var links = document.querySelectorAll(
    'link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"],link[rel="apple-touch-icon-precomposed"]',
  );
  for (var i = 0; i < links.length; i++) {
    var el = links[i];
    var href = el.getAttribute('href');
    if (!href || href.indexOf('//') !== -1) continue;
    if (href.charAt(0) === '/') el.setAttribute('href', origin + href);
  }
  var metas = document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]');
  for (var j = 0; j < metas.length; j++) {
    var m = metas[j];
    var content = m.getAttribute('content');
    if (!content || content.indexOf('//') !== -1) continue;
    if (content.charAt(0) === '/') m.setAttribute('content', origin + content);
  }
})();
