// Anagrafiche: ricerca veloce, l'elenco si filtra mentre si scrive (stessa regola di src/engine/ricerca.ts).
// La ricerca resta scritta tornando sulla pagina (es. dopo "Salva"); Esc la cancella.
(() => {
  const casella = document.querySelector('input[data-filtra]');
  if (!casella) return;
  const tabella = document.getElementById(casella.dataset.filtra);
  const conta = document.getElementById(casella.dataset.conta);
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const compatto = s => s.replace(/[^a-z0-9]/g, '');
  const corrisponde = (testo, cerca) => {
    const riga = norm(testo), rigaCompatta = compatto(riga);
    return norm(cerca).split(/\s+/).filter(Boolean).every(p => riga.includes(p) || (compatto(p) !== '' && rigaCompatta.includes(compatto(p))));
  };
  // testo della riga: celle, valori delle caselle e, delle tendine, solo la voce scelta (non tutto l'elenco dei clienti)
  const testoCella = td => td.querySelector('select') ? [...td.querySelectorAll('select')].map(s => s.selectedOptions[0]?.textContent ?? '').join(' ')
    : [td.textContent, ...[...td.querySelectorAll('input:not([type=hidden]), textarea')].map(i => i.value)].join(' ');
  const testoRiga = tr => [...tr.cells].map(testoCella).join(' ');
  const righe = [...tabella.querySelectorAll('tbody tr:not(.nuova-riga)')];
  const chiave = 'ricerca:' + location.pathname;
  const filtra = () => {
    const cerca = casella.value.trim();
    let n = 0;
    for (const tr of righe) { const si = !cerca || corrisponde(testoRiga(tr), cerca); tr.hidden = !si; if (si) n++; }
    if (conta) conta.textContent = cerca ? `${n} di ${righe.length}` : String(righe.length);
    try { sessionStorage.setItem(chiave, casella.value); } catch { /* niente memoria: pazienza */ }
  };
  try { if (!casella.value) casella.value = sessionStorage.getItem(chiave) ?? ''; } catch { /* idem */ }
  casella.addEventListener('input', filtra);
  casella.addEventListener('keydown', e => { if (e.key === 'Escape') { casella.value = ''; filtra(); } if (e.key === 'Enter') e.preventDefault(); });
  filtra();
})();
