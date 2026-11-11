// Sezione Quotazioni (ex Componenti): caricamento BOM, avanzamento dell'elaborazione, filtri della tabella, import archivio.
(() => {
  // caricamento della BOM (il file va al server così com'è)
  const invia = document.getElementById('invia-bom');
  if (invia) invia.addEventListener('click', async () => {
    const f = document.getElementById('file-bom').files[0];
    const esito = document.getElementById('esito-bom');
    if (!f) { esito.textContent = 'Scegli prima il file.'; return; }
    invia.disabled = true; esito.textContent = 'Caricamento…';
    // Anagrafiche → Componenti → Codifica una BOM: senza quantità e senza prezzi (data-solo="1")
    const qta = document.getElementById('quantita-bom');
    const par = new URLSearchParams({ file: f.name, nome: document.getElementById('nome-bom').value, quantita: qta ? qta.value : '' });
    if (invia.dataset.solo === '1') par.set('solo', '1');
    const res = await fetch('/quotazioni/bom?' + par, { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { esito.textContent = j.errore || 'Errore nel caricamento'; invia.disabled = false; return; }
    location.href = '/quotazioni/bom/' + j.id;
  });

  // avanzamento: si ricarica la pagina a fine elaborazione
  const av = document.getElementById('avanzamento');
  if (av) {
    const segui = async () => {
      const s = await (await fetch(`/quotazioni/bom/${av.dataset.id}/stato`)).json().catch(() => null);
      if (s && s.inCorso) {
        av.textContent = `Elaborazione in corso: ${s.fase}${s.totale ? ` (${s.fatti} di ${s.totale})` : ''}…`;
        setTimeout(segui, 1500);
      } else location.reload();
    };
    setTimeout(segui, 800);
  }

  // filtri della tabella
  const filtri = document.getElementById('filtri');
  const applicaFiltro = b => {
    filtri.querySelectorAll('button').forEach(x => x.classList.toggle('attivo', x === b));
    const voluti = b.dataset.filtro.split(' ').filter(Boolean);
    document.querySelectorAll('table.bom tbody tr').forEach(tr => {
      const classi = tr.dataset.classi.split(' ');
      tr.hidden = voluti.length > 0 && !voluti.some(v => classi.includes(v));
    });
    // il riquadro dei prezzi mancanti si vede solo con il filtro "Senza prezzo" (Adriano 5/11/2026)
    const riquadro = document.getElementById('da-prezzare');
    if (riquadro) riquadro.hidden = b.dataset.filtro !== 'da-prezzare';
    // filtro ricordato per questa BOM: "← Torna alla BOM" dalla riga lo rimette (Adriano 11/11/2026)
    try { sessionStorage.setItem('filtro-bom:' + location.pathname, b.dataset.filtro); } catch { /* niente memoria del browser */ }
  };
  // ritorno dalla pagina di una riga (#riga-N): stesso filtro di prima e stessa posizione;
  // se la riga ora non rientra nel filtro (es. completata) si va alla riga visibile più vicina
  const tornaAllaRiga = () => {
    const m = /^#riga-(\d+)$/.exec(location.hash);
    if (!filtri || !m) return;
    let filtro = null;
    try { filtro = sessionStorage.getItem('filtro-bom:' + location.pathname); } catch { /* niente */ }
    const b = filtro != null ? [...filtri.querySelectorAll('button')].find(x => x.dataset.filtro === filtro) : null;
    if (b) applicaFiltro(b);
    const riga = document.getElementById('riga-' + m[1]);
    if (!riga) return;
    let vai = riga;
    if (vai.hidden) {
      let x = riga.nextElementSibling; while (x && x.hidden) x = x.nextElementSibling;
      if (!x) { x = riga.previousElementSibling; while (x && x.hidden) x = x.previousElementSibling; }
      vai = x || filtri;
    }
    vai.scrollIntoView({ block: 'center' });
    vai.classList.add('riga-tornata');
    setTimeout(() => vai.classList.remove('riga-tornata'), 2500);
  };
  if (filtri) {
    filtri.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applicaFiltro(b); });
    // dopo "Salva" di un prezzo nel riquadro si torna con #da-prezzare: filtro di nuovo attivo
    const daPrezzare = filtri.querySelector('button[data-filtro="da-prezzare"]');
    const apriSeChiesto = () => { if (daPrezzare && location.hash === '#da-prezzare') { applicaFiltro(daPrezzare); document.getElementById('da-prezzare')?.scrollIntoView(); } };
    apriSeChiesto();
    window.addEventListener('hashchange', apriSeChiesto);
    tornaAllaRiga();
  }

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
