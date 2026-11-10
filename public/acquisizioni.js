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

// Proposta dell'ordine (Adriano 10/11/2026): scelto un prodotto dall'anagrafica, il codice letto vuoto prende quello del prodotto
// e la riga diventa "schede" (un prodotto in anagrafica è una scheda); scelto un servizio una tantum (ut:…), la riga diventa "servizio".
document.addEventListener('change', e => {
  const menu = e.target.closest?.('select.scelta-prodotto-riga');
  if (!menu) return;
  const riga = menu.dataset.riga;
  const codice = document.getElementById(`codice-${riga}`);
  const tipo = document.getElementById(`tipo-${riga}`);
  const scelta = menu.selectedOptions[0];
  if (!scelta || !menu.value) return;
  if (menu.value.startsWith('ut:')) { if (tipo) tipo.value = 'servizio'; return; }
  if (tipo) tipo.value = 'scheda';
  if (codice && !codice.value.trim()) codice.value = scelta.textContent.split(' · ')[0].trim();
});
