// Fallback view: shown only if the bundled server does not come up in time.
const close = document.getElementById('close');
close?.addEventListener('click', () => window.close());
