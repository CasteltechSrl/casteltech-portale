// Dipendenti: import del modulo rimborso km, storico dei costi (anteprima poi conferma), km dalla destinazione nella nota spese.
(() => {
  const invia = async (url, file) => {
    const res = await fetch(url, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    return { ok: !!res && res.ok, j };
  };

  const km = document.getElementById('avvia-km');
  if (km) km.addEventListener('click', async () => {
    const f = document.getElementById('file-km').files[0];
    const out = document.getElementById('esito-km');
    if (!f) { out.textContent = 'Scegli prima il file Excel.'; return; }
    km.disabled = true; out.textContent = 'Importazione…';
    const { ok, j } = await invia('/dipendenti/note-spese/importa', f);
    out.textContent = ok ? j.messaggio : (j.errore || 'Errore');
    km.disabled = false;
    if (ok) setTimeout(() => { location.href = `/dipendenti/note-spese?anno=${j.anno}`; }, 2500);
  });

  const storico = document.getElementById('avvia-storico');
  if (storico) storico.addEventListener('click', async () => {
    const f = document.getElementById('file-storico').files[0];
    const out = document.getElementById('esito-storico');
    if (!f) { out.textContent = 'Scegli prima il file costi_personale.json.gz.'; return; }
    storico.disabled = true; out.textContent = 'Controllo del file…';
    const prova = await invia('/dipendenti/riservata/storico', f);
    if (!prova.ok) { out.textContent = prova.j.errore || 'Errore'; storico.disabled = false; return; }
    if (!confirm(prova.j.messaggio)) { out.textContent = 'Annullato.'; storico.disabled = false; return; }
    const fatto = await invia('/dipendenti/riservata/storico?conferma=1', f);
    out.textContent = fatto.ok ? fatto.j.messaggio : (fatto.j.errore || 'Errore');
    if (fatto.ok) setTimeout(() => location.reload(), 1500);
    storico.disabled = false;
  });

  // nota spese: scegliendo una destinazione dell'elenco, i km di andata si scrivono da soli (se vuoti)
  const elenco = document.getElementById('destinazioni');
  if (elenco) {
    const kmDi = new Map([...elenco.options].map(o => [o.value, o.dataset.km]));
    document.querySelectorAll('input.destinazione').forEach(inp => inp.addEventListener('change', () => {
      const casella = inp.closest('tr').querySelector('input.km-andata');
      const v = kmDi.get(inp.value.toUpperCase());
      if (casella && v && !casella.value) casella.value = String(v).replace('.', ',');
    }));
  }

  // righe cliccabili
  document.querySelectorAll('tr[data-href]').forEach(tr => {
    tr.addEventListener('click', e => { if (!e.target.closest('a, button, input, label')) location.href = tr.dataset.href; });
  });
  document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => { el.value = el.value.toUpperCase(); }));
})();
