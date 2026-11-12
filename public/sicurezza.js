// Sicurezza → Schede di sicurezza: carica uno o più PDF (nuove schede) o sostituisce il PDF di una scheda (data-id)
(() => {
  const b = document.getElementById('carica-sds');
  if (!b) return;
  b.addEventListener('click', async () => {
    const input = document.getElementById('file-sds');
    const out = document.getElementById('esito-sds');
    const files = [...input.files];
    if (!files.length) { out.textContent = 'Scegli prima il file.'; return; }
    const id = b.dataset.id;
    b.disabled = true;
    const errori = []; let ultimo = null; let fatti = 0;
    for (const f of files) {
      out.textContent = `Carico ${f.name}… (${fatti + 1} di ${files.length})`;
      const res = await fetch(id ? `/sicurezza/schede/${id}/file` : '/sicurezza/schede/carica', {
        method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream', 'x-nome-file': encodeURIComponent(f.name) },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) errori.push(j.errore || `${f.name}: errore`); else { fatti++; ultimo = j.id; }
    }
    b.disabled = false;
    out.textContent = `Caricati ${fatti} file.` + (errori.length ? ` Non caricati: ${errori.join(' · ')}` : '');
    if (!errori.length) setTimeout(() => { location.href = id ? `/sicurezza/schede/${id}?msg=PDF+sostituito.` : fatti === 1 ? `/sicurezza/schede/${ultimo}?msg=Scheda+caricata:+controlla+nome+e+parole+e+salva.` : '/sicurezza/schede?msg=Schede+caricate.'; }, 800);
  });
})();
