// Ordini → Da acquisire: caricamento dei file uno alla volta (ognuno viene letto dall'IA), poi si ricarica l'elenco
(() => {
  const bottone = document.getElementById('avvia-acquisizioni');
  if (!bottone) return;
  bottone.addEventListener('click', async () => {
    const files = [...document.getElementById('file-acquisizioni').files];
    const out = document.getElementById('esito-acquisizioni');
    if (!files.length) { out.textContent = 'Scegli prima i file.'; return; }
    bottone.disabled = true;
    const esiti = [];
    for (const [i, f] of files.entries()) {
      out.textContent = `Lettura di ${f.name} (${i + 1} di ${files.length})… può servire un minuto.`;
      const res = await fetch(bottone.dataset.url || '/ordini/acquisire/carica', { method: 'POST', body: f,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Nome-File': encodeURIComponent(f.name),
          // Banca: conto dei movimenti (es. BPER)
          ...(document.getElementById('conto-banca') ? { 'X-Conto': encodeURIComponent(document.getElementById('conto-banca').value) } : {}) } }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      esiti.push(`${f.name}: ${res && res.ok ? j.stato + (j.errore ? ` (${j.errore})` : '') : j.errore || 'errore di rete'}`);
    }
    out.textContent = esiti.join(' · ');
    setTimeout(() => location.reload(), 1500);
  });
})();

// righe cliccabili dell'elenco
document.querySelectorAll('tr[data-href]').forEach(tr => {
  tr.addEventListener('click', e => { if (!e.target.closest('a, button, input, label')) location.href = tr.dataset.href; });
});

// Proposta dell'ordine (Adriano 10/11/2026): scelto un prodotto dall'anagrafica la riga diventa "schede" (un prodotto in anagrafica
// è una scheda); scelto un servizio una tantum (ut:…), la riga diventa "servizio".
// Adriano 11/11/2026 (ordini ricaricati con codici diversi da quelli del documento): il prodotto scelto a mano porta nella riga
// codice, descrizione e prezzo dell'anagrafica (prezzo dello scaglione della quantità, GET /anagrafiche/prodotti/:id/listino);
// il prezzo del documento resta scritto sotto la casella. Stessa regola di rigaDalProdottoScelto in engine/acquisizioni.ts.
(() => {
  const campo = (nome, riga) => document.getElementById(`${nome}-${riga}`);
  const numero = s => { const t = String(s ?? '').trim().replace(/\s|€/g, ''); if (!t) return null;
    const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };
  const scrivi = n => String(Math.round(n * 100000) / 100000).replace('.', ',');
  const prezzoDalListino = async (menu, riga) => {
    const prezzo = campo('prezzo', riga), nota = campo('prezzo-letto', riga);
    if (!prezzo) return;
    if (prezzo.dataset.letto === undefined) prezzo.dataset.letto = prezzo.value;    // prezzo del documento, una volta sola
    const qta = numero(campo('quantita', riga)?.value) || 1;
    const r = await fetch(`/anagrafiche/prodotti/${encodeURIComponent(menu.value)}/listino?quantita=${encodeURIComponent(String(qta))}`).catch(() => null);
    const l = r && r.ok ? await r.json().catch(() => null) : null;
    if (!l || l.prezzo == null) { if (nota) nota.textContent = ' nessun prezzo in anagrafica'; return; }
    prezzo.value = scrivi(l.prezzo);
    prezzo.dataset.dalListino = menu.value;
    const letto = numero(prezzo.dataset.letto);
    if (nota) nota.textContent = (l.scaglione ? ` scaglione ${l.scaglione}` : ' anagrafica') + (letto != null && Math.abs(letto - l.prezzo) > 0.000001 ? ` · nel documento ${scrivi(letto)}` : '');
  };
  document.addEventListener('change', e => {
    const menu = e.target.closest?.('select.scelta-prodotto-riga');
    if (menu) {
      const riga = menu.dataset.riga;
      const scelta = menu.selectedOptions[0];
      const tipo = campo('tipo', riga);
      if (!scelta || !menu.value) return;
      if (menu.value.startsWith('ut:')) {
        // servizio una tantum: codice, descrizione e prezzo proposti dal servizio, quantità 1 se vuota (Adriano 11/11/2026)
        if (tipo) tipo.value = 'servizio';
        const codice = campo('codice', riga), descrizione = campo('descrizione', riga), prezzo = campo('prezzo', riga), qta = campo('quantita', riga);
        if (codice) codice.value = scelta.dataset.codice || menu.value.slice(3);
        if (descrizione && !descrizione.value.trim() && scelta.dataset.descrizione) descrizione.value = scelta.dataset.descrizione;
        if (prezzo && !prezzo.value.trim() && scelta.dataset.prezzo) prezzo.value = scrivi(Number(scelta.dataset.prezzo));
        if (qta && !qta.value.trim()) qta.value = '1';
        return;
      }
      if (tipo) tipo.value = 'scheda';
      const codice = campo('codice', riga), descrizione = campo('descrizione', riga);
      if (codice) codice.value = scelta.dataset.codice || scelta.textContent.split(' · ')[0].trim();
      if (descrizione && (scelta.dataset.descrizione || '').trim()) descrizione.value = scelta.dataset.descrizione.trim();
      prezzoDalListino(menu, riga);
      return;
    }
    // quantità cambiata su una riga col prezzo preso dall'anagrafica: si rilegge lo scaglione
    const qta = e.target.closest?.('input[id^="quantita-"]');
    if (qta) {
      const riga = qta.id.slice('quantita-'.length);
      const menu = document.querySelector(`select.scelta-prodotto-riga[data-riga="${riga}"]`);
      if (menu && menu.value && campo('prezzo', riga)?.dataset.dalListino === menu.value) prezzoDalListino(menu, riga);
    }
  });
  // prezzo riscritto a mano: non si tocca più da solo
  document.addEventListener('input', e => { if (e.target.matches?.('input[id^="prezzo-"]')) delete e.target.dataset.dalListino; });
})();
