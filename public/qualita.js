// Qualità → Carica i dati dal Drive (file qualita_esempio.json.gz preparato da Claude)
(() => {
  const b = document.getElementById('carica-qualita');
  if (!b) return;
  b.addEventListener('click', async () => {
    const f = document.getElementById('file-qualita').files[0];
    const out = document.getElementById('esito-qualita');
    if (!f) { out.textContent = 'Scegli prima il file.'; return; }
    b.disabled = true; out.textContent = 'Caricamento…';
    const res = await fetch('/qualita/importa', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await res.json().catch(() => ({}));
    b.disabled = false;
    if (!res.ok) { out.textContent = j.errore || 'Errore'; return; }
    out.textContent = `Fatto: ${j.aggiunte} righe aggiunte, ${j.aggiornate} aggiornate.` + (j.scartate.length ? ` Non caricate: ${j.scartate.slice(0, 5).join(' · ')}.` : '') + ' Ricarico la pagina…';
    setTimeout(() => location.reload(), 1500);
  });
})();
