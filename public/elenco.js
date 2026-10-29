// Righe cliccabili negli elenchi
document.querySelectorAll('tr[data-href]').forEach(tr => {
  tr.addEventListener('click', e => { if (!e.target.closest('a, button, input, label, td.selezione')) location.href = tr.dataset.href; });
});

// Elenchi con spunte e pulsanti in alto a destra (preventivi, commesse, ordini, BOM…): src/server/views/azioni-elenco.ts
document.querySelectorAll('form.azioni-elenco').forEach(modulo => {
  const caselle = () => [...modulo.querySelectorAll('input[name=ids]')];
  const spuntate = () => caselle().filter(c => c.checked);
  const tutti = modulo.querySelector('.seleziona-tutti');
  const conta = modulo.querySelector('.n-selezionati');
  const d = modulo.dataset;
  // gruppi = a cosa appartengono le righe spuntate (es. gli ordini delle righe); senza gruppi ogni riga conta da sola
  const gruppi = () => new Set(spuntate().map(c => c.dataset.gruppo ?? c.value)).size;
  const aggiorna = () => {
    const n = spuntate().length, g = gruppi();
    let testo = n === 0 ? d.nessuno : n === 1 ? d.uno : d.tanti.replace('{n}', n);
    if (n && d.gruppoUno) testo += ` (${g === 1 ? `1 ${d.gruppoUno}` : `${g} ${d.gruppoTanti}`})`;
    if (conta) conta.textContent = testo;
    modulo.querySelectorAll('button[data-serve]').forEach(b => { b.disabled = b.dataset.serve === '1' ? g !== 1 : n === 0; });
    if (tutti) { tutti.checked = n > 0 && n === caselle().length; tutti.indeterminate = n > 0 && n < caselle().length; }
  };
  modulo.addEventListener('change', aggiorna);
  if (tutti) tutti.addEventListener('change', () => { caselle().forEach(c => { c.checked = tutti.checked; }); aggiorna(); });
  modulo.addEventListener('submit', e => {
    const domanda = e.submitter?.dataset.chiedi;
    if (!domanda) return;
    const n = spuntate().length;
    // {n} = righe spuntate, {g} = gruppi, {uno|tanti} = singolare o plurale secondo le righe
    const testo = domanda.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, uno, tanti) => (n === 1 ? uno : tanti)).replaceAll('{n}', n).replaceAll('{g}', gruppi());
    if (!window.confirm(testo)) e.preventDefault();
  });
  // tornando indietro il browser può ricordare le spunte: si ricontano
  window.addEventListener('pageshow', aggiorna);
  aggiorna();
});
