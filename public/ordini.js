// Impostazioni → Ordini: import del file preparato dall'incrocio con Fatture in Cloud
(() => {
  const imp = document.getElementById('avvia-import-ordini');
  if (!imp) return;
  imp.addEventListener('click', async () => {
    const f = document.getElementById('file-ordini').files[0];
    const out = document.getElementById('esito-import-ordini');
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    imp.disabled = true; out.textContent = 'Import in corso…';
    const res = await fetch('/impostazioni/ordini/importa', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const fuori = [];
      if (j.clientiNonInAnagrafica.length) fuori.push(`clienti non in anagrafica: ${j.clientiNonInAnagrafica.join(', ')}`);
      if (j.prodottiNonInAnagrafica.length) fuori.push(`${j.prodottiNonInAnagrafica.length} prodotti non in anagrafica: ${j.prodottiNonInAnagrafica.join('; ')}`);
      out.textContent = `Fatto: ${j.ordini} ordini${j.ordiniTolti ? ` (${j.ordiniTolti} tolti perché non più nel file)` : ''}, ${j.righe} righe, ${j.ddt} righe di DDT, ${j.fatture} righe di fattura.` + (fuori.length ? ' ' + fuori.join('. ') + '.' : '');
    } else out.textContent = j.errore || 'Errore';
    imp.disabled = false;
  });
})();
