// Pagina Impostazioni → Importa: invia il file e mostra l'avanzamento
(() => {
  const out = document.getElementById('stato-import');
  const bottone = document.getElementById('avvia-import');
  const mostra = s => {
    out.textContent = s.finito
      ? `Finito: ${s.importati} importati, ${s.saltati} già presenti${s.errori?.length ? `, ${s.errori.length} con errori: ${s.errori.slice(0, 5).join(' · ')}` : ''}.`
      : `Import in corso… ${s.fatti} di ${s.totale}`;
  };
  async function segui() {
    const s = await (await fetch('/impostazioni/importa/stato')).json();
    mostra(s);
    if (!s.finito) setTimeout(segui, 1500); else bottone.disabled = false;
  }
  bottone.addEventListener('click', async () => {
    const f = document.getElementById('file-import').files[0];
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    bottone.disabled = true;
    out.textContent = 'Caricamento del file…';
    const res = await fetch('/impostazioni/importa', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { out.textContent = j.errore || 'Errore'; bottone.disabled = false; return; }
    segui();
  });
})();

document.querySelectorAll('input.maiuscolo').forEach(el => el.addEventListener('input', () => { el.value = el.value.toUpperCase(); }));
