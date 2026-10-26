// Sezione Componenti: caricamento BOM, avanzamento dell'elaborazione, filtri della tabella, import archivio.
(() => {
  // caricamento della BOM (il file va al server così com'è)
  const invia = document.getElementById('invia-bom');
  if (invia) invia.addEventListener('click', async () => {
    const f = document.getElementById('file-bom').files[0];
    const esito = document.getElementById('esito-bom');
    if (!f) { esito.textContent = 'Scegli prima il file.'; return; }
    invia.disabled = true; esito.textContent = 'Caricamento…';
    const par = new URLSearchParams({ file: f.name, nome: document.getElementById('nome-bom').value, quantita: document.getElementById('quantita-bom').value });
    const res = await fetch('/componenti/bom?' + par, { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { esito.textContent = j.errore || 'Errore nel caricamento'; invia.disabled = false; return; }
    location.href = '/componenti/bom/' + j.id;
  });

  // avanzamento: si ricarica la pagina a fine elaborazione
  const av = document.getElementById('avanzamento');
  if (av) {
    const segui = async () => {
      const s = await (await fetch(`/componenti/bom/${av.dataset.id}/stato`)).json().catch(() => null);
      if (s && s.inCorso) {
        av.textContent = `Elaborazione in corso: ${s.fase}${s.totale ? ` (${s.fatti} di ${s.totale})` : ''}…`;
        setTimeout(segui, 1500);
      } else location.reload();
    };
    setTimeout(segui, 800);
  }

  // filtri della tabella
  const filtri = document.getElementById('filtri');
  if (filtri) filtri.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filtri.querySelectorAll('button').forEach(x => x.classList.toggle('attivo', x === b));
    const voluti = b.dataset.filtro.split(' ').filter(Boolean);
    document.querySelectorAll('table.bom tbody tr').forEach(tr => {
      const classi = tr.dataset.classi.split(' ');
      tr.hidden = voluti.length > 0 && !voluti.some(v => classi.includes(v));
    });
  });

  document.querySelectorAll('form.conferma-elimina').forEach(f => f.addEventListener('submit', e => {
    const n = Number(f.dataset.preventivi) || 0;
    const usata = n ? `\n\nÈ collegata a ${n} preventiv${n === 1 ? 'o' : 'i'}: il costo componenti già scritto resta, ma non si aggiornerà più dalla BOM.` : '';
    if (!confirm('Eliminare questa BOM e il suo risultato? L\'archivio componenti non cambia.' + usata)) e.preventDefault();
  }));

  // Impostazioni → Componenti: import dell'archivio
  const imp = document.getElementById('avvia-import-componenti');
  if (imp) imp.addEventListener('click', async () => {
    const f = document.getElementById('file-componenti').files[0];
    const out = document.getElementById('esito-import-componenti');
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    imp.disabled = true; out.textContent = 'Import in corso…';
    const res = await fetch('/impostazioni/componenti/importa', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    out.textContent = res.ok ? `Fatto: ${j.importati} componenti importati, ${j.saltati} già presenti o vuoti.` : (j.errore || 'Errore');
    imp.disabled = false;
  });
})();
