// Produzione → Stoccaggio componenti (Adriano 13/11/2026): i due file degli armadi insieme, prima il riepilogo poi la conferma
(() => {
  const controlla = document.getElementById('carica-armadi');
  if (!controlla) return;
  const conferma = document.getElementById('conferma-armadi');
  const out = document.getElementById('esito-armadi');
  const SEPARATORE = '\n#=====ARCHIVIO BOBINE=====\n';
  const euro = n => n.toLocaleString('it-IT');
  async function invia(definitivo) {
    const a = document.getElementById('file-armadi-articoli').files[0];
    const b = document.getElementById('file-armadi-bobine').files[0];
    if (!a || !b) { out.textContent = 'Scegli tutti e due i file: ItemList e reel_archive.'; return; }
    controlla.disabled = conferma.disabled = true;
    out.textContent = definitivo ? 'Caricamento…' : 'Lettura dei file…';
    const corpo = new Blob([a, SEPARATORE, b]);
    const res = await fetch('/produzione/stoccaggio/carica?conferma=' + (definitivo ? 1 : 0),
      { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/octet-stream' } }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    controlla.disabled = conferma.disabled = false;
    if (!res?.ok) { out.textContent = j.errore || 'Errore nel caricamento'; conferma.hidden = true; return; }
    const testo = `${euro(j.codici)} codici con pezzi (${euro(j.pezzi)} pezzi), ${euro(j.bobine)} bobine attive`
      + (j.senzaBobine ? `, ${j.senzaBobine} codici senza bobine` : '') + `; ${euro(j.conPrezzo)} codici con un prezzo, ${euro(j.descrizioniCompletate)} descrizioni completate.`;
    if (definitivo) { out.textContent = 'Fatto: ' + testo; conferma.hidden = true; setTimeout(() => { location.href = '/produzione/stoccaggio'; }, 1200); return; }
    out.textContent = testo;
    conferma.hidden = false;
  }
  controlla.addEventListener('click', () => invia(false));
  conferma.addEventListener('click', () => invia(true));
})();
