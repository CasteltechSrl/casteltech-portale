// Righe cliccabili negli elenchi
document.querySelectorAll('tr[data-href]').forEach(tr => {
  tr.addEventListener('click', e => { if (!e.target.closest('a, button, input')) location.href = tr.dataset.href; });
});
