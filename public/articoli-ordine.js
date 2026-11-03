// Ordine a fornitore: nel Codice si scrive una parola ("lamina", "kapton 12", "filo 0,7") o un P/N e il menu propone
// i materiali di consumo e i componenti delle Anagrafiche (Adriano 3/11/2026). Scelto l'articolo arrivano codice nostro, descrizione
// (che resta modificabile: si completa con il prodotto per cui serve, il modello della punta…) e ultimo prezzo.
// In fondo al menu: "+ Nuovo materiale" (lo aggiunge in anagrafica con un codice nostro) e "Riga libera" (resta come scritto).
(() => {
  const modulo = document.getElementById('modulo-documento');
  if (!modulo || !modulo.querySelector('.cerca-articolo')) return;
  const campo = (riga, n) => riga?.querySelector(`[name$="[${n}]"]`);
  const pannello = document.getElementById('nuovo-materiale');
  let elenco = null, casella = null, attivo = -1, attesa = null, rigaNuovo = null;

  function chiudi() { elenco?.remove(); elenco = null; casella = null; attivo = -1; }
  function evidenzia(n) {
    const voci = elenco ? [...elenco.querySelectorAll('li:not(.vuoto)')] : [];
    if (!voci.length) return;
    attivo = (n + voci.length) % voci.length;
    voci.forEach((v, i) => v.classList.toggle('attiva', i === attivo));
    voci[attivo].scrollIntoView({ block: 'nearest' });
  }
  const euro = n => String(n).replace('.', ',') + ' €';

  function scegli(el, c) {
    const riga = el.closest('tr'), descr = campo(riga, 'descrizione'), prezzo = campo(riga, 'prezzo');
    el.value = c.codice;
    if (descr) { descr.value = c.descrizione || descr.value; descr.title = 'Dall\'anagrafica: puoi completarla per questo ordine'; }
    if (prezzo && (!prezzo.value.trim() || prezzo.dataset.listino) && c.prezzo != null) {
      prezzo.value = String(c.prezzo).replace('.', ',');
      prezzo.dataset.listino = '1';
      prezzo.title = `Ultimo acquisto${c.fornitore ? ' da ' + c.fornitore : ''}`;
    }
    chiudi();
    el.dispatchEvent(new Event('change', { bubbles: true }));   // salvataggio automatico della bozza
    campo(riga, 'quantita')?.focus();
  }

  function apriNuovo(el, categoria) {
    chiudi();
    if (!pannello) return;
    rigaNuovo = el.closest('tr');
    const descr = campo(rigaNuovo, 'descrizione')?.value.trim();
    const scritto = el.value.trim().toUpperCase();
    document.getElementById('nm-descrizione').value = (descr || scritto).toUpperCase();
    if (categoria) document.getElementById('nm-categoria').value = categoria;
    document.getElementById('nm-esito').textContent = '';
    pannello.hidden = false;
    pannello.scrollIntoView({ block: 'nearest' });
    document.getElementById('nm-descrizione').focus();
  }
  pannello?.addEventListener('keydown', e => {   // Invio nel riquadro aggiunge il materiale (non manda il modulo dell'ordine)
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('nm-aggiungi').click(); }
    if (e.key === 'Escape') { e.preventDefault(); document.getElementById('nm-annulla').click(); }
  });
  document.getElementById('nm-annulla')?.addEventListener('click', () => { pannello.hidden = true; rigaNuovo = null; });
  document.getElementById('nm-aggiungi')?.addEventListener('click', async () => {
    const esito = document.getElementById('nm-esito');
    const corpo = new URLSearchParams({ descrizione: document.getElementById('nm-descrizione').value,
      categoria: document.getElementById('nm-categoria').value, um: document.getElementById('nm-um').value });
    const res = await fetch('/anagrafiche/materiali/nuovo-riga', { method: 'POST', body: corpo }).catch(() => null);
    const m = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !m?.codice) { esito.textContent = m?.errore ?? 'Materiale non aggiunto: riprova.'; return; }
    pannello.hidden = true;
    if (rigaNuovo) scegli(campo(rigaNuovo, 'codice'), { ...m, prezzo: null });
    rigaNuovo = null;
  });

  function apri(el, voci, categoria) {
    chiudi();
    elenco = document.createElement('ul');
    elenco.className = 'elenco-trovati';
    casella = el;
    const aggiungi = (li, azione) => { li.addEventListener('mousedown', ev => { ev.preventDefault(); azione(); }); elenco.appendChild(li); };
    for (const c of voci) {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = c.codice;
      const tipo = document.createElement('span'); tipo.className = 'tipo-articolo';
      tipo.textContent = [c.categoria, c.prezzo != null ? `ultimo ${euro(c.prezzo)}${c.fornitore ? ' ' + c.fornitore : ''}` : ''].filter(Boolean).join(' · ');
      li.append(b, document.createTextNode(c.descrizione ? ' ' + c.descrizione : ''), tipo);
      li.title = c.descrizione ?? '';
      aggiungi(li, () => scegli(el, c));
    }
    const scritto = el.value.trim().toUpperCase();
    const nuovo = document.createElement('li'); nuovo.className = 'nuovo';
    nuovo.textContent = `+ Nuovo materiale${scritto ? ' «' + scritto + '»' : ''}: aggiungilo in anagrafica`;
    aggiungi(nuovo, () => apriNuovo(el, categoria));
    const libero = document.createElement('li'); libero.className = 'libero';
    libero.textContent = `Riga libera: tieni «${scritto}» come scritto`;
    aggiungi(libero, () => { chiudi(); campo(el.closest('tr'), 'descrizione')?.focus(); });
    if (!voci.length) { const v = document.createElement('li'); v.className = 'vuoto'; v.textContent = 'Niente in anagrafica con queste parole.'; elenco.prepend(v); }
    const r = el.getBoundingClientRect();
    Object.assign(elenco.style, { left: `${r.left + window.scrollX}px`, top: `${r.bottom + window.scrollY}px`, minWidth: `${Math.max(r.width, 420)}px` });
    document.body.appendChild(elenco);
    evidenzia(0);
  }

  modulo.addEventListener('input', e => {
    const el = e.target;
    if (!el.classList?.contains('cerca-articolo')) return;
    clearTimeout(attesa);
    attesa = setTimeout(async () => {
      const t = el.value.trim();
      if (t.length < 2) { chiudi(); return; }
      const res = await fetch('/anagrafiche/materiali/cerca?q=' + encodeURIComponent(t)).catch(() => null);
      const j = res?.ok ? await res.json().catch(() => null) : null;
      if (document.activeElement === el && el.value.trim() === t) apri(el, (j?.voci ?? []).filter(c => c.codice), j?.categoria);
    }, 250);
  });
  modulo.addEventListener('keydown', e => {
    if (!elenco || e.target !== casella) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); evidenzia(attivo + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); evidenzia(attivo - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
    else if (e.key === 'Enter') {   // Invio sceglie la voce evidenziata (non manda il modulo)
      e.preventDefault();
      elenco.querySelectorAll('li:not(.vuoto)')[attivo]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }
  });
  modulo.addEventListener('focusout', e => {
    if (e.target === casella) setTimeout(() => { if (document.activeElement !== casella) chiudi(); }, 150);
  });
  window.addEventListener('resize', chiudi);
})();
