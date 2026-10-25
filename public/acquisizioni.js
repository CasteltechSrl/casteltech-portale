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
      const res = await fetch('/ordini/acquisire/carica', { method: 'POST', body: f,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Nome-File': encodeURIComponent(f.name) } }).catch(() => null);
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
