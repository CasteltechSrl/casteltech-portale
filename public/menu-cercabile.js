// Menu lunghi con la casella "cerca" (Adriano 9/11/2026, ordini da e-mail e PDF: scegliere un prodotto già in anagrafica).
// Ogni <select class="cercabile"> riceve sopra una casella: scrivendo codice o parole della descrizione il menu mostra solo
// le voci che corrispondono (accenti, trattini e spazi dei codici non contano); con una sola voce trovata la sceglie da sola.
// Le voci senza valore ("— cerca dal codice —", "— senza codice —") restano sempre.
(() => {
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const compatto = s => s.replace(/[^a-z0-9]/g, '');
  const corrisponde = (testo, cerca) => {
    const t = norm(testo), tc = compatto(t);
    return norm(cerca).split(/\s+/).filter(Boolean).every(p => t.includes(p) || (compatto(p) !== '' && tc.includes(compatto(p))));
  };
  const testoVoce = o => `${o.textContent} ${o.dataset.codice ?? ''} ${o.dataset.descrizione ?? ''}`;
  for (const menu of document.querySelectorAll('select.cercabile')) {
    if (menu.disabled || menu.dataset.cercaPronta) continue;
    menu.dataset.cercaPronta = '1';
    const casella = document.createElement('input');
    casella.type = 'search';
    casella.className = 'cerca-menu';
    casella.placeholder = '🔍 cerca prodotto (codice o descrizione)…';
    casella.setAttribute('aria-label', 'Cerca nel menu dei prodotti');
    casella.autocomplete = 'off';
    menu.before(casella);
    const voci = [...menu.options];
    const filtra = () => {
      const cerca = casella.value.trim();
      const trovate = [];
      for (const o of voci) {
        const fissa = o.value === '' || o.value === 'nuovo';
        const si = fissa || !cerca || corrisponde(testoVoce(o), cerca);
        o.hidden = !si;
        if (si && !fissa && cerca) trovate.push(o);
      }
      for (const g of menu.querySelectorAll('optgroup')) g.hidden = ![...g.children].some(o => !o.hidden);
      // una sola voce trovata: scelta da sola
      if (trovate.length === 1 && menu.value !== trovate[0].value) {
        menu.value = trovate[0].value;
        menu.dispatchEvent(new Event('change', { bubbles: true }));
      }
      casella.title = cerca ? `${trovate.length} trovati` : '';
    };
    casella.addEventListener('input', filtra);
    casella.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); menu.focus(); }       // Invio non manda il modulo: si passa al menu
      if (e.key === 'Escape') { casella.value = ''; filtra(); }
    });
  }
})();
