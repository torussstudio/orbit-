(function () {
  try {
    var c = localStorage.getItem('orbit_theme_last') || 'light';
    var dark = c === 'dark' || (c === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    var r = document.documentElement;
    r.dataset.theme = dark ? 'dark' : 'light';
    r.style.colorScheme = dark ? 'dark' : 'light';
    if (dark) document.querySelector('meta[name="theme-color"]').setAttribute('content', '#17191c');
  } catch (e) {}
})();
