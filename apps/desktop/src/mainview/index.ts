// Fallback view: shown only if the bundled server does not come up in time.
const close = document.getElementById('close');
close?.addEventListener('click', () => {
  const params = new URLSearchParams(window.location.search);
  const port = params.get('controlPort');
  const token = params.get('controlToken');
  if (port && token) {
    void fetch(`http://127.0.0.1:${port}/close?token=${token}`).catch(() => {});
  }
  window.close();
});
