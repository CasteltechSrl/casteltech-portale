// Righe cliccabili negli elenchi
document.querySelectorAll('tr[data-href]').forEach(tr => {
  tr.addEventListener('click', e => { if (!e.target.closest('a, button, input, label, td.selezione')) location.href = tr.dataset.href; });
});

// Elenco preventivi: spunte e azioni (crea commessa, duplica, elimina)
const modulo = document.getElementById('azioni-elenco');
if (modulo) {
  const caselle = () => [...modulo.querySelectorAll('input[name=ids]')];
  const tutti = document.getElementById('seleziona-tutti');
  const conta = document.getElementById('n-selezionati');
  const aggiorna = () => {
    const n = caselle().filter(c => c.checked).length;
    conta.textContent = n ? `${n} selezionat${n === 1 ? 'o' : 'i'}` : 'Nessun preventivo selezionato';
    modulo.querySelectorAll('button[data-serve]').forEach(b => { b.disabled = b.dataset.serve === '1' ? n !== 1 : n === 0; });
    if (tutti) { tutti.checked = n > 0 && n === caselle().length; tutti.indeterminate = n > 0 && n < caselle().length; }
  };
  modulo.addEventListener('change', aggiorna);
  if (tutti) tutti.addEventListener('change', () => { caselle().forEach(c => { c.checked = tutti.checked; }); aggiorna(); });
  modulo.addEventListener('submit', e => {
    if (e.submitter?.value !== 'elimina') return;
    const n = caselle().filter(c => c.checked).length;
    if (!window.confirm(`Eliminare ${n} preventiv${n === 1 ? 'o' : 'i'}? L'operazione non si può annullare (prima viene salvato un backup).`)) e.preventDefault();
  });
  aggiorna();
}
