// Fallback view: shown only if the bundled server does not come up in time.
const retry = document.getElementById('retry');
retry?.addEventListener('click', () => location.reload());
