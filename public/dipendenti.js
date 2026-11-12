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

// Tabelle ACI (Adriano 12/11/2026): ricerca dell'auto mentre si scrive, scelta = marca, modello e tariffa nella riga; caricamento del PDF della Gazzetta.
(() => {
  const testo = document.getElementById('aci-testo');
  const lista = document.getElementById('aci-risultati');
  const per = document.getElementById('aci-per');
  let destinazione = 'v-nuova', timer = null, ultima = '';
  const campo = (nome) => document.querySelector(`[name="${nome}"][form="${destinazione}"]`);
  const virgola = (n) => String(n.toFixed(4)).replace('.', ',');
  document.querySelectorAll('.aci-per').forEach(b => b.addEventListener('click', () => {
    destinazione = b.dataset.form;
    const riga = b.closest('tr');
    if (per) per.textContent = `Il risultato scelto riempie l'auto di ${riga ? riga.cells[0].textContent.trim() : 'questa riga'}.`;
    if (testo) { testo.value = [campo('marca')?.value, campo('modello')?.value].filter(Boolean).join(' '); testo.focus(); cerca(); window.scrollTo({ top: testo.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); }
  }));
  const scegli = (r) => {
    if (campo('marca')) campo('marca').value = r.marca;
    if (campo('modello')) campo('modello').value = r.modello;
    if (campo('tariffa_km')) campo('tariffa_km').value = virgola(r.costo);
    if (campo('aci_riga')) campo('aci_riga').value = r.riga;
    const nota = campo('tariffa_km')?.closest('td')?.querySelector('.aci-scelta');
    if (nota) nota.textContent = `ACI: ${r.etichetta} — premi ${destinazione === 'v-nuova' ? 'Aggiungi' : 'Salva'}`;
    lista.innerHTML = '';
    campo('tariffa_km')?.focus();
  };
  const cerca = async () => {
    const t = testo.value.trim();
    if (t === ultima) return;
    ultima = t;
    if (t.length < 2) { lista.innerHTML = ''; return; }
    const res = await fetch(`/dipendenti/aci/cerca?q=${encodeURIComponent(t)}`).catch(() => null);
    const j = res && res.ok ? await res.json().catch(() => null) : null;
    if (!j || t !== ultima) return;
    lista.innerHTML = '';
    if (!j.righe.length) { const li = document.createElement('li'); li.className = 'nota'; li.textContent = 'Nessun modello trovato: prova con meno parole (es. solo il modello).'; lista.append(li); return; }
    for (const r of j.righe) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'link';
      b.textContent = `${r.etichetta} — ${virgola(r.costo)} €/km`;
      b.addEventListener('click', () => scegli(r));
      li.append(b); lista.append(li);
    }
  };
  if (testo) testo.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cerca, 250); });

  const carica = document.getElementById('avvia-aci');
  if (carica) carica.addEventListener('click', async () => {
    const f = document.getElementById('file-aci').files[0];
    const out = document.getElementById('esito-aci');
    if (!f) { out.textContent = 'Scegli prima il PDF della Gazzetta Ufficiale.'; return; }
    carica.disabled = true; out.textContent = 'Lettura del PDF (qualche secondo)…';
    const res = await fetch('/dipendenti/aci/carica', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    out.textContent = res && res.ok ? j.messaggio : (j.errore || 'Errore');
    carica.disabled = false;
    if (res && res.ok) setTimeout(() => location.reload(), 2000);
  });
})();
