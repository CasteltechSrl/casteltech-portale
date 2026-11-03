// Ordinare gli elenchi cliccando l'intestazione della colonna (Adriano 3/11/2026), caricato in ogni pagina.
// Primo clic = crescente (A→Z, dal più vecchio, dal più piccolo), secondo = decrescente, terzo = ordine di partenza.
// Le celle vuote vanno sempre in fondo. La scelta resta nel browser per quella pagina (localStorage).
// Valori riconosciuti: date gg/mm/aaaa, numeri di documento 12/2026, numeri all'italiana (1.050 · 2.456,40 € · -31 gg · 12 %),
// il resto come testo (maiuscole, accenti non contano; "C2026-9" prima di "C2026-10").
// Tabelle escluse da sole: senza <thead>, con più di un <tbody>, intestazioni unite (colspan), righe di gruppo in mezzo,
// caselle da compilare legate a un modulo che contiene la tabella (righe dei documenti, rientro, fasi: l'ordine delle righe conta).
// Si includono comunque con data-ordina (Clienti, Prodotti: ogni riga si salva da sola) e si escludono con data-non-ordinare.
// Una cella può dare il valore da usare con data-valore. Test in tests/ordina-tabelle.test.ts.
(() => {
  const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2}))?(?![\d/])/;   // anche con altro dopo: «15/10/2026 (3 consegne)»
  const RE_NUMERO_DOC = /^(\d+)\/(\d{4})$/;
  const RE_NUMERO = /^([-+−]?)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(?:€|%|gg|g|h|pz|pezzi|min|kg|mm|ore)?$/i;

  /** Valore per l'ordinamento: { tipo: 'vuoto' | 'data' | 'numero' | 'testo', v }. */
  function chiave(testo) {
    const t = String(testo ?? '').replace(/\s+/g, ' ').trim();
    if (!t || t === '—' || t === '-' || t === '–') return { tipo: 'vuoto', v: 0 };
    let m = RE_DATA.exec(t);
    if (m) return { tipo: 'data', v: Number(m[3]) * 1e8 + Number(m[2]) * 1e6 + Number(m[1]) * 1e4 + Number(m[4] ?? 0) * 100 + Number(m[5] ?? 0) };
    m = RE_NUMERO_DOC.exec(t);
    if (m) return { tipo: 'data', v: Number(m[2]) * 1e8 + Number(m[1]) };   // stesso anno: per numero
    m = RE_NUMERO.exec(t);
    if (m) {
      const n = Number(m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : ''));
      return { tipo: 'numero', v: m[1] === '-' || m[1] === '−' ? -n : n };
    }
    return { tipo: 'testo', v: t };
  }

  const confrontoTesto = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

  /** Confronto di due valori di `chiave`; `verso` 1 = crescente, -1 = decrescente; vuoti sempre in fondo. */
  function confronta(a, b, verso) {
    if (a.tipo === 'vuoto' || b.tipo === 'vuoto') return a.tipo === b.tipo ? 0 : a.tipo === 'vuoto' ? 1 : -1;
    // numeri e date insieme a testo nella stessa colonna: prima i numeri, poi il testo
    const num = x => x.tipo !== 'testo';
    if (num(a) !== num(b)) return (num(a) ? -1 : 1) * verso;
    const r = num(a) ? a.v - b.v : confrontoTesto.compare(a.v, b.v);
    return r * verso;
  }

  /** Righe ordinate (copia), stabile: a parità resta l'ordine di partenza. `valori[i]` = chiave della riga i. */
  function ordina(righe, valori, verso) {
    return righe.map((r, i) => ({ r, i })).sort((x, y) => confronta(valori[x.i], valori[y.i], verso) || x.i - y.i).map(x => x.r);
  }

  if (typeof window !== 'undefined') window.ordinaTabelle = { chiave, confronta, ordina };
  if (typeof document === 'undefined' || !document.querySelectorAll) return;

  const CAMPI = 'input:not([type=hidden]):not([type=checkbox][name=ids]), select, textarea';
  const testoCella = td => {
    if (td.dataset.valore != null) return td.dataset.valore;
    const sel = td.querySelector('select');
    if (sel) return sel.selectedOptions[0]?.textContent ?? '';
    const campo = td.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea');
    return campo ? campo.value : td.textContent;
  };
  const leggi = (chiaveMemoria) => { try { return JSON.parse(localStorage.getItem(chiaveMemoria) ?? 'null'); } catch { return null; } };
  const scrivi = (chiaveMemoria, v) => { try { v ? localStorage.setItem(chiaveMemoria, JSON.stringify(v)) : localStorage.removeItem(chiaveMemoria); } catch { /* niente memoria */ } };

  [...document.querySelectorAll('main table')].forEach((tabella, indice) => {
    if (tabella.hasAttribute('data-non-ordinare') || tabella.classList.contains('fasi') || tabella.classList.contains('rientro')) return;
    if (!tabella.tHead || tabella.tBodies.length !== 1) return;
    const intestazione = tabella.tHead.rows[tabella.tHead.rows.length - 1];
    if (!intestazione || [...intestazione.cells].some(c => c.colSpan > 1)) return;
    const corpo = tabella.tBodies[0];
    const tutte = [...corpo.rows];
    // righe fisse: "nuova riga" in cima, righe con celle unite (totali) in cima o in fondo; in mezzo = righe di gruppo → niente ordinamento
    const fissa = tr => tr.classList.contains('nuova-riga') || tr.hasAttribute('data-fisso') || [...tr.cells].some(c => c.colSpan > 1 || c.rowSpan > 1);
    let inizio = 0, fine = tutte.length;
    while (inizio < fine && fissa(tutte[inizio])) inizio++;
    while (fine > inizio && fissa(tutte[fine - 1])) fine--;
    const mobili = tutte.slice(inizio, fine);
    if (mobili.length < 2 || mobili.some(fissa)) return;
    // caselle nelle righe: si ordina solo se ognuna appartiene al modulo della sua riga (form="…" o <form> nella riga, es. Clienti,
    // Prodotti, Materiali); un modulo che contiene tutta la tabella (righe dei documenti) o caselle senza modulo = l'ordine conta
    const rigaPerRiga = c => c.form && !c.form.contains(tabella);
    if (!tabella.hasAttribute('data-ordina') && ![...corpo.querySelectorAll(CAMPI)].every(rigaPerRiga)) return;
    const partenza = [...mobili];
    const dopo = tutte.slice(fine);
    const memoria = `ordina:${location.pathname}:${tabella.id || indice}`;
    let stato = null;   // { col, verso }

    const applica = () => {
      [...intestazione.cells].forEach((th, c) => {
        th.classList.toggle('ordinata-su', stato?.col === c && stato.verso === 1);
        th.classList.toggle('ordinata-giu', stato?.col === c && stato.verso === -1);
        if (th.classList.contains('ordinabile')) th.setAttribute('aria-sort', stato?.col === c ? (stato.verso === 1 ? 'ascending' : 'descending') : 'none');
      });
      const righe = stato ? ordina(partenza, partenza.map(tr => chiave(tr.cells[stato.col] ? testoCella(tr.cells[stato.col]) : '')), stato.verso) : partenza;
      const segno = dopo[0] ?? null;
      for (const tr of righe) corpo.insertBefore(tr, segno);
    };

    [...intestazione.cells].forEach((th, c) => {
      if (!th.textContent.trim() || th.querySelector('a, input, button, select')) return;
      th.classList.add('ordinabile');
      th.tabIndex = 0;
      th.title = (th.title ? th.title + ' · ' : '') + 'Clic: ordina crescente, poi decrescente, poi come all\'inizio';
      const scegli = () => {
        stato = stato?.col !== c ? { col: c, verso: 1 } : stato.verso === 1 ? { col: c, verso: -1 } : null;
        scrivi(memoria, stato);
        applica();
      };
      th.addEventListener('click', scegli);
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(); } });
    });
    const salvato = leggi(memoria);
    if (salvato && intestazione.cells[salvato.col]?.classList.contains('ordinabile') && (salvato.verso === 1 || salvato.verso === -1)) {
      stato = salvato;
      applica();
    }
  });
})();
