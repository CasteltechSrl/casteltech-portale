// Ricerca unica in alto (1/11/2026): la casella nella testata trova clienti, codici, commesse, ordini, documenti…
// - tasto "/" (fuori dalle caselle di testo) oppure Ctrl+K / Cmd+K: porta il cursore nella casella;
// - mentre si scrive (dopo 0,25 s di pausa) compaiono le prime voci sotto la casella: frecce su/giù, Invio apre la voce
//   evidenziata (o, senza voce, la pagina dei risultati), Esc chiude; clic fuori chiude;
// - Invio con il testo di un numero preciso (es. C2026-0012) va dritto alla pagina: lo decide il server (/cerca).
(() => {
  const modulo = document.querySelector('form.cerca-globale');
  if (!modulo) return;
  const casella = modulo.querySelector('input[name=q]');
  const tendina = modulo.querySelector('.suggerimenti-ricerca');
  let timer = 0, ultimaRichiesta = 0, voci = [], scelta = -1;

  const inCasellaDiTesto = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  document.addEventListener('keydown', e => {
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); casella.focus(); casella.select(); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !inCasellaDiTesto(document.activeElement)) { e.preventDefault(); casella.focus(); casella.select(); }
  });

  const chiudi = () => { tendina.hidden = true; tendina.innerHTML = ''; voci = []; scelta = -1; };
  const evidenzia = () => [...tendina.querySelectorAll('a')].forEach((a, i) => a.classList.toggle('scelta', i === scelta));
  const mostra = () => {
    tendina.innerHTML = '';
    if (voci.length === 0) { chiudi(); return; }
    for (const v of voci) {
      const a = document.createElement('a');
      a.href = v.href;
      const tipo = document.createElement('span'); tipo.className = 'tipo'; tipo.textContent = v.tipo;
      const titolo = document.createElement('b'); titolo.textContent = v.titolo;
      a.append(tipo, titolo);
      if (v.dettaglio) { const d = document.createElement('span'); d.className = 'dettaglio'; d.textContent = v.dettaglio; a.append(d); }
      tendina.append(a);
    }
    const tutti = document.createElement('a');
    tutti.href = '/cerca?elenco=1&q=' + encodeURIComponent(casella.value.trim());
    tutti.className = 'tutti'; tutti.textContent = 'Tutti i risultati…';
    tendina.append(tutti);
    tendina.hidden = false;
    scelta = -1;
  };
  const cerca = async () => {
    const testo = casella.value.trim();
    if (testo.length < 2) { chiudi(); return; }
    const n = ++ultimaRichiesta;
    try {
      const r = await fetch('/cerca?formato=json&q=' + encodeURIComponent(testo), { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const dati = await r.json();
      if (n !== ultimaRichiesta || document.activeElement !== casella) return;   // è arrivata dopo una ricerca più nuova
      voci = dati.risultati || [];
      mostra();
    } catch { /* rete assente: resta il tasto Invio */ }
  };
  casella.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(cerca, 250); });
  casella.addEventListener('focus', () => { if (casella.value.trim().length >= 2 && voci.length) tendina.hidden = false; });
  casella.addEventListener('keydown', e => {
    const link = [...tendina.querySelectorAll('a')];
    if (e.key === 'Escape') { if (tendina.hidden) { casella.value = ''; casella.blur(); } else chiudi(); return; }
    if (tendina.hidden || link.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); scelta = (scelta + 1) % link.length; evidenzia(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); scelta = (scelta - 1 + link.length) % link.length; evidenzia(); }
    else if (e.key === 'Enter' && scelta >= 0) { e.preventDefault(); location.href = link[scelta].href; }
  });
  document.addEventListener('pointerdown', e => { if (!modulo.contains(e.target)) chiudi(); });
  modulo.addEventListener('submit', () => { clearTimeout(timer); chiudi(); });
})();
